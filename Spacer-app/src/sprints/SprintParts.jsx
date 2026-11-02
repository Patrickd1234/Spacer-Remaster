import { useState } from "react"
import Select from "../components/Select"
import { Modal, Field, INPUT_CLASS, PrimaryButton, SecondaryButton, ErrorNote } from "../general/GeneralParts"
import { POINT_OPTIONS, NAME_MAX, GOAL_MAX, validateSprint, sprintTotals, dateRange } from "./sprintMath"

// Pieces of the Sprint tab. They only render and report clicks; SprintTab owns the data.

const STATUS_STYLES = {
    planned: "bg-line text-soft border-line-strong",
    active: "bg-accent/10 text-accent-ink border-accent-ink/30",
    completed: "bg-green-500/10 text-green-400 border-green-500/30",
}
const STATUS_LABELS = { planned: "Planned", active: "Active", completed: "Completed" }
const TASK_GROUPS = [
    { status: "todo", label: "To do" },
    { status: "in_progress", label: "In progress" },
    { status: "done", label: "Done" },
]

export function StatusPill({ status }) {
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>
}

export function PointsSelect({ value, disabled, onChange }) {
    return (
        <Select
            aria-label="Story points"
            disabled={disabled}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            className="w-14 shrink-0 bg-field border border-line rounded-md px-1 py-0.5 text-xs text-white text-center focus:outline-none focus:border-accent-ink disabled:opacity-60 cursor-pointer disabled:cursor-default"
        >
            <option value="">–</option>
            {POINT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
    )
}

// One task: title (opens the task), who has it, points, and an optional action
export function TaskLine({ task, assignee, canEstimate, onPoints, onOpen, action = null }) {
    const isDone = task.status === "done"
    return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-raised border border-line hover:border-line-strong transition-colors">
            <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left cursor-pointer">
                <p className={`text-sm truncate ${isDone ? "text-muted line-through" : "text-white"}`}>{task.title}</p>
                {assignee && <p className="text-[11px] text-muted truncate">{assignee}</p>}
            </button>
            <PointsSelect value={task.story_points} disabled={!canEstimate} onChange={(p) => onPoints(task, p)} />
            {action}
        </div>
    )
}

// The active sprint's tasks in three status groups
export function TasksByStatus({ tasks, renderTask }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {TASK_GROUPS.map((group) => {
                const inGroup = tasks.filter((t) => t.status === group.status)
                return (
                    <section key={group.status} className="space-y-2 min-w-0">
                        <h4 className="flex items-center justify-between text-xs font-medium text-muted">
                            {group.label}<span className="tabular-nums">{inGroup.length}</span>
                        </h4>
                        {inGroup.length === 0
                            ? <p className="text-xs text-faint px-1 py-3">Nothing here.</p>
                            : inGroup.map(renderTask)}
                    </section>
                )
            })}
        </div>
    )
}

// Create or edit; `sprint` null creates with `defaults` ({ name, startsOn, endsOn })
export function SprintFormModal({ sprint, defaults, onSubmit, onClose }) {
    const [form, setForm] = useState(() => sprint
        ? { name: sprint.name, goal: sprint.goal || "", startsOn: sprint.starts_on, endsOn: sprint.ends_on }
        : { ...defaults, goal: "" })
    const [errorMsg, setErrorMsg] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

    const handleSubmit = async (e) => {
        e.preventDefault()
        const invalid = validateSprint(form)
        if (invalid) return setErrorMsg(invalid)
        setIsSaving(true)
        const error = await onSubmit(form)
        setIsSaving(false)
        if (error) setErrorMsg(error)
    }

    return (
        <Modal title={sprint ? "Edit sprint" : "New sprint"} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Name"><input className={INPUT_CLASS} value={form.name} onChange={set("name")} maxLength={NAME_MAX} required /></Field>
                <Field label="Sprint goal" hint="One sentence the team can check its work against.">
                    <textarea className={`${INPUT_CLASS} min-h-[72px]`} value={form.goal} onChange={set("goal")} maxLength={GOAL_MAX} placeholder="e.g. Customers can pay by card at checkout" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Starts"><input type="date" className={INPUT_CLASS} value={form.startsOn} onChange={set("startsOn")} required /></Field>
                    <Field label="Ends"><input type="date" className={INPUT_CLASS} value={form.endsOn} onChange={set("endsOn")} required /></Field>
                </div>
                {errorMsg && <ErrorNote>{errorMsg}</ErrorNote>}
                <div className="flex justify-end gap-2">
                    <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                    <PrimaryButton type="submit" icon="save" disabled={isSaving}>{isSaving ? "Saving…" : sprint ? "Save" : "Create sprint"}</PrimaryButton>
                </div>
            </form>
        </Modal>
    )
}

