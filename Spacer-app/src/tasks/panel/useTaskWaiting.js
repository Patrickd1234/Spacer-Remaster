import { useState } from "react"
import { blockableTasks } from "../../crossDepartment"
import { markTaskWaiting } from "../../crossDepartmentData"
import { taskDepartmentName } from "../waiting"

/**
 * Mark as Waiting and Add dependency for the open task (design screen 05).
 * `canSetFor(task)`: rights to link that task (its assignee or creator, its
 * department's lead, a project manager); without rights on the open task only
 * tasks you have rights on can be picked, as in the dependencies section.
 * `onSaved({ isWaiting })` lets the page reload what changed; `notify(toast)`
 * shows the confirmation ({ type, title, message }).
 * Returns { mode, choices, open(mode), close, confirm }.
 */
export default function useTaskWaiting({ task, tasks, departments, canSetFor, onSaved, notify }) {
    // { mode: "waiting" | "dependency", taskId } or null; it only shows for
    // the task it was opened for, so it can't reappear on another one
    const [opened, setOpened] = useState(null)
    const taskId = task?.id ?? null
    const mode = opened && String(opened.taskId) === String(taskId) ? opened.mode : null
    const all = taskId ? blockableTasks(tasks, taskId) : []
    const choices = task && canSetFor(task) ? all : all.filter(canSetFor)

    const confirm = async ({ blockerId, note }) => {
        if (!taskId || !mode) return "Open a task first."
        const isWaiting = mode === "waiting"
        const { error } = await markTaskWaiting({ taskId, blockerId, note, setWaiting: isWaiting })
        if (error) return error
        const blocker = tasks.find((t) => String(t.id) === String(blockerId))
        const department = taskDepartmentName(blocker, departments)
        const what = department || (blocker ? `“${blocker.title}”` : "another task")
        setOpened(null)
        notify(isWaiting
            ? { type: "success", title: "Task marked as waiting", message: `This task is now waiting on ${what}. The project will be updated.` }
            : { type: "success", title: "Dependency added", message: `This task now waits on ${what}.` })
        await onSaved({ isWaiting })
        return null
    }

    return {
        mode,
        choices,
        open: (next) => setOpened(taskId ? { mode: next, taskId } : null),
        close: () => setOpened(null),
        confirm,
    }
}
