import { useEffect, useState } from "react"
import { DEFAULT_VIEW, normalizeView } from "../taskViews"
import {
    fetchTaskViews, createTaskView, updateTaskView, deleteTaskView,
    readLastView, rememberLastView, fetchProjectPeople,
} from "../taskViewsData"

/**
 * The Tasks tab's view: what's shown now (remembered per project in this
 * browser), the project's saved views, and the one in use. Handlers resolve
 * to an error message, or null.
 */
export function useTaskViews(projectId) {
    const [view, setView] = useState(() => readLastView(projectId) || normalizeView(DEFAULT_VIEW))
    const [saved, setSaved] = useState({ views: [], isAvailable: false })
    const [activeViewId, setActiveViewId] = useState(null)

    useEffect(() => {
        let active = true
        fetchTaskViews(projectId).then(({ data, isAvailable }) => { if (active) setSaved({ views: data, isAvailable }) })
        return () => { active = false }
    }, [projectId])

    const change = (changes) => setView((prev) => {
        const next = normalizeView({ ...prev, ...changes })
        rememberLastView(projectId, next)
        return next
    })
    const apply = (savedView) => {
        setActiveViewId(savedView.id)
        change(savedView.config)
    }
    const create = async ({ name, isShared }) => {
        const { data, error } = await createTaskView(projectId, { name, config: view, isShared })
        if (error) return error
        setSaved((prev) => ({ ...prev, views: [...prev.views, data].sort((a, b) => a.name.localeCompare(b.name)) }))
        setActiveViewId(data.id)
        return null
    }
    const update = async (savedView) => {
        const { error } = await updateTaskView(savedView.id, { config: view })
        if (error) return error
        setSaved((prev) => ({ ...prev, views: prev.views.map((v) => (v.id === savedView.id ? { ...v, config: view } : v)) }))
        return null
    }
    const remove = async (savedView) => {
        const { error } = await deleteTaskView(savedView.id)
        if (error) return error
        setSaved((prev) => ({ ...prev, views: prev.views.filter((v) => v.id !== savedView.id) }))
        if (activeViewId === savedView.id) setActiveViewId(null)
        return null
    }

    return {
        view, change,
        savedViews: saved.views, isSavingAvailable: saved.isAvailable, activeViewId,
        apply, create, update, remove, reset: () => setActiveViewId(null),
    }
}

/** Everyone a task on the project can go to (its departments and direct members). */
export function useProjectPeople(projectId, departmentIds) {
    const key = `${projectId}|${[...departmentIds].map(String).sort().join(",")}`
    const [state, setState] = useState({ key: "", people: [] })
    useEffect(() => {
        if (!projectId) return undefined
        let active = true
        fetchProjectPeople(projectId, key.split("|")[1].split(",")).then(({ data }) => { if (active) setState({ key, people: data }) })
        return () => { active = false }
    }, [projectId, key])
    return state.key === key ? state.people : []
}
