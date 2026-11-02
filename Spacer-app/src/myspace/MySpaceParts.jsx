import { SkeletonLine } from "../components/DashboardParts"
import { safeHttpsUrl } from "../safeUrl"
import { taskProgress, statusLabel, priorityLabel } from "./taskStats"

const PRIORITY_FLAG = { Urgent: "text-red-500", High: "text-orange-400", Normal: "text-blue-400", Low: "text-muted" }

const formatDay = (value) =>
    new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })

export function TaskCard({ task, todayKey, onOpen }) {
    const status = statusLabel(task, todayKey)
    const priority = priorityLabel(task.priority)
    const { done, total, percent } = taskProgress(task)

    return (
        <button
            type="button"
            onClick={() => onOpen(task)}
            className="text-left bg-raised border border-line rounded-lg p-3 flex flex-col gap-2 hover:border-line-strong transition-colors cursor-pointer"
        >
            <div className="flex items-center gap-2 text-[11px]">
                <span className={`px-2 py-0.5 rounded-md bg-surface2 ${status === "Overdue" ? "text-red-400" : "text-white"}`}>{status}</span>
                {priority && (
                    <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-surface2 text-white">
                        <span className={`material-symbols-outlined text-[13px] ${PRIORITY_FLAG[priority]}`}>flag</span>{priority}
                    </span>
                )}
            </div>
            <div className="min-w-0">
                {task.project?.name && <p className="text-[10px] text-muted truncate">{task.project.name}</p>}
                <p className="text-sm text-white truncate">{task.title || "Untitled"}</p>
                {task.description && <p className="text-[11px] text-muted line-clamp-2 mt-0.5">{task.description}</p>}
            </div>
            <div className="mt-auto">
                <div className="flex justify-between text-[10px] text-muted mb-1">
                    <span>progress</span><span>{percent}%</span>
                </div>
                <div className="h-1 rounded-full bg-surface2 overflow-hidden">
                    <div className="h-full bg-primary-accent rounded-full" style={{ width: `${percent}%` }} />
                </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted">
                <span className="flex items-center gap-1" title="Subtasks done">
                    <span className="material-symbols-outlined text-[13px]">checklist</span>{done}/{total}
                </span>
                {task.due_date && (
                    <span className={`flex items-center gap-1 ${status === "Overdue" ? "text-red-400" : ""}`}>
                        <span className="material-symbols-outlined text-[13px]">calendar_today</span>{formatDay(task.due_date)}
                    </span>
                )}
            </div>
        </button>
    )
}

export function TaskCardSkeleton() {
    return (
        <div className="bg-raised border border-line rounded-lg p-3 space-y-3 animate-pulse" aria-hidden="true">
            <div className="flex gap-2"><SkeletonLine className="w-12 h-3" /><SkeletonLine className="w-12 h-3" /></div>
            <SkeletonLine className="w-3/4 h-3" />
            <SkeletonLine className="w-full h-2.5" />
            <SkeletonLine className="w-2/3 h-2.5" />
            <SkeletonLine className="w-full h-1.5 mt-4" />
        </div>
    )
}

export function ActivityList({ items }) {
    return (
        <div className="bg-raised border border-line rounded-lg p-3 flex-1">
            <p className="text-[11px] text-muted mb-3">Latest</p>
            <ul className="space-y-4">
                {items.map((act) => (
                    <li key={act.id} className="flex gap-3 items-start">
                        <div className="w-7 h-7 rounded-full bg-surface2 flex items-center justify-center shrink-0 font-semibold text-[10px] text-muted">{act.initials}</div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-white">{act.title}</p>
                            <p className="text-[11px] text-muted mt-0.5">{act.sub}</p>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}

export function ActivitySkeleton() {
    return (
        <div className="bg-raised border border-line rounded-lg p-3 space-y-4 flex-1 animate-pulse" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3 items-center">
                    <div className="w-7 h-7 rounded-full bg-surface2 shrink-0" />
                    <div className="flex-1 space-y-1.5"><SkeletonLine className="w-5/6 h-2.5" /><SkeletonLine className="w-1/2 h-2" /></div>
                </div>
            ))}
        </div>
    )
}

const dayLabel = (eventDate, todayKey) => {
    if (eventDate === todayKey) return { text: "Today", className: "text-blue-400" }
    const tomorrow = new Date(`${todayKey}T00:00:00`)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const isTomorrow = new Date(`${eventDate}T00:00:00`).getTime() === tomorrow.getTime()
    return isTomorrow ? { text: "Tomorrow", className: "text-orange-400" } : null
}

export function MeetingRow({ event, todayKey }) {
    const joinUrl = safeHttpsUrl(event.external_url)
    const tag = dayLabel(event.event_date, todayKey)
    return (
        <div className="bg-raised border border-line rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
                <p className="text-[11px] text-muted">
                    {new Date(`${event.event_date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                    {tag && <span className={`ml-1.5 ${tag.className}`}>{tag.text}</span>}
                </p>
                <p className="text-xs text-white truncate mt-0.5">{event.title}</p>
            </div>
            {joinUrl && (
                <a href={joinUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md border border-line text-[11px] text-white hover:bg-surface2 transition-colors">
                    <span className="material-symbols-outlined text-[14px]">videocam</span> Join Meeting
                </a>
            )}
        </div>
    )
}

export function MeetingSkeleton() {
    return (
        <div className="bg-raised border border-line rounded-lg px-3 py-3 space-y-2 animate-pulse" aria-hidden="true">
            <SkeletonLine className="w-1/3 h-2.5" />
            <SkeletonLine className="w-2/3 h-3" />
        </div>
    )
}
