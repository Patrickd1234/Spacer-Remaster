import { useState } from "react"
import {
    summarizeDepartments, projectDelayStatus, delayCulprits, culpritHeadline, delayingTasks,
    departmentNote, daysBetween, DEPARTMENT_STATUS,
} from "../crossDepartment"
import { nudgeDepartment, setDepartmentSignOff } from "../crossDepartmentData"
import { cancelDepartmentInvite } from "../departmentInvitesData"

// Colours per status tone (the light theme remaps these text colours to deep inks)
const TONES = {
    green: { pill: "bg-green-500/15 text-green-400", bar: "bg-green-500", text: "text-muted", card: "border-line" },
    amber: { pill: "bg-amber-500/15 text-amber-400", bar: "bg-amber-400", text: "text-amber-400", card: "border-line" },
    red: { pill: "bg-red-500/15 text-red-400", bar: "bg-red-400", text: "text-red-400", card: "border-red-400/60" },
    muted: { pill: "bg-line text-soft", bar: "bg-line-strong", text: "text-muted", card: "border-line" },
}
const PROJECT_STATUS = {
    on_track: { label: "On track", tone: "green" },
    at_risk: { label: "At risk", tone: "amber" },
    delayed: { label: "Delayed", tone: "red" },
    done: { label: "Done", tone: "muted" },
}

