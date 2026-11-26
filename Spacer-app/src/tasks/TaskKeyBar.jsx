import { useEffect, useState } from "react"
import { formatTaskKey, branchName } from "./taskKey"
import { useTaskKeyPrefix } from "./taskKeyPrefixes"

const COPIED_MS = 1500

function CopyButton({ text, icon, label, copiedLabel, className }) {
    const [isCopied, setIsCopied] = useState(false)
    useEffect(() => {
        if (!isCopied) return
        const id = setTimeout(() => setIsCopied(false), COPIED_MS)
        return () => clearTimeout(id)
    }, [isCopied])

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text)
            setIsCopied(true)
        } catch (error) {
            console.error("Copying failed:", error)
            window.prompt("Copy this:", text)
        }
    }

    return (
        <button type="button" onClick={copy} title={`Copy ${text}`} className={className}>
            <span className="material-symbols-outlined text-[15px]">{isCopied ? "check" : icon}</span>
            <span aria-live="polite">{isCopied ? copiedLabel : label}</span>
        </button>
    )
}

// "DEVNGT-12" and "Copy branch name" for a task: its project's prefix (the
// organization's for tasks without a project) and its number there. Developers put the key in their
// branch and commit messages so GitHub work can find the task. Renders nothing
// until the task has a number and the organization's prefix is known.
export default function TaskKeyBar({ task, className = "" }) {
    const prefix = useTaskKeyPrefix(task?.task_key_scope)
    const number = task?.task_number
    const key = formatTaskKey(prefix, number)
    if (!key) return null
    return (
        <div className={`flex flex-wrap items-center gap-2 ${className}`}>
            <CopyButton
                text={key}
                icon="tag"
                label={key}
                copiedLabel="Copied"
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-field border border-line text-[11px] font-mono font-semibold text-soft hover:text-white hover:border-line-strong transition-colors cursor-pointer"
            />
            <CopyButton
                text={branchName(prefix, number, task?.title)}
                icon="fork_right"
                label="Copy branch name"
                copiedLabel="Branch name copied"
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted hover:text-white hover:bg-line transition-colors cursor-pointer"
            />
        </div>
    )
}

// Just the key ("DEVNGT-12") as quiet text, for lists; nothing until known
export function TaskKeyText({ task, className = "" }) {
    const key = formatTaskKey(useTaskKeyPrefix(task?.task_key_scope), task?.task_number)
    return key ? <span className={`font-mono text-[11px] text-muted ${className}`}>{key}</span> : null
}
