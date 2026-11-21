import { useEffect, useState } from "react"
import { supabase } from "../supabase"
import { formatTaskKey, branchName } from "./taskKey"

const COPIED_MS = 1500

// Every prefix in the viewer's organization as Map(scope id -> prefix): one
// per project, plus the organization's own (task_key_prefixes()). Loaded
// once per page; empty when unavailable (e.g. before migration
// 20261119100000_task_keys), and tried again next time.
let prefixRequest = null
function loadPrefixes() {
    if (!prefixRequest) {
        prefixRequest = supabase.rpc("task_key_prefixes").then(({ data, error }) => {
            if (error) {
                console.warn("Task key prefixes unavailable:", error)
                prefixRequest = null
            }
            return new Map((data || []).map((row) => [row.scope_id, row.prefix]))
        })
    }
    return prefixRequest
}

// The prefix of the project (or organization) the task counts in
function useTaskKeyPrefix(scopeId) {
    const [prefix, setPrefix] = useState(null)
    useEffect(() => {
        if (!scopeId) return
        let active = true
        loadPrefixes().then((prefixes) => { if (active) setPrefix(prefixes.get(scopeId) ?? null) })
        return () => { active = false }
    }, [scopeId])
    return prefix
}

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
