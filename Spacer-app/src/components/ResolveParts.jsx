import { useEffect, useRef, useState } from "react"
import PersonPhoto from "../avatars/PersonPhoto"
import { StatusPill } from "./DepartmentsParts"

// Pieces of the Resolve tab (design screen 6). They only render and report
// clicks; ResolveTab owns the data.

export const Heading = ({ title, subtitle, id }) => (
    <div className="mb-sm">
        <h3 id={id} tabIndex={id ? -1 : undefined} className="text-sm font-semibold text-white focus:outline-none">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>}
    </div>
)

function RowMenu({ label, items }) {
    const [isOpen, setIsOpen] = useState(false)
    const ref = useRef(null)
    useEffect(() => {
        if (!isOpen) return undefined
        const onDown = (e) => { if (!ref.current?.contains(e.target)) setIsOpen(false) }
        const onKey = (e) => { if (e.key === "Escape") setIsOpen(false) }
        document.addEventListener("mousedown", onDown)
        document.addEventListener("keydown", onKey)
        return () => {
            document.removeEventListener("mousedown", onDown)
            document.removeEventListener("keydown", onKey)
        }
    }, [isOpen])
    return (
        <div ref={ref} className="relative">
            <button type="button" onClick={() => setIsOpen((v) => !v)} aria-haspopup="true" aria-expanded={isOpen} aria-label={label} className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-white hover:bg-line cursor-pointer">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">more_horiz</span>
            </button>
            {isOpen && (
                <div className="absolute right-0 top-8 z-20 w-48 rounded-lg border border-line bg-surface1 shadow-xl py-1">
                    {items.map((item) => (
                        <button key={item.label} type="button" disabled={item.disabled} title={item.title} onClick={() => { setIsOpen(false); item.onClick() }} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-soft hover:text-white hover:bg-line/60 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-left">
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{item.icon}</span>
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

/**
 * One blocking task: tick it done (when allowed), its name, department and
 * due, whose work waits on it, its assignee, and a menu of actions.
 */
export function BlockerRow({ blocker, assigneeName, canComplete, isBusy, menu, onComplete, onOpen }) {
    // menu items: { label, icon, onClick, disabled?, title? }
    const { task } = blocker
    return (
        <li className="flex items-center gap-3 px-3 py-2.5 border-b border-line/50 last:border-0">
            <input
                type="checkbox"
                checked={false}
                disabled={!canComplete || isBusy}
                onChange={onComplete}
                aria-label={`Mark “${task.title}” as done`}
                title={canComplete ? "Mark as done: the tasks waiting on it can go ahead" : "You can't change this task's status"}
                className="w-4 h-4 rounded border-line-strong bg-canvas text-accent focus:ring-accent/40 disabled:opacity-40 cursor-pointer"
            />
            <div className="flex-1 min-w-0">
                <button type="button" onClick={onOpen} className="text-[13px] text-white hover:underline text-left truncate max-w-full cursor-pointer">{task.title}</button>
                <p className="text-[11px] text-muted">
                    {blocker.departmentName && `${blocker.departmentName} · `}
                    <span className={blocker.due.isOverdue ? "text-red-400" : ""}>{blocker.due.text}</span>
                </p>
            </div>
            <span className="hidden sm:flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full border border-line text-[10px] text-soft">
                <span className="material-symbols-outlined text-[12px]" aria-hidden="true">link</span>
                {blocker.label}
            </span>
            <span className="w-7 h-7 rounded-full overflow-hidden bg-surface2 border border-line flex items-center justify-center text-[10px] font-bold text-muted uppercase shrink-0" title={assigneeName || "Unassigned"}>
                {task.assignee_id
                    ? <PersonPhoto userId={task.assignee_id} fallback={(assigneeName || "?").charAt(0)} />
                    : <span className="material-symbols-outlined text-[15px]" role="img" aria-label="Unassigned">person</span>}
            </span>
            <RowMenu label={`Actions for ${task.title}`} items={menu} />
        </li>
    )
}

/** Each department's status and next step, with Nudge team or View tasks. */
export function NextSteps({ steps, canNudge, busyId, onNudge, onView }) {
    return (
        <ul className="rounded-xl border border-line bg-panel">
            {steps.map((step) => (
                <li key={step.id} className="grid grid-cols-[minmax(0,9rem)_auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 border-b border-line/50 last:border-0">
                    <span className="text-[13px] font-semibold text-white truncate">{step.name}</span>
                    <StatusPill status={step.status} />
                    <span className="text-[12px] text-soft truncate">{step.text}</span>
                    {step.action === "nudge" && canNudge ? (
                        <button type="button" disabled={busyId === step.id} onClick={() => onNudge(step)} className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-line text-[11px] font-semibold text-soft hover:text-white hover:bg-line disabled:opacity-50 cursor-pointer">
                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">notifications</span>
                            Nudge team
                        </button>
                    ) : (
                        <button type="button" onClick={() => onView(step)} className="h-7 px-2.5 rounded-lg border border-line text-[11px] font-semibold text-soft hover:text-white hover:bg-line cursor-pointer">
                            View tasks
                        </button>
                    )}
                </li>
            ))}
        </ul>
    )
}

const longDay = (value) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

/**
 * Close project: open only when every task is done and no invite waits
 * (`readiness` from closeReadiness()); asks first. A closed project shows when
 * and by whom, and its managers can reopen it.
 */
export function ClosePanel({ status, closedAt, closedByName, openCount = 0, readiness, canManage, isBusy, error, onClose, onReopen }) {
    const [isConfirming, setIsConfirming] = useState(false)
    const isClosed = status === "closed"
    const blockedReason = !canManage ? "Only the project's managers can close it." : readiness.reason
    return (
        <section aria-label="Close project" className="rounded-xl border border-line bg-panel p-md flex items-center gap-md flex-wrap">
            <span className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${isClosed ? "border-accent-ink/50 text-accent-ink" : "border-line text-muted"}`}>
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{isClosed ? "task_alt" : "check_circle"}</span>
            </span>
            <div className="flex-1 min-w-[220px]">
                <p className="text-sm font-semibold text-white">{isClosed ? "Project closed" : "Close project"}</p>
                <p className="text-[12px] text-muted mt-0.5">
                    {isClosed
                        ? `${["Closed", closedAt && `on ${longDay(closedAt)}`, closedByName && `by ${closedByName}`].filter(Boolean).join(" ")}. People on it can still open it.`
                        : isConfirming ? "Close it? It stays readable, and its managers can reopen it." : blockedReason}
                    {isClosed && openCount > 0 && (
                        <span className="block text-amber-300 mt-0.5">
                            {openCount === 1 ? "1 task was" : `${openCount} tasks were`} added or reopened since it closed. Reopen the project to keep working on it.
                        </span>
                    )}
                </p>
                {error && <p role="alert" className="text-[12px] text-red-400 mt-1">{error}</p>}
            </div>
            {isClosed && canManage && (
                <button type="button" disabled={isBusy} onClick={onReopen} className="h-8 px-3 rounded-lg border border-line text-[12px] font-semibold text-soft hover:text-white hover:bg-line disabled:opacity-50 cursor-pointer">
                    {isBusy ? "Reopening…" : "Reopen project"}
                </button>
            )}
            {!isClosed && !isConfirming && (
                <button
                    type="button"
                    disabled={!canManage || !readiness.canClose}
                    title={!canManage || !readiness.canClose ? blockedReason : undefined}
                    onClick={() => setIsConfirming(true)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line text-[12px] font-semibold text-soft hover:text-white hover:bg-line disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                    {(!canManage || !readiness.canClose) && <span className="material-symbols-outlined text-[15px]" aria-hidden="true">lock</span>}
                    Close project
                </button>
            )}
            {!isClosed && isConfirming && (
                <div className="flex gap-2">
                    <button type="button" disabled={isBusy} onClick={() => setIsConfirming(false)} className="h-8 px-3 rounded-lg border border-line text-[12px] font-semibold text-soft hover:text-white hover:bg-line cursor-pointer">Keep it open</button>
                    <button type="button" disabled={isBusy} onClick={async () => { if (await onClose()) setIsConfirming(false) }} className="h-8 px-3 rounded-lg bg-accent text-on-accent text-[12px] font-bold hover:bg-accent-hover disabled:opacity-50 cursor-pointer">
                        {isBusy ? "Closing…" : "Close project"}
                    </button>
                </div>
            )}
        </section>
    )
}
