import { recentUnblock, taskDepartmentName } from "../waiting"
import { statusInfo } from "../../taskStatuses"

const formatDay = (value) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

function ChainCard({ title, meta, status, onOpen }) {
    const info = statusInfo(status)
    return (
        <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2">
            <div className="flex-1 min-w-0">
                {onOpen
                    ? <button type="button" onClick={onOpen} className="text-[12px] font-semibold text-white hover:underline text-left cursor-pointer">{title}</button>
                    : <p className="text-[12px] font-semibold text-white">{title}</p>}
                <p className="text-[11px] text-muted">{meta}</p>
            </div>
            <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${info.pill}`}>{info.label}</span>
        </div>
    )
}

/**
 * Design screen 09: once the last task this one waited on is done (within the
 * last week), a success banner and the chain: the finished task, then this
 * one. Nothing otherwise.
 */
export default function UnblockedBanner({ task, tasks, departments, onOpenTask }) {
    const unblock = recentUnblock(task, tasks, departments)
    if (!unblock?.blocker) return null
    const ownDepartment = taskDepartmentName(task, departments)
    const who = unblock.departmentName || "Someone"
    const meta = (name, rest) => [name, rest].filter(Boolean).join(" · ")

    return (
        <section aria-label="Dependency resolved" className="space-y-3">
            <div role="status" className="flex items-start gap-2.5 rounded-xl border border-accent-ink/40 bg-accent/[0.07] px-3.5 py-3">
                <span className="w-6 h-6 rounded-full bg-accent text-on-accent flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">check</span>
                </span>
                <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-white">Dependency resolved — {who} completed “{unblock.blocker.title}”.</p>
                    <p className="text-[12px] text-soft mt-0.5">{ownDepartment ? `${ownDepartment} can` : "You can"} continue work.</p>
                </div>
            </div>
            <div>
                <h3 className="text-[12px] font-semibold text-white mb-2">Dependencies</h3>
                <div className="relative pl-6 space-y-2 before:absolute before:left-[9px] before:top-5 before:bottom-5 before:w-px before:bg-line-strong">
                    <div className="relative">
                        <span className="absolute -left-6 top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full bg-accent text-on-accent flex items-center justify-center">
                            <span className="material-symbols-outlined text-[12px]" aria-hidden="true">check</span>
                        </span>
                        <ChainCard
                            title={unblock.blocker.title}
                            meta={meta(unblock.departmentName, `Completed ${formatDay(unblock.resolvedAt)}`)}
                            status="done"
                            onOpen={() => onOpenTask(unblock.blocker)}
                        />
                    </div>
                    <div className="relative">
                        <span className="absolute -left-6 top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full border border-line-strong bg-panel" aria-hidden="true" />
                        <ChainCard title={task.title} meta={meta(ownDepartment, `Unblocked and ${statusInfo(task.status).label.toLowerCase()}`)} status={task.status} />
                    </div>
                </div>
            </div>
        </section>
    )
}
