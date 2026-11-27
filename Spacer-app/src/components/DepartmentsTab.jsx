import { useEffect, useState } from "react"
import {
    summarizeDepartments, projectDelayStatus, delayCulprits, culpritHeadline, delayingTasks, departmentNote,
    daysBetween, DEPARTMENT_STATUS, PROJECT_STATUS, DEFAULT_DELAY_RULES,
} from "../crossDepartment"
import { departmentStats, filterByStatus, dependencyPairs, departmentMemberCounts, formatDay } from "../departmentsView"
import { TONES } from "./statusTones"
import Select from "./Select"
import { nudgeDepartment, fetchDepartmentMemberships } from "../crossDepartmentData"
import DepartmentCardActions from "./DepartmentCardActions"
import AddDepartmentForm from "./AddDepartmentForm"
import { cancelDepartmentInvite } from "../departmentInvitesData"
import { SectionHeading, StatTile, DepartmentCard, DependencyPairs, BreakdownTable } from "./DepartmentsParts"

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`
const buttonClass = "px-md py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"

// How many of the project's members are in each department (org_team_memberships()).
// `memberIds` null while the project's members load. Returns { counts, error }:
// counts null while loading or after a failure.
function useMemberCounts(memberIds) {
    const [state, setState] = useState({ memberships: null, error: null })
    useEffect(() => {
        let active = true
        fetchDepartmentMemberships().then(({ data, error }) => { if (active) setState({ memberships: error ? null : data, error }) })
        return () => { active = false }
    }, [])
    const counts = state.memberships && memberIds ? departmentMemberCounts(memberIds, state.memberships) : null
    return { counts, error: state.error }
}

// The Departments tab of a cross-department project (design screen 2): who is
// holding the project up, four figures, a card per department (with its lead's
// and the managers' actions), who waits on whom, a task breakdown, and the
// tasks behind any delay; invites still waiting for an answer.
// `departments`: the ones working on it; `invitedDepartments`: status "invited".
// `canManage`: the server's can_manage_project. `leadsDepartment(id)`: whether
// the user leads that department here. `memberIds`: the project's members.
export default function DepartmentsTab({
    projectId, projectDueDate, departments, invitedDepartments = [], tasks, orgUsers, memberIds = null, currentUserId,
    canManage, leadsDepartment = () => false, onResolve, onOpenTask, onDepartmentsChanged,
}) {
    const [notice, setNotice] = useState(null)
    const [busyId, setBusyId] = useState(null)
    const [pickedStatus, setStatusFilter] = useState("")
    const { counts: memberCounts, error: memberError } = useMemberCounts(memberIds)
    const now = new Date()
    const summaries = summarizeDepartments({ departments, tasks, now })
    const presentStatuses = Object.keys(DEPARTMENT_STATUS).filter((key) => summaries.some((s) => s.status === key))
    // A status no department has any more (one was signed off, say) falls back to all
    const statusFilter = presentStatuses.includes(pickedStatus) ? pickedStatus : ""
    const shown = filterByStatus(summaries, statusFilter)
    const stats = departmentStats(summaries)
    const nameOf = (id) => summaries.find((s) => s.id === String(id))?.name || "Another department"
    const overall = PROJECT_STATUS[projectDelayStatus(summaries, projectDueDate, now)]
    const culprit = delayCulprits(summaries)[0]
    const headline = culprit ? culpritHeadline(culprit, summaries, tasks, now) : null
    const causes = delayingTasks(tasks, summaries, now)
    const daysLeft = projectDueDate ? daysBetween(now, projectDueDate) : null
    const isDepartmentLead = departments.some((d) => d.lead_id && d.lead_id === currentUserId)
    const canNudge = canManage || isDepartmentLead
    const leadDepartmentName = departments.find((d) => d.is_lead_department)?.name || "the lead department"
    const onProjectIds = [...departments, ...invitedDepartments].map((d) => d.team_space_id)

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
    const handleChanged = (message) => {
        setNotice({ isError: false, text: message })
        onDepartmentsChanged?.()
    }
    const showDelayed = () => document.getElementById("delay-causes")?.scrollIntoView({ behavior: "smooth", block: "start" })

    return (
        <div className="space-y-lg">
            {headline && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.07] p-md flex items-center gap-md flex-wrap">
                    <span className="material-symbols-outlined text-[22px] text-amber-400" aria-hidden="true">error</span>
                    <div className="flex-1 min-w-[240px]">
                        <p className="text-sm font-semibold text-white">{headline.title}</p>
                        <p className="text-xs text-soft mt-0.5">{headline.detail}</p>
                    </div>
                    {canNudge && culprit.lead_id && (
                        <button type="button" disabled={busyId === culprit.id} onClick={() => nudge(culprit)} className={`${buttonClass} border border-line text-soft hover:text-white hover:bg-line`}>
                            Nudge {culprit.name}
                        </button>
                    )}
                    <button type="button" onClick={() => onResolve(culprit.team_space_id)} className={`${buttonClass} border border-line text-soft hover:text-white hover:bg-line`}>
                        Show their tasks
                    </button>
                    <button type="button" onClick={showDelayed} className={`${buttonClass} border border-line text-white hover:bg-line flex items-center gap-1`}>
                        View delayed tasks
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_forward</span>
                    </button>
                </div>
            )}
            {memberError && <p className="text-[11px] text-muted">{memberError} The member counts are left out.</p>}
            {notice && <p role="status" className={`text-xs ${notice.isError ? "text-red-400" : "text-accent-ink"}`}>{notice.text}</p>}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-sm">
                <StatTile icon="stacks" value={stats.departments} label={stats.departments === 1 ? "Department" : "Departments"} />
                <StatTile icon="task_alt" value={`${stats.done} / ${stats.total}`} label="Tasks completed" />
                <StatTile icon="schedule" value={stats.overdue} label={stats.overdue === 1 ? "Overdue task" : "Overdue tasks"} />
                <StatTile icon="link" value={stats.waitingDepartments} label={stats.waitingDepartments === 1 ? "Department waiting" : "Departments waiting"} />
            </div>

            {invitedDepartments.length > 0 && (
                <section aria-label="Invited departments">
                    <SectionHeading>Invited, waiting for a reply</SectionHeading>
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
                                    <button type="button" disabled={busyId === d.team_space_id} onClick={() => cancelInvite(d)} className={`${buttonClass} border border-line text-soft hover:text-white hover:bg-line`}>
                                        Cancel invite
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section aria-label="Departments">
                <SectionHeading aside={(
                    <div className="flex items-center gap-sm flex-wrap justify-end">
                        <span className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${TONES[overall.tone].pill}`}>{overall.label}</span>
                            {projectDueDate ? `Due ${formatDay(projectDueDate, true)}` : "No overall deadline"}
                            {daysLeft !== null && ` · ${daysLeft >= 0 ? `${plural(daysLeft, "day")} left` : `${plural(-daysLeft, "day")} past`}`}
                        </span>
                        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter departments by status" className="h-8 bg-transparent border border-line rounded-lg pl-2.5 pr-2 text-[12px] font-semibold text-soft hover:text-white">
                            <option value="">All statuses</option>
                            {presentStatuses.map((key) => <option key={key} value={key}>{DEPARTMENT_STATUS[key].label}</option>)}
                        </Select>
                    </div>
                )}>
                    Departments ({departments.length})
                </SectionHeading>
                {shown.length === 0 ? (
                    <p className="text-xs text-muted rounded-xl border border-line bg-panel p-md">No department is {DEPARTMENT_STATUS[statusFilter]?.label.toLowerCase() || "here"}.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
                        {shown.map((s) => (
                            <DepartmentCard
                                key={s.id}
                                summary={s}
                                // null: still loading; undefined: couldn't be counted
                                memberCount={memberCounts ? memberCounts.get(s.id) || 0 : memberError ? undefined : null}
                                note={departmentNote(s, nameOf)}
                                onShowTasks={() => onResolve(s.team_space_id)}
                                actions={(
                                    <DepartmentCardActions
                                        projectId={projectId}
                                        projectDueDate={projectDueDate}
                                        summary={s}
                                        canManage={canManage}
                                        isLead={leadsDepartment(s.team_space_id)}
                                        leadDepartmentName={leadDepartmentName}
                                        onChanged={handleChanged}
                                    />
                                )}
                            />
                        ))}
                    </div>
                )}
                {canManage && (
                    <div className="mt-md">
                        <AddDepartmentForm projectId={projectId} projectDueDate={projectDueDate} onProjectIds={onProjectIds} onAdded={handleChanged} />
                    </div>
                )}
            </section>

            <section aria-label="Department dependencies">
                <SectionHeading>Department dependencies</SectionHeading>
                <DependencyPairs pairs={dependencyPairs(summaries)} nameOf={nameOf} waitingDays={DEFAULT_DELAY_RULES.waitingDays} />
            </section>

            <section aria-label="Department task breakdown">
                <SectionHeading>Department task breakdown</SectionHeading>
                <BreakdownTable summaries={shown} onShowTasks={(s) => onResolve(s.team_space_id)} />
            </section>

            <section id="delay-causes" aria-label="Tasks causing the delay" className="scroll-mt-4">
                <SectionHeading>Tasks causing the delay</SectionHeading>
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
                                    <span className="text-[11px] text-red-400">{overdueDays > 0 ? `${plural(overdueDays, "day")} overdue` : "Not overdue"}</span>
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