// Review what got done, decide where unfinished work goes, and hold the retrospective
export function CompleteSprintDialog({ sprint, tasks, plannedSprints, onSubmit, onClose }) {
    const totals = sprintTotals(tasks)
    const openCount = totals.totalTasks - totals.doneTasks
    const [carryOverTo, setCarryOverTo] = useState(plannedSprints[0]?.id ?? "")
    const [retro, setRetro] = useState({ wentWell: "", toImprove: "", actions: "" })
    const [errorMsg, setErrorMsg] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const set = (key) => (e) => setRetro((r) => ({ ...r, [key]: e.target.value }))

    const handleSubmit = async (e) => {
        e.preventDefault()
        setIsSaving(true)
        const error = await onSubmit({ carryOverTo: carryOverTo || null, ...retro })
        setIsSaving(false)
        if (error) setErrorMsg(error)
    }

    return (
        <Modal title={`Complete ${sprint.name}`} onClose={onClose} wide>
            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-3 gap-3">
                    <Figure label="Completed" value={totals.usesPoints ? `${totals.done} pts` : totals.doneTasks} />
                    <Figure label="Committed at start" value={sprint.committed_points != null && totals.usesPoints ? `${sprint.committed_points} pts` : `${sprint.committed_tasks ?? totals.totalTasks} tasks`} />
                    <Figure label="Unfinished" value={`${openCount} task${openCount === 1 ? "" : "s"}`} />
                </div>
                {openCount > 0 && (
                    <Field label={`Move the ${openCount} unfinished task${openCount === 1 ? "" : "s"} to`}>
                        <Select className={INPUT_CLASS} value={carryOverTo} onChange={(e) => setCarryOverTo(e.target.value)}>
                            {plannedSprints.map((s) => <option key={s.id} value={s.id}>{s.name} ({dateRange(s)})</option>)}
                            <option value="">The backlog</option>
                        </Select>
                    </Field>
                )}
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Retrospective <span className="font-normal text-muted">(optional)</span></h3>
                    <Field label="What went well"><textarea className={`${INPUT_CLASS} min-h-[60px]`} value={retro.wentWell} onChange={set("wentWell")} maxLength={2000} /></Field>
                    <Field label="What to improve"><textarea className={`${INPUT_CLASS} min-h-[60px]`} value={retro.toImprove} onChange={set("toImprove")} maxLength={2000} /></Field>
                    <Field label="Action items for next sprint"><textarea className={`${INPUT_CLASS} min-h-[60px]`} value={retro.actions} onChange={set("actions")} maxLength={2000} /></Field>
                </div>
                {errorMsg && <ErrorNote>{errorMsg}</ErrorNote>}
                <div className="flex justify-end gap-2">
                    <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                    <PrimaryButton type="submit" icon="flag" disabled={isSaving}>{isSaving ? "Completing…" : "Complete sprint"}</PrimaryButton>
                </div>
            </form>
        </Modal>
    )
}

export function Figure({ label, value, sub = null }) {
    return (
        <div className="rounded-lg border border-line bg-raised px-3 py-2.5">
            <p className="text-[11px] text-muted">{label}</p>
            <p className="text-lg font-semibold text-white">{value}</p>
            {sub && <p className="text-[11px] text-muted">{sub}</p>}
        </div>
    )
}

function RetroNote({ title, text }) {
    if (!text) return null
    return (
        <div>
            <p className="text-[11px] font-medium text-muted">{title}</p>
            <p className="text-sm text-soft whitespace-pre-line">{text}</p>
        </div>
    )
}

// A finished sprint: outcome on one line, goal and retrospective when opened
export function HistoryItem({ sprint }) {
    const hasRetro = sprint.retro_went_well || sprint.retro_to_improve || sprint.retro_actions
    return (
        <details className="group rounded-lg border border-line bg-raised">
            <summary className="flex items-center gap-3 px-3 py-2.5 cursor-pointer list-none">
                <span className="material-symbols-outlined text-[16px] text-muted transition-transform group-open:rotate-90">chevron_right</span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-white truncate">{sprint.name}</span>
                    <span className="block text-[11px] text-muted">{dateRange(sprint)}</span>
                </span>
                <span className="text-xs text-soft tabular-nums whitespace-nowrap">
                    {sprint.completed_points ?? 0} / {sprint.committed_points ?? 0} pts · {sprint.completed_tasks ?? 0} task{sprint.completed_tasks === 1 ? "" : "s"} done
                </span>
            </summary>
            <div className="px-3 pb-3 pl-10 space-y-2">
                {sprint.goal && <RetroNote title="Goal" text={sprint.goal} />}
                <RetroNote title="What went well" text={sprint.retro_went_well} />
                <RetroNote title="What to improve" text={sprint.retro_to_improve} />
                <RetroNote title="Action items" text={sprint.retro_actions} />
                {!sprint.goal && !hasRetro && <p className="text-xs text-muted">No goal or retrospective notes were recorded.</p>}
            </div>
        </details>
    )
}
