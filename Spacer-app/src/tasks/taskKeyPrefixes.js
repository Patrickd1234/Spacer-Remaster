import { useEffect, useState } from "react"
import { supabase } from "../supabase"

// Every prefix in the viewer's organization as Map(scope id -> prefix): one
// per project, plus the organization's own (task_key_prefixes()). Loaded
// once per page; empty when unavailable (e.g. before migration
// 20261119100000_task_keys), and tried again next time.
let prefixRequest = null
export function loadPrefixes() {
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
export function useTaskKeyPrefix(scopeId) {
    const [prefix, setPrefix] = useState(null)
    useEffect(() => {
        if (!scopeId) return
        let active = true
        loadPrefixes().then((prefixes) => { if (active) setPrefix(prefixes.get(scopeId) ?? null) })
        return () => { active = false }
    }, [scopeId])
    return prefix
}

// Every prefix at once, for working out many keys (searching by key).
// An empty Map until loaded.
export function useTaskKeyPrefixes() {
    const [prefixes, setPrefixes] = useState(() => new Map())
    useEffect(() => {
        let active = true
        loadPrefixes().then((loaded) => { if (active) setPrefixes(loaded) })
        return () => { active = false }
    }, [])
    return prefixes
}