const formatDay = (value, withYear = false) => {
    if (!value) return ""
    const [y, m, d] = String(value).slice(0, 10).split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", ...(withYear ? { year: "numeric" } : {}) })
}
const Heading = ({ children }) => <h3 className="text-[11px] font-bold uppercase tracking-wider text-accent-ink mb-sm">{children}</h3>
const Pill = ({ tone, children }) => <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${TONES[tone].pill}`}>{children}</span>

// The Departments tab of a cross-department project (design screen 2): who is
// holding the project up, progress per department, who waits on whom, and the
// tasks behind the delay, and invites still waiting for an answer.
// `departments`: the ones working on it; `invitedDepartments`: status "invited".
// `canManage`: the server's can_manage_project.
export default function DepartmentsTab({ projectId, projectDueDate, departments, invitedDepartments = [], tasks, orgUsers, currentUserId, canManage, onResolve, onOpenTask, onDepartmentsChanged }) {
    const [notice, setNotice] = useState(null)
    const [busyId, setBusyId] = useState(null)
    const now = new Date()
    const summaries = summarizeDepartments({ departments, tasks, now })
    const nameOf = (id) => summaries.find((s) => s.id === String(id))?.name || "Another department"
    const overall = PROJECT_STATUS[projectDelayStatus(summaries, projectDueDate, now)]
    const culprit = delayCulprits(summaries)[0]
    const headline = culprit ? culpritHeadline(culprit, summaries, tasks, now) : null
    const causes = delayingTasks(tasks, summaries, now)
    const links = summaries.flatMap((s) => s.waitingOn.map((link) => ({ from: s.id, ...link })))
    const daysLeft = projectDueDate ? daysBetween(now, projectDueDate) : null
    const isDepartmentLead = departments.some((d) => d.lead_id && d.lead_id === currentUserId)
    const canNudge = canManage || isDepartmentLead

    const nudge = async (summary) => {
        setBusyId(summary.id)
        const { error } = await nudgeDepartment(projectId, summary.team_space_id)
        setBusyId(null)
        setNotice(error ? { isError: true, text: error } : { isError: false, text: `${summary.name}'s lead has been nudged.` })
    }
    const cancelInvite = async (department) => {
        setBusyId(department.team_space_id)
        const { error } = await cancelDepartmentInvite(projectId, department.team_space_id)
        setBusyId(null)
        setNotice(error ? { isError: true, text: error } : { isError: false, text: `The invite to ${department.name} was cancelled.` })
        if (!error) onDepartmentsChanged?.()
    }
    const signOff = async (summary, isSignedOff) => {
        setBusyId(summary.id)
        const { error } = await setDepartmentSignOff(projectId, summary.team_space_id, isSignedOff)
        setBusyId(null)
        if (error) setNotice({ isError: true, text: error })
        else onDepartmentsChanged?.()
    }

    return (
        <div className="space-y-lg">
            <div className="flex items-center justify-between gap-md flex-wrap">
                <p className="text-sm text-soft">
                    {projectDueDate ? `Due ${formatDay(projectDueDate, true)}` : "No overall deadline"}
                    {daysLeft !== null && ` · ${daysLeft >= 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : `${-daysLeft} day${daysLeft === -1 ? "" : "s"} past`}`}
                    {` · ${departments.length} department${departments.length === 1 ? "" : "s"}`}
                </p>
                <Pill tone={overall.tone}>{overall.label.toUpperCase()}</Pill>
            </div>

            {headline && (
                <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-md flex items-center gap-md flex-wrap">
                    <div className="flex-1 min-w-[240px]">
                        <p className="text-sm font-bold text-red-400">{headline.title}</p>
                        <p className="text-xs text-soft mt-1">{headline.detail}</p>
                    </div>
                    {canNudge && culprit.lead_id && (
                        <button type="button" disabled={busyId === culprit.id} onClick={() => nudge(culprit)} className="px-md py-1.5 rounded-lg border border-line text-xs font-bold text-white hover:bg-line transition-colors disabled:opacity-50 cursor-pointer">
                            Nudge {culprit.name}
                        </button>
                    )}
                    <button type="button" onClick={() => onResolve(culprit.team_space_id)} className="px-md py-1.5 rounded-lg bg-accent text-on-accent text-xs font-bold hover:bg-accent-hover transition-colors cursor-pointer">
                        Resolve
                    </button>
                </div>
            )}
            {notice && <p role="status" className={`text-xs ${notice.isError ? "text-red-400" : "text-accent-ink"}`}>{notice.text}</p>}

            {invitedDepartments.length > 0 && (
                <section>
                    <Heading>Invited, waiting for a reply</Heading>
                    <div className="space-y-sm">
                        {invitedDepartments.map((d) => (
                            <div key={d.team_space_id} className="rounded-xl border border-dashed border-line-strong bg-panel px-md py-sm flex items-center gap-md flex-wrap">
                                <div className="flex-1 min-w-[200px]">
                                    <p className="text-sm font-semibold text-white">{d.name}</p>
                                    <p className="text-[11px] text-muted mt-0.5">
                                        {d.invited_at ? `Invited ${formatDay(d.invited_at)}` : "Invited"}
                                        {d.due_date && ` · proposed due ${formatDay(d.due_date)}`}
                                        . Its leads accept or decline from their Home page.
                                    </p>
                                </div>
                                {canManage && (
                                    <button type="button" disabled={busyId === d.team_space_id} onClick={() => cancelInvite(d)} className="px-md py-1.5 rounded-lg border border-line text-xs font-bold text-soft hover:text-white hover:bg-line transition-colors disabled:opacity-50 cursor-pointer">
                                        Cancel invite
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section>
                <Heading>Department progress</Heading>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
                    {summaries.map((s) => {
                        const status = DEPARTMENT_STATUS[s.status]
                        const tone = TONES[status.tone]
                        const canSignOff = canManage || (s.lead_id && s.lead_id === currentUserId)
                        return (
                            <div key={s.id} className={`rounded-xl border bg-panel p-md flex flex-col ${tone.card}`}>
                                <div className="flex items-start justify-between gap-sm">
                                    <p className="text-sm font-bold text-white flex items-center gap-2">
                                        {s.name}
                                        {s.is_lead_department && <span className="px-2 py-0.5 rounded-full bg-accent text-on-accent text-[10px] font-bold tracking-wider">LEAD</span>}
                                    </p>
                                    <Pill tone={status.tone}>{status.label}</Pill>
                                </div>
                                <p className="text-[11px] text-muted mt-0.5">
                                    {s.lead_name || "No lead"}{s.due_date && ` · due ${formatDay(s.due_date)}`}
                                </p>
                                <p className="text-3xl font-bold text-white mt-md">{Math.round(s.progress * 100)}%</p>
                                <div className="h-1.5 rounded-full bg-line overflow-hidden mt-sm">
                                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.round(s.progress * 100)}%` }} />
                                </div>
                                <p className="text-[11px] text-soft mt-md">{s.done} of {s.total} task{s.total === 1 ? "" : "s"} done</p>
                                <p className="text-[11px] text-soft">{s.overdue} overdue · {s.waitingOnOthers} waiting on others</p>
                                <p className={`text-[11px] mt-md leading-relaxed ${tone.text}`}>{departmentNote(s, nameOf)}</p>
                                {/* The department's lead signs its part off; a finished part needs no sign-off */}
                                {canSignOff && (s.signedOff || s.status !== "done") && (
                                    <button
                                        type="button"
                                        disabled={busyId === s.id}
                                        onClick={() => signOff(s, !s.signedOff)}
                                        className="mt-md self-start text-[11px] font-semibold text-accent-ink hover:underline disabled:opacity-50 cursor-pointer"
                                    >
                                        {s.signedOff ? "Undo sign-off" : "Sign off this part"}
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
            </section>

            <section>
                <Heading>Who is waiting on whom</Heading>
                <div className="rounded-xl border border-line bg-panel p-md">
                    {links.length === 0 ? (
                        <p className="text-xs text-muted">No department is waiting on another one.</p>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-md items-center">
                            <div className="space-y-sm">
                                {links.map((link) => (
                                    <div key={`${link.from}>${link.departmentId}`} className="flex items-center gap-sm">
                                        <span className="w-36 shrink-0 text-center px-sm py-2 rounded-lg border border-amber-400/60 bg-amber-500/10 text-xs font-semibold text-white truncate">{nameOf(link.from)}</span>
                                        <div className="flex-1 min-w-[80px] text-center">
                                            <p className="text-[10px] text-red-400">waiting {link.days} day{link.days === 1 ? "" : "s"} · {link.tasks} task{link.tasks === 1 ? "" : "s"}</p>
                                            <div className="relative h-px bg-red-400/70 mt-1"><span className="absolute -right-0.5 -top-[5px] text-red-400 text-[10px] leading-none">▶</span></div>
                                        </div>
                                        <span className="w-36 shrink-0 text-center px-sm py-2 rounded-lg border border-red-400/60 bg-red-500/10 text-xs font-semibold text-white truncate">{nameOf(link.departmentId)}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[11px] text-muted leading-relaxed">
                                The arrow always points at the department being waited on. When it finishes the tasks others wait on, they unblock automatically.
                            </p>
                        </div>
                    )}
                </div>
            </section>

            <section>
                <Heading>Tasks causing the delay</Heading>
                {causes.length === 0 ? (
                    <p className="text-xs text-muted">Nothing is holding this project up.</p>
                ) : (
                    <div className="space-y-sm">
                        {causes.map(({ task, departmentId, overdueDays, blocks }) => {
                            const assignee = orgUsers.find((u) => u.id === task.assignee_id)?.name || "Unassigned"
                            return (
                                <button key={task.id} type="button" onClick={() => onOpenTask(task)} className="w-full text-left rounded-xl border border-line bg-panel px-md py-sm grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr] gap-xs items-center hover:border-line-strong transition-colors cursor-pointer">
                                    <span className="text-sm font-semibold text-white truncate">{task.title}</span>
                                    <span className="text-[11px] text-muted truncate">{assignee} · {nameOf(departmentId)}</span>
                                    <span className="text-[11px] text-red-400">{overdueDays > 0 ? `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue` : "Not overdue"}</span>
                                    <span className="text-[11px] text-amber-400">
                                        {blocks.length === 0 ? "Blocks nothing" : blocks.map((b) => `Blocks ${b.count} ${nameOf(b.departmentId)} task${b.count === 1 ? "" : "s"}`).join(", ")}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                )}
            </section>
        </div>
    )
}
