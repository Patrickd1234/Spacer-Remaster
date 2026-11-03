import { useCallback, useEffect, useState } from "react"

// Runs `load` (a stable async () => ({ data, error })) and tracks
// { status: "loading" | "error" | "ready", data }. Returns [state, reload, refresh]:
// reload shows the loading state again; refresh swaps in new data quietly and
// keeps what is shown if the request fails (for live updates).
export function useResource(load) {
    const [state, setState] = useState({ status: "loading", data: null })

    const settle = useCallback((result) =>
        setState(result.error ? { status: "error", data: null } : { status: "ready", data: result.data }), [])

    useEffect(() => {
        let active = true
        load().then((result) => { if (active) settle(result) })
        return () => { active = false }
    }, [load, settle])

    const reload = useCallback(() => {
        setState({ status: "loading", data: null })
        load().then(settle)
    }, [load, settle])

    const refresh = useCallback(() => {
        load().then((result) => { if (!result.error) settle(result) })
    }, [load, settle])

    return [state, reload, refresh]
}
