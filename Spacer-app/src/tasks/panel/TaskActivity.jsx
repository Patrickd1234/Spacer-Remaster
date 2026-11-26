import { useEffect, useState } from "react"
import TaskComments from "../TaskComments"
import { fetchTaskHistory } from "../taskPanelData"
import { buildTaskHistory } from "../taskHistory"
import { timeAgo } from "../../activityLabels"
import PersonPhoto from "../../avatars/PersonPhoto"

// Comments and History in one place, like Jira's Activity: comments by
// default; History lists every change the database logged for the task.
// `version` changes whenever the task changes, so History reloads.
const TABS = [
    { key: "comments", label: "Comments" },
    { key: "history", label: "History" },
]

// Dependency entries get a marker instead of a photo (design screen 09)
const KIND_ICONS = {
    unblocked: { icon: "check", tone: "bg-accent text-on-accent" },
    dependency_added: { icon: "link", tone: "bg-surface2 border border-line text-soft" },
    dependency_removed: { icon: "link_off", tone: "bg-surface2 border border-line text-muted" },
}

function TaskHistoryList({ taskId, version, names }) {
    const [state, setState] = useState({ rows: [], error: null, loadedFor: null })
    const loadKey = `${taskId}|${version}`
    useEffect(() => {
        let active = true
        fetchTaskHistory(taskId).then(({ data, error }) => { if (active) setState({ rows: data, error, loadedFor: loadKey }) })
        return () => { active = false }
    }, [taskId, loadKey])

    if (state.loadedFor === null) {
        return (
            <ul className="space-y-3" aria-busy="true" aria-label="Loading the history">
                {[0, 1, 2].map((i) => <li key={i} className="h-9 rounded-md bg-surface2/60 animate-pulse" />)}
            </ul>
        )
    }
    if (state.error) return <p role="alert" className="text-xs text-red-400">{state.error}</p>
    const entries = buildTaskHistory(state.rows, names)
    if (entries.length === 0) return <p className="text-xs text-muted">No changes yet.</p>

    return (
        <ol className="relative space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-line">
            {entries.map((entry) => (
                <li key={entry.id} className="relative flex gap-3">
                    {KIND_ICONS[entry.kind] ? (
                        <span className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${KIND_ICONS[entry.kind].tone}`}>
                            <span className="material-symbols-outlined text-[15px]" aria-hidden="true">{KIND_ICONS[entry.kind].icon}</span>
                        </span>
                    ) : (
                        <span className="relative z-10 w-6 h-6 rounded-full overflow-hidden bg-surface2 border border-line flex items-center justify-center text-[10px] font-bold text-muted uppercase shrink-0">
                            <PersonPhoto userId={entry.actorId} fallback={entry.actorName.charAt(0)} />
                        </span>
                    )}
                    <div className="min-w-0 pt-0.5">
                        <p className="text-[13px] text-soft leading-snug">
                            <span className="font-semibold text-white">{entry.actorName}</span>{" "}
                            {entry.lines.join(", ")}
                        </p>
                        <time dateTime={entry.at} title={new Date(entry.at).toLocaleString()} className="text-[11px] text-muted">{timeAgo(entry.at)}</time>
                    </div>
                </li>
            ))}
        </ol>
    )
}

export default function TaskActivity({ taskId, version, names }) {
    const [tab, setTab] = useState("comments")
    return (
        <section aria-label="Activity" className="space-y-3">
            <div role="tablist" aria-label="Activity" className="flex items-center gap-1 border-b border-line">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        role="tab"
                        id={`task-activity-${t.key}`}
                        aria-selected={tab === t.key}
                        aria-controls={`task-activity-${t.key}-panel`}
                        onClick={() => setTab(t.key)}
                        className={`px-3 py-2 -mb-px text-[13px] font-semibold border-b-2 transition-colors cursor-pointer ${tab === t.key ? "border-accent-ink text-white" : "border-transparent text-muted hover:text-white"}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <div role="tabpanel" id={`task-activity-${tab}-panel`} aria-labelledby={`task-activity-${tab}`}>
                {tab === "comments"
                    ? <TaskComments key={taskId} taskId={taskId} showHeading={false} />
                    : <TaskHistoryList taskId={taskId} version={version} names={names} />}
            </div>
        </section>
    )
}
