import { useEffect, useState } from "react"
import Select from "../components/Select"
import { getSessionUser } from "../supabase"
import { fetchMyDepartmentInvites, fetchDepartmentPeople, respondToDepartmentInvite } from "../departmentInvitesData"
import { announceProjectCreated } from "../appEvents"

const fieldClass = "w-full bg-canvas border border-line rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-accent-ink/50 transition-all"
const buttonClass = "px-md py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"

const formatDay = (value) => {
    if (!value) return ""
    const [y, m, d] = String(value).slice(0, 10).split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}
const inviteKey = (invite) => `${invite.project_id}:${invite.team_space_id}`

// Accepting: pick who leads the department's part (you, if you're in it, by
// default; a lead is needed so nudges and "waiting on you" notices reach
// someone) and, optionally, change the proposed due date (on or before the
// project's deadline)
function AcceptForm({ invite, isSaving, onConfirm, onBack }) {
    const [people, setPeople] = useState(null)
    const [pickedLeadId, setLeadId] = useState(null)
    const [myId, setMyId] = useState(null)
    const [dueDate, setDueDate] = useState(invite.due_date || "")
    useEffect(() => {
        let active = true
        Promise.all([fetchDepartmentPeople(invite.team_space_id), getSessionUser()]).then(([{ data }, user]) => {
            if (!active) return
            setPeople(data)
            setMyId(user?.id ?? null)
        })
        return () => { active = false }
    }, [invite.team_space_id])
    const hasPeople = (people || []).length > 0
    const leadId = pickedLeadId ?? ((people || []).some((p) => p.id === myId) ? myId : "")
    // A department with nobody in it yet can join without a lead
    const canJoin = people !== null && (!hasPeople || Boolean(leadId))

    return (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-sm items-end pt-sm border-t border-line/40">
            <label className="space-y-1">
                <span className="block text-[11px] text-muted">Who leads {invite.department_name}&apos;s part</span>
                <Select className={fieldClass} value={leadId} onChange={(e) => setLeadId(e.target.value)} disabled={!people}>
                    <option value="">{people === null ? "Loading people…" : hasPeople ? "Pick who leads it" : "Nobody in the department yet"}</option>
                    {(people || []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </Select>
            </label>
            <label className="space-y-1">
                <span className="block text-[11px] text-muted">Due</span>
                <input type="date" className={`${fieldClass} [color-scheme:dark]`} value={dueDate} max={invite.project_due_date || undefined} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <div className="flex gap-sm">
                <button type="button" onClick={onBack} disabled={isSaving} className={`${buttonClass} border border-line text-soft hover:text-white hover:bg-line`}>Back</button>
                <button type="button" onClick={() => onConfirm({ leadId, dueDate })} disabled={isSaving || !canJoin} title={canJoin ? undefined : "Pick who leads the department's part"} className={`${buttonClass} bg-accent text-on-accent hover:bg-accent-hover`}>
                    {isSaving ? "Joining…" : "Join the project"}
                </button>
            </div>
        </div>
    )
}

function InviteCard({ invite, onAnswered }) {
    const [step, setStep] = useState("ask") // "ask" | "accept" | "decline"
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState(null)

    const answer = async (isAccepting, { leadId = null, dueDate = null } = {}) => {
        setIsSaving(true)
        setError(null)
        const { error: answerError } = await respondToDepartmentInvite({
            projectId: invite.project_id, teamSpaceId: invite.team_space_id, isAccepting, leadId,
            dueDate: dueDate && dueDate !== invite.due_date ? dueDate : null,
        })
        setIsSaving(false)
        if (answerError) { setError(answerError); return }
        onAnswered(invite, isAccepting)
    }

    return (
        <li className="rounded-xl border border-line bg-raised p-md space-y-sm">
            <div className="flex items-start gap-md flex-wrap">
                <span className="material-symbols-outlined text-accent-ink text-[20px] mt-0.5">handshake</span>
                <div className="flex-1 min-w-[220px]">
                    <p className="text-sm text-white">
                        <span className="font-semibold">{invite.invited_by_name || "Someone"}</span> invited <span className="font-semibold">{invite.department_name}</span> to work on <span className="font-semibold">&ldquo;{invite.project_name}&rdquo;</span>
                    </p>
                    <p className="text-[11px] text-muted mt-0.5">
                        Led by {invite.lead_department_name || "another department"}
                        {invite.project_due_date && ` · project due ${formatDay(invite.project_due_date)}`}
                        {invite.due_date && ` · ${invite.department_name}'s part proposed for ${formatDay(invite.due_date)}`}
                    </p>
                </div>
                {step === "ask" && (
                    <div className="flex gap-sm">
                        <button type="button" onClick={() => setStep("decline")} className={`${buttonClass} border border-line text-soft hover:text-white hover:bg-line`}>Decline</button>
                        <button type="button" onClick={() => setStep("accept")} className={`${buttonClass} bg-accent text-on-accent hover:bg-accent-hover`}>Accept</button>
                    </div>
                )}
            </div>
            {step === "accept" && (
                <AcceptForm invite={invite} isSaving={isSaving} onBack={() => setStep("ask")} onConfirm={(choice) => answer(true, choice)} />
            )}
            {step === "decline" && (
                <div className="flex items-center gap-sm flex-wrap pt-sm border-t border-line/40">
                    <p className="flex-1 text-xs text-soft">Decline? {invite.department_name} won&apos;t be on the project, and {invite.invited_by_name || "the person who invited you"} is told.</p>
                    <button type="button" onClick={() => setStep("ask")} disabled={isSaving} className={`${buttonClass} border border-line text-soft hover:text-white hover:bg-line`}>Back</button>
                    <button type="button" onClick={() => answer(false)} disabled={isSaving} className={`${buttonClass} border border-red-400/60 text-red-400 hover:bg-red-500/10`}>
                        {isSaving ? "Declining…" : "Decline invite"}
                    </button>
                </div>
            )}
            {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        </li>
    )
}

// Home page panel: invites for departments the person manages projects in
// (my_department_invites()). Shows nothing when there are none.
export default function DepartmentInvites() {
    const [invites, setInvites] = useState([])
    const [error, setError] = useState(null)
    const [notice, setNotice] = useState(null)

    useEffect(() => {
        let active = true
        fetchMyDepartmentInvites().then(({ data, error: loadError }) => {
            if (!active) return
            setInvites(data)
            setError(loadError)
        })
        return () => { active = false }
    }, [])

    const handleAnswered = (invite, isAccepting) => {
        setInvites((prev) => prev.filter((i) => inviteKey(i) !== inviteKey(invite)))
        setNotice(isAccepting
            ? `${invite.department_name} joined "${invite.project_name}".`
            : `You declined the invite to "${invite.project_name}".`)
        if (isAccepting) {
            announceProjectCreated(
                { id: invite.project_id, name: invite.project_name, team_space_id: invite.lead_team_space_id, due_date: invite.project_due_date },
                [invite.team_space_id],
            )
        }
    }

    if (invites.length === 0 && !error && !notice) return null
    return (
        <section className="bg-panel border border-line rounded-xl p-4 space-y-3" aria-label="Project invites">
            <h2 className="text-[15px] font-semibold text-white">Project invites</h2>
            {error && <p className="text-xs text-red-400">{error}</p>}
            {notice && <p role="status" className="text-xs text-accent-ink">{notice}</p>}
            {invites.length > 0 && (
                <ul className="space-y-sm">
                    {invites.map((invite) => <InviteCard key={inviteKey(invite)} invite={invite} onAnswered={handleAnswered} />)}
                </ul>
            )}
        </section>
    )
}
