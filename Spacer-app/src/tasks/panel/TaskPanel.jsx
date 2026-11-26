import { useEffect, useRef, useState } from "react"
import TaskKeyBar, { TaskKeyText } from "../TaskKeyBar"
import { EditableTitle, EditableDescription } from "./EditableText"
import TaskProperties from "./TaskProperties"
import TaskSubtasks from "./TaskSubtasks"
import TaskChecklist from "./TaskChecklist"
import TaskAttachments from "./TaskAttachments"
import TaskActivity from "./TaskActivity"
import { matchesShortcut } from "../../shortcuts"

const COPIED_MS = 1500

// The task panel, opened from a board card, the calendar or a link
// (?task_id=… on the project page). A side sheet on wide screens and the
// whole screen on phones; Escape or the backdrop closes it. Everything is
// edited where it sits. The project page owns the data and the saving; this
// lays it out.

function CopyLinkButton({ url }) {
    const [isCopied, setIsCopied] = useState(false)
    useEffect(() => {
        if (!isCopied) return undefined
        const id = setTimeout(() => setIsCopied(false), COPIED_MS)
        return () => clearTimeout(id)
    }, [isCopied])
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url)
            setIsCopied(true)
        } catch (error) {
            console.error("Copying the link failed:", error)
            window.prompt("Copy this link:", url)
        }
    }
    return (
        <button type="button" onClick={copy} aria-label="Copy a link to this task" title="Copy link" className="w-8 h-8 rounded-md flex items-center justify-center text-muted hover:text-white hover:bg-surface2 transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{isCopied ? "check" : "link"}</span>
        </button>
    )
}

function IconButton({ icon, label, onClick, tone = "hover:text-white" }) {
    return (
        <button type="button" onClick={onClick} aria-label={label} title={label} className={`w-8 h-8 rounded-md flex items-center justify-center text-muted ${tone} hover:bg-surface2 transition-colors cursor-pointer`}>
            <span className="material-symbols-outlined text-[19px]" aria-hidden="true">{icon}</span>
        </button>
    )
}

export default function TaskPanel({
    task, parent, subtasks, projectName, linkUrl,
    columns, columnKey, departmentId, people, awayPeriods, files, uploadState,
    can, dependencies, historyVersion, notice = null, detailsExtra = null, statusNote = null,
    onClose, onOpenTask, onSave, onMove, onDeadlineSave, onChecklistChange,
    onAddSubtask, onToggleSubtask, onUpload, onPreviewFile, onDeleteFile, onDelete, onStep,
}) {
    const sheetRef = useRef(null)
    const nameOf = (id) => people.find((p) => p.id === id)?.name

    // Escape closes, unless something inside (an edit, a menu) used it first;
    // J and K go to the next and previous task, E edits the title
    useEffect(() => {
        const onKey = (e) => {
            if (e.defaultPrevented) return
            if (e.key === "Escape") onClose()
            else if (matchesShortcut(e, "j")) { e.preventDefault(); onStep?.(1) }
            else if (matchesShortcut(e, "k")) { e.preventDefault(); onStep?.(-1) }
            else if (matchesShortcut(e, "e") && can.edit) { e.preventDefault(); document.getElementById("task-panel-title")?.click() }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onClose, onStep, can.edit])
    // Focus moves into the panel, so keyboard and screen reader users land on it
    useEffect(() => { sheetRef.current?.focus() }, [task.id])

    const saveTitle = (title) => (title ? onSave({ title }) : Promise.resolve("A task needs a title."))
    const historyNames = {
        personName: nameOf,
        statusName: (row) => columns.find((c) => c.id && c.id === row.column_id && c.base_status === row.status)?.name,
        taskTitle: (id) => (parent && String(parent.id) === String(id) ? parent.title : null),
    }

    return (
        <div className="fixed inset-0 z-[60] flex justify-end">
            <div className="absolute inset-0 bg-canvas/70 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="task-panel-title"
                tabIndex={-1}
                className="relative w-full md:w-[780px] lg:w-[880px] max-w-full h-full bg-panel border-l border-line shadow-2xl flex flex-col focus:outline-none animate-[task-panel-in_180ms_ease-out]"
            >
                {/* Where the task sits, and what you can do with it */}
                <header className="flex items-center gap-2 px-4 md:px-6 h-14 border-b border-line shrink-0">
                    <nav aria-label="Task location" className="flex items-center gap-1.5 min-w-0 text-[12px] text-muted">
                        <span className="truncate max-w-[10rem]">{projectName}</span>
                        {parent && (
                            <>
                                <span aria-hidden="true">/</span>
                                <button type="button" onClick={() => onOpenTask(parent)} className="flex items-center gap-1 min-w-0 hover:text-white cursor-pointer" title={`Open ${parent.title}`}>
                                    <TaskKeyText task={parent} />
                                    <span className="truncate max-w-[12rem]">{parent.title}</span>
                                </button>
                            </>
                        )}
                    </nav>
                    <div className="ml-auto flex items-center gap-0.5">
                        <CopyLinkButton url={linkUrl} />
                        {can.delete && <IconButton icon="delete" label="Delete this task" tone="hover:text-red-400" onClick={() => onDelete(task)} />}
                        <IconButton icon="close" label="Close" onClick={onClose} />
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto overscroll-contain">
                    <div className="px-4 md:px-6 pt-5 pb-4 space-y-2">
                        <EditableTitle id="task-panel-title" value={task.title} canEdit={can.edit} onSave={saveTitle} />
                        <TaskKeyBar task={task} />
                    </div>

                    <div className="md:grid md:grid-cols-[minmax(0,1fr)_264px] md:items-start">
                        {/* Details first on phones, on the right on wider screens */}
                        <aside className="md:order-2 md:sticky md:top-0 px-4 md:px-5 py-3 md:py-4 md:border-l border-line md:min-h-full">
                            <TaskProperties
                                task={task}
                                columns={columns}
                                columnKey={columnKey}
                                departmentId={departmentId}
                                people={people}
                                awayPeriods={awayPeriods}
                                statusNote={statusNote}
                                canEdit={can.edit}
                                canMove={can.move}
                                canEditDeadline={can.editDeadline}
                                onMove={onMove}
                                onSave={onSave}
                                onDeadlineSave={onDeadlineSave}
                            />
                            {detailsExtra}
                        </aside>

                        <div className="md:order-1 px-4 md:px-6 pb-8 space-y-7 border-t md:border-t-0 border-line pt-5 md:pt-1">
                            {notice}
                            <EditableDescription value={task.description} canEdit={can.edit} onSave={(description) => onSave({ description: description || null })} />
                            {!parent && (
                                <TaskSubtasks
                                    subtasks={subtasks}
                                    canAdd={can.addSubtasks}
                                    canToggle={can.move}
                                    nameOf={nameOf}
                                    onAdd={onAddSubtask}
                                    onToggle={onToggleSubtask}
                                    onOpen={onOpenTask}
                                />
                            )}
                            <TaskChecklist raw={task.sub_tasks} canEdit={can.edit} onChange={onChecklistChange} />
                            <TaskAttachments
                                files={files}
                                canEdit={can.edit}
                                isUploading={uploadState.isUploading}
                                uploadError={uploadState.error}
                                onUpload={onUpload}
                                onPreview={onPreviewFile}
                                onDelete={onDeleteFile}
                            />
                            {dependencies}
                            <TaskActivity taskId={task.id} version={historyVersion} names={historyNames} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
