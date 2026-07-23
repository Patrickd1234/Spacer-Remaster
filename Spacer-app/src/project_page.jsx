import { useState, useEffect, useRef } from "react"
import { Link, useNavigate, useParams, useLocation } from "react-router-dom"
import { supabase } from "./supabase"
import Sidebar from "./partials/sidebar"
import Header from "./partials/header"
import CreateTaskModal from "./partials/CreateTaskModal"
import DocViewer from "./components/DocViewer"

// ─── File helpers ─────────────────────────────────────────────────────────────

const ACCEPTED = [
    "image/*",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
    "application/x-zip-compressed",
    "text/plain",
    "text/csv",
].join(",")

function getFileStyle(type = "") {
    if (type.startsWith("image/"))   return { icon: "image",            color: "text-primary-fixed-dim", bg: "bg-primary-container/20" }
    if (type === "application/pdf")  return { icon: "picture_as_pdf",   color: "text-error",             bg: "bg-error-container/20"    }
    if (type.includes("word") || type === "application/msword")
                                     return { icon: "description",       color: "text-on-surface-variant",bg: "bg-secondary-container"   }
    if (type.includes("sheet") || type === "application/vnd.ms-excel")
                                     return { icon: "table",             color: "text-primary-fixed-dim", bg: "bg-primary-container/10"  }
    if (type.includes("zip"))        return { icon: "folder_zip",        color: "text-on-surface-variant",bg: "bg-secondary-container"   }
    if (type.startsWith("text/"))    return { icon: "article",           color: "text-on-surface-variant",bg: "bg-surface-container"     }
    return                                  { icon: "insert_drive_file", color: "text-on-surface-variant",bg: "bg-surface-container"     }
}

function formatBytes(bytes) {
    if (!bytes) return ""
    if (bytes < 1024)             return bytes + " B"
    if (bytes < 1024 * 1024)      return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
}

// ─── Main Component ───────────────────────────────────────────────────────────

function ProjectPage() {
    const location = useLocation()
    const { project_id } = useParams()
    const [project_name, setProjectName] = useState("Website Redesign")
    const [project_description, setProjectDescription] = useState("Next-gen corporate portal focusing on accessibility, high-performance rendering, and seamless brand integration across all touchpoints.")
    const [project_status, setProjectStatus] = useState("In Progress")
    const [project_due_date, setProjectDueDate] = useState("")
    const [project_tasks, setProjectTasks] = useState([])
    const [activityLog, setActivityLog] = useState([])
    const [activeTab, setActiveTab] = useState("summary")
    const [organizationId, setOrganizationId] = useState("")
    const [teamSpaceId, setTeamSpaceId] = useState("")
    const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false)
    const [createTaskInitialStatus, setCreateTaskInitialStatus] = useState("todo")
    const [dragOverColumn, setDragOverColumn] = useState(null)
    const [selectedTask, setSelectedTask] = useState(null)
    const [orgUsers, setOrgUsers] = useState([])
    const [calendarMonth, setCalendarMonth] = useState(new Date())

    // ── File upload state ─────────────────────────────────────────────────────
    const [projectFiles, setProjectFiles]     = useState([])
    const [showUploadZone, setShowUploadZone] = useState(false)
    const [uploading, setUploading]           = useState(false)
    const [uploadError, setUploadError]       = useState("")
    const [dragOver, setDragOver]             = useState(false)
    const [pendingFile, setPendingFile]       = useState(null)   // file chosen but not yet uploaded
    const [pendingUrl, setPendingUrl]         = useState(null)   // local object URL for pre-upload preview
    const [reviewFile, setReviewFile]         = useState(null)   // file to open in DocViewer (post-upload)
    const [confirmDeleteId, setConfirmDeleteId] = useState(null) // id of file pending inline delete confirm
    const fileInputRef = useRef()

    // ── Fetch uploaded files ──────────────────────────────────────────────────
    const fetchFiles = async () => {
        if (!project_id) return
        const { data, error } = await supabase
            .from("project_files")
            .select("*")
            .eq("project_id", project_id)
            .order("created_at", { ascending: false })
        if (!error) setProjectFiles(data || [])
    }

    // ── When user picks or drops a file ──────────────────────────────────────
    const handleFilePick = (file) => {
        if (!file) return
        // Revoke any previous object URL to avoid memory leaks
        if (pendingUrl) URL.revokeObjectURL(pendingUrl)
        setPendingFile(file)
        setPendingUrl(URL.createObjectURL(file))
        setUploadError("")
    }

    // ── Confirm and upload ────────────────────────────────────────────────────
    const confirmUpload = async () => {
        if (!pendingFile) return
        setUploading(true)
        setUploadError("")

        const path = `${project_id}/${Date.now()}-${pendingFile.name}`

        const { error: storageError } = await supabase.storage
            .from("project-files")
            .upload(path, pendingFile, { contentType: pendingFile.type, upsert: false })

        if (storageError) {
            setUploadError("Upload failed: " + storageError.message)
            setUploading(false)
            return
        }

        const { data: urlData } = supabase.storage.from("project-files").getPublicUrl(path)
        const { data: userData } = await supabase.auth.getUser()
        const uploaderName = userData?.user?.email?.split("@")[0] || "You"

        await supabase.from("project_files").insert({
            project_id,
            name: pendingFile.name,
            type: pendingFile.type,
            size: pendingFile.size,
            path,
            url: urlData?.publicUrl || "",
            uploaded_by: uploaderName,
        })

        // Clean up
        URL.revokeObjectURL(pendingUrl)
        setPendingFile(null)
        setPendingUrl(null)
        setShowUploadZone(false)
        setUploading(false)
        fetchFiles()
    }

    // ── Cancel pre-upload ─────────────────────────────────────────────────────
    const cancelPending = () => {
        if (pendingUrl) URL.revokeObjectURL(pendingUrl)
        setPendingFile(null)
        setPendingUrl(null)
        setUploadError("")
    }

    // ── Delete uploaded file (called only after inline confirmation) ──────────
    const deleteFile = async (f) => {
        await supabase.storage.from("project-files").remove([f.path])
        await supabase.from("project_files").delete().eq("id", f.id)
        setConfirmDeleteId(null)
        fetchFiles()
    }

    // ─── Task handlers (UNCHANGED) ────────────────────────────────────────────
    const handleDragStart = (e, taskId) => {
        e.dataTransfer.setData("taskId", taskId)
    }

    const handleDrop = async (e, newStatus) => {
        e.preventDefault()
        const taskId = e.dataTransfer.getData("taskId")
        if (!taskId) return
        const task = project_tasks.find(t => String(t.id) === String(taskId))
        if (!task || task.status === newStatus) return
        setProjectTasks(prevTasks =>
            prevTasks.map(t => String(t.id) === String(taskId) ? { ...t, status: newStatus } : t)
        )
        const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId)
        if (error) {
            console.error("Error updating task status:", error)
        } else {
            const { data: userData } = await supabase.auth.getUser()
            const logEntry = {
                entity_type: "task", entity_id: taskId, actor_id: userData?.user?.id,
                action: "status_changed",
                new_state: { project_id: project_id, title: task.title, status: newStatus }
            }
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single()
            if (newLog) setActivityLog(prev => [newLog, ...prev])
        }
    }

    const handleDeleteTask = async (taskId, taskTitle) => {
        if (!window.confirm("Are you sure you want to delete this task?")) return
        setProjectTasks(prev => prev.filter(t => t.id !== taskId))
        const { error } = await supabase.from("tasks").delete().eq("id", taskId)
        if (error) {
            console.error("Error deleting task:", error)
        } else {
            const { data: userData } = await supabase.auth.getUser()
            const logEntry = {
                entity_type: "task", entity_id: taskId, actor_id: userData?.user?.id,
                action: "deleted",
                new_state: { project_id: project_id, title: taskTitle }
            }
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single()
            if (newLog) setActivityLog(prev => [newLog, ...prev])
        }
    }

    const handleDragOver = (e) => { e.preventDefault() }

    // ─── Data fetching (UNCHANGED) ────────────────────────────────────────────
    useEffect(() => {
        const fetchProject = async () => {
            if (!project_id) return
            const { data, error } = await supabase
                .from("project_spaces")
                .select("*, team_spaces(organization_id)")
                .eq("id", project_id)
            if (error) {
                console.error("Error fetching project:", error)
            } else if (data && data.length > 0) {
                if (data[0].name) setProjectName(data[0].name)
                if (data[0].description) setProjectDescription(data[0].description)
                if (data[0].status) setProjectStatus(data[0].status)
                if (data[0].due_date) setProjectDueDate(data[0].due_date)
                if (data[0].team_spaces?.organization_id) {
                    setOrganizationId(data[0].team_spaces.organization_id)
                    fetchOrgUsers(data[0].team_spaces.organization_id)
                }
                if (data[0].team_space_id) setTeamSpaceId(data[0].team_space_id)
            }
        }

        const fetchOrgUsers = async (orgId) => {
            if (!orgId) return
            const { data, error } = await supabase.from("users").select("*").eq("organization_id", orgId)
            if (error) { console.error("Error fetching org users:", error) }
            else { setOrgUsers(data || []) }
        }

        const fetchTasks = async () => {
            if (!project_id) return
            const { data, error } = await supabase.from("tasks").select("*").eq("project_id", project_id).order("created_at", { ascending: false })
            if (error) { console.error("Error fetching tasks:", error) }
            else { setProjectTasks(data || []) }
        }

        const fetchActivity = async () => {
            if (!project_id) return
            const { data, error } = await supabase.from("activity_log").select("*, actor:users(name, email)").eq("new_state->>project_id", project_id).order("created_at", { ascending: false }).limit(20)
            if (error) { console.error("Error fetching activity:", error) }
            else { setActivityLog(data || []) }
        }

        fetchProject()
        fetchTasks()
        fetchActivity()
        fetchFiles()
    }, [project_id])

    const assignedMemberIds = new Set(project_tasks.map(t => t.assignee_id).filter(Boolean))
    const assignedMembers = orgUsers.filter(u => assignedMemberIds.has(u.id))

    // ─── Pre-upload preview renderer ─────────────────────────────────────────
    const PreUploadPreview = () => {
        const isImage = pendingFile?.type?.startsWith("image/")
        const isPDF   = pendingFile?.type === "application/pdf"
        const { icon, color, bg } = getFileStyle(pendingFile?.type)

        return (
            <div className="mt-lg border border-outline-variant/40 rounded-xl overflow-hidden">
                {/* Preview area */}
                <div className="bg-surface-container-highest flex items-center justify-center" style={{ minHeight: 220 }}>
                    {isImage && (
                        <img src={pendingUrl} alt={pendingFile.name}
                            className="max-w-full max-h-[220px] object-contain rounded" />
                    )}
                    {isPDF && (
                        <iframe src={pendingUrl} title={pendingFile.name}
                            className="w-full border-0" style={{ height: 220 }} />
                    )}
                    {!isImage && !isPDF && (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <div className={`w-16 h-16 ${bg} flex items-center justify-center rounded-2xl`}>
                                <span className={`material-symbols-outlined text-4xl ${color}`}
                                    style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                            </div>
                            <p className="text-on-surface-variant text-sm">No visual preview available for this file type</p>
                        </div>
                    )}
                </div>

                {/* File info + actions */}
                <div className="bg-surface-container-high px-md py-sm flex items-center justify-between gap-md border-t border-outline-variant/30">
                    <div className="min-w-0">
                        <p className="font-body-md text-on-surface font-semibold truncate">{pendingFile?.name}</p>
                        <p className="text-[11px] text-on-surface-variant">{formatBytes(pendingFile?.size)}</p>
                    </div>
                    <div className="flex items-center gap-sm shrink-0">
                        <button type="button" onClick={cancelPending}
                            className="px-md py-sm rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container text-sm font-semibold transition-colors cursor-pointer">
                            Cancel
                        </button>
                        <button type="button" onClick={confirmUpload} disabled={uploading}
                            className="px-md py-sm rounded-lg bg-[#8bc34a] text-black text-sm font-bold transition-all hover:opacity-90 active:scale-95 cursor-pointer flex items-center gap-xs disabled:opacity-60">
                            {uploading
                                ? <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span> Uploading…</>
                                : <><span className="material-symbols-outlined text-[16px]">cloud_upload</span> Confirm Upload</>
                            }
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <>
            <Sidebar />
            <Header />
            <main className="ml-[260px] mt-16 p-lg h-[calc(100vh-64px)] overflow-y-auto scroll-hide">

                {/* ── Project Header (UNCHANGED) ── */}
                <div className="mb-lg">
                    <div className="flex items-center justify-between gap-xl">
                        <h2 className="font-headline-xl text-headline-xl text-primary leading-tight shrink-0">{project_name || "Website Redesign"}</h2>
                    </div>
                    {/* Sub-Tabs Navigation (UNCHANGED) */}
                    <div className="flex items-center gap-sm mt-xl mb-lg">
                        {[
                            { id: "summary",  label: "Summary",      icon: "dashboard"      },
                            { id: "tasks",    label: "Tasks",        icon: "view_kanban"    },
                            { id: "calendar", label: "Calendar",     icon: "calendar_month" },
                            { id: "files",    label: "Public Files", icon: "folder"         },
                            { id: "members",  label: "Members",      icon: "group"          }
                        ].map(tab => (
                            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md font-label-md text-label-md transition-colors cursor-pointer ${
                                    activeTab === tab.id
                                        ? "bg-[#8bc34a] text-white font-semibold"
                                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50"
                                }`}>
                                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Tab Contents ── */}
                <div id="content-area">

                    {/* ── Summary Tab (UNCHANGED) ── */}
                    {activeTab === "summary" && (
                        <div className="tab-pane block" id="section-summary">
                            <div className="bento-grid">
                                <div className="col-span-12 bg-surface-container-high p-xl rounded-xl glass-panel mb-lg">
                                    <h3 className="font-headline-lg text-headline-lg mb-xl text-on-surface">Task Overview</h3>
                                    <div className="space-y-lg max-w-3xl">
                                        {[
                                            { label: 'Backlog', count: project_tasks.filter(t => t.status === 'todo').length, color: 'text-on-surface', barColor: 'bg-on-surface-variant' },
                                            { label: 'Doing',   count: project_tasks.filter(t => t.status === 'in_progress').length, color: 'text-on-surface', barColor: 'bg-on-surface-variant' },
                                            { label: 'Done',    count: project_tasks.filter(t => t.status === 'done').length, color: 'text-[#8bc34a]', barColor: 'bg-[#8bc34a]' },
                                            { label: 'Overdue', count: project_tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()).length, color: 'text-error', barColor: 'bg-error' },
                                        ].map(stat => {
                                            const total = Math.max(1, project_tasks.length)
                                            const percent = (stat.count / total) * 100
                                            return (
                                                <div key={stat.label} className="flex items-center gap-6">
                                                    <span className={`w-28 text-right font-headline-sm tracking-wide ${stat.color}`}>{stat.label}</span>
                                                    <div className="flex-1 h-3.5 bg-surface-variant rounded-full overflow-hidden">
                                                        <div className={`h-full ${stat.barColor} rounded-full transition-all duration-1000`} style={{ width: `${percent}%` }}></div>
                                                    </div>
                                                    <span className="w-12 font-headline-sm text-on-surface">{stat.count}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                                <div className="col-span-12 bg-surface-container-high p-lg rounded-xl glass-panel">
                                    <h3 className="font-headline-md text-headline-md mb-lg">Recent Activity</h3>
                                    <div className="space-y-lg overflow-y-auto max-h-[600px] scroll-hide">
                                        {activityLog.length === 0 ? (
                                            <p className="text-on-surface-variant font-body-md">No recent activity found.</p>
                                        ) : (
                                            activityLog.map(activity => (
                                                <div key={activity.id} className="flex gap-sm">
                                                    <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden bg-surface-variant flex items-center justify-center font-bold text-xs text-on-surface-variant uppercase">
                                                        {activity.actor?.name?.charAt(0) || '?'}
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-body-sm font-body-sm leading-snug">
                                                            <span className="text-primary font-bold">{activity.actor?.name || 'Unknown User'}</span>{' '}
                                                            {activity.action === "created" && <>created task <span className="text-primary-fixed-dim font-bold">{activity.new_state?.title}</span></>}
                                                            {activity.action === "deleted" && <>deleted task <span className="text-error font-bold">{activity.new_state?.title}</span></>}
                                                            {activity.action === "status_changed" && <>moved task <span className="text-primary-fixed-dim font-bold">{activity.new_state?.title}</span> to <span className="text-on-surface capitalize border border-outline-variant rounded px-1">{activity.new_state?.status?.replace("_", " ")}</span></>}
                                                        </p>
                                                        <p className="text-on-surface-variant text-[10px] mt-xs">{new Date(activity.created_at).toLocaleString()}</p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Tasks Tab — Kanban Board (UNCHANGED) ── */}
                    {activeTab === "tasks" && (
                        <div className="tab-pane block" id="section-tasks">
                            <div className="flex gap-md overflow-x-auto scroll-hide pb-md mt-md" style={{ minHeight: 'calc(100vh - 280px)' }}>
                                {[
                                    { key: "todo",        label: "Backlog", dotColor: "bg-outline-variant" },
                                    { key: "in_progress", label: "Doing",   dotColor: "bg-[#3b82f6]"      },
                                    { key: "done",        label: "Done",    dotColor: "bg-primary-fixed-dim" },
                                ].map(column => {
                                    const columnTasks = project_tasks.filter(t => t.status === column.key)
                                    return (
                                        <div key={column.key}
                                            className={`flex-shrink-0 w-[280px] flex flex-col rounded-xl transition-all duration-200 ${dragOverColumn === column.key ? 'bg-surface-container-high ring-1 ring-primary-fixed-dim/40' : 'bg-surface-container/50'}`}
                                            onDragOver={(e) => { e.preventDefault(); setDragOverColumn(column.key) }}
                                            onDragLeave={() => setDragOverColumn(null)}
                                            onDrop={(e) => { handleDrop(e, column.key); setDragOverColumn(null) }}>
                                            <div className="flex items-center justify-between px-md py-sm sticky top-0 z-10">
                                                <div className="flex items-center gap-sm">
                                                    <span className={`w-2.5 h-2.5 rounded-full ${column.dotColor}`}></span>
                                                    <span className="font-label-md text-label-md text-on-surface font-bold">{column.label}</span>
                                                    <span className="text-[10px] text-on-surface-variant bg-surface-container-highest rounded-full px-[6px] py-[1px] min-w-[18px] text-center">{columnTasks.length}</span>
                                                </div>
                                                <div className="flex items-center gap-[2px]">
                                                    <button type="button" onClick={() => { setCreateTaskInitialStatus(column.key); setIsCreateTaskModalOpen(true) }} className="w-6 h-6 flex items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors cursor-pointer">
                                                        <span className="material-symbols-outlined text-[16px]">add</span>
                                                    </button>
                                                    <button type="button" className="w-6 h-6 flex items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors cursor-pointer">
                                                        <span className="material-symbols-outlined text-[16px]">more_horiz</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex-1 overflow-y-auto scroll-hide px-sm space-y-sm pb-sm">
                                                {columnTasks.map(task => (
                                                    <div key={task.id} draggable onDragStart={(e) => handleDragStart(e, task.id)} onClick={() => setSelectedTask(task)}
                                                        className="bg-surface-container-high border border-outline-variant/30 rounded-lg p-md cursor-pointer active:cursor-grabbing hover:border-outline-variant/60 transition-all group">
                                                        <div className="mb-sm">
                                                            <span className={`inline-flex items-center gap-xs px-sm py-[2px] rounded text-[10px] font-bold uppercase ${task.priority === 'urgent' ? 'bg-error/15 text-error' : task.priority === 'high' ? 'bg-[#f59e0b]/15 text-[#f59e0b]' : task.priority === 'medium' ? 'bg-tertiary/15 text-tertiary' : 'bg-primary-fixed-dim/15 text-primary-fixed-dim'}`}>
                                                                <span className={`w-1.5 h-1.5 rounded-sm ${task.priority === 'urgent' ? 'bg-error' : task.priority === 'high' ? 'bg-[#f59e0b]' : task.priority === 'medium' ? 'bg-tertiary' : 'bg-primary-fixed-dim'}`}></span>
                                                                {task.priority || 'Normal'}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] text-on-surface-variant mb-[2px]">{project_name}</p>
                                                        <h4 className="font-body-md text-on-surface font-bold leading-snug mb-xs">{task.title}</h4>
                                                        {task.description && (
                                                            <p className="text-[11px] text-on-surface-variant/70 leading-relaxed mb-md" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{task.description}</p>
                                                        )}
                                                        <div className="flex items-center justify-between mt-auto pt-sm border-t border-outline-variant/20">
                                                            <div className="flex items-center gap-sm text-on-surface-variant">
                                                                {task.assignee_id && (
                                                                    <div className="w-5 h-5 rounded-full bg-surface-variant flex items-center justify-center" title={task.assignee?.name || 'Assigned'}>
                                                                        <span className="text-[9px] font-bold text-on-surface-variant uppercase">{task.assignee?.name?.charAt(0) || '?'}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-sm text-on-surface-variant">
                                                                {task.due_date && (
                                                                    <span className="flex items-center gap-[3px] text-[10px]">
                                                                        <span className="material-symbols-outlined text-[13px]">calendar_today</span>
                                                                        {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                                    </span>
                                                                )}
                                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id, task.title) }} className="text-on-surface-variant hover:text-error transition-colors cursor-pointer opacity-0 group-hover:opacity-100" title="Delete Task">
                                                                    <span className="material-symbols-outlined text-[13px]">delete</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {columnTasks.length === 0 && (
                                                    <div className="flex flex-col items-center justify-center py-xl text-center opacity-40">
                                                        <span className="material-symbols-outlined text-[32px] text-on-surface-variant mb-xs">drag_indicator</span>
                                                        <p className="text-[11px] text-on-surface-variant">Drag tasks here</p>
                                                    </div>
                                                )}
                                            </div>
                                            <button type="button" onClick={() => { setCreateTaskInitialStatus(column.key); setIsCreateTaskModalOpen(true) }}
                                                className="flex items-center gap-xs px-md py-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/80 transition-colors cursor-pointer rounded-b-xl text-[12px] font-label-md border-t border-outline-variant/10">
                                                <span className="material-symbols-outlined text-[15px]">add</span>Add Task
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Public Files Tab (UPDATED) ── */}
                    {activeTab === "files" && (
                        <div className="tab-pane block" id="section-files">
                            <div className="bg-surface-container-high p-lg rounded-xl glass-panel">

                                {/* Header */}
                                <div className="flex items-center justify-between mb-lg">
                                    <div className="flex items-center gap-sm">
                                        <span className="material-symbols-outlined text-primary-fixed-dim">move_to_inbox</span>
                                        <h3 className="font-headline-md text-headline-md">Input Files</h3>
                                        <span className="text-[11px] text-on-surface-variant">
                                            {projectFiles.length} file{projectFiles.length !== 1 ? "s" : ""}
                                        </span>
                                    </div>
                                    {/* Upload toggle button */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (showUploadZone) { cancelPending(); setShowUploadZone(false) }
                                            else setShowUploadZone(true)
                                        }}
                                        className="flex items-center gap-xs text-label-sm text-primary-fixed-dim font-label-md uppercase tracking-wide hover:underline cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">
                                            {showUploadZone ? "close" : "upload"}
                                        </span>
                                        {showUploadZone ? "Close" : "Upload"}
                                    </button>
                                </div>

                                {/* Upload zone — appears when Upload is clicked */}
                                {showUploadZone && (
                                    <div className="mb-lg">
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept={ACCEPTED}
                                            className="hidden"
                                            onChange={(e) => handleFilePick(e.target.files[0])}
                                        />

                                        {/* Drag-and-drop area — hidden once a file is picked */}
                                        {!pendingFile && (
                                            <div
                                                className={`rounded-xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
                                                    dragOver
                                                        ? "border-[#8bc34a] bg-[#8bc34a]/10"
                                                        : "border-outline-variant hover:border-outline hover:bg-surface-container/50"
                                                }`}
                                                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                                                onDragLeave={() => setDragOver(false)}
                                                onDrop={(e) => {
                                                    e.preventDefault()
                                                    setDragOver(false)
                                                    handleFilePick(e.dataTransfer.files[0])
                                                }}
                                                onClick={() => fileInputRef.current?.click()}
                                            >
                                                <span className="material-symbols-outlined text-on-surface-variant text-6xl">upload_file</span>
                                                <p className="font-body-md text-on-surface font-semibold">Drop a file here or click to browse</p>
                                                <p className="text-[12px] text-on-surface-variant text-center">
                                                    JPG · PNG · PDF · DOCX · XLSX · ZIP · CSV and more
                                                </p>
                                            </div>
                                        )}

                                        {/* Pre-upload preview — shown after file is picked, before confirm */}
                                        {pendingFile && <PreUploadPreview />}

                                        {uploadError && (
                                            <p className="mt-2 text-xs text-error">{uploadError}</p>
                                        )}
                                    </div>
                                )}

                                {/* Uploaded files list */}
                                {projectFiles.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                                        <span className="material-symbols-outlined text-on-surface-variant text-5xl">folder_open</span>
                                        <p className="text-on-surface-variant font-body-md">No files uploaded yet.</p>
                                        <p className="text-[12px] text-on-surface-variant">
                                            Click <strong>Upload</strong> above to add the first file.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-sm">
                                        {projectFiles.map((f) => {
                                            const { icon, color, bg } = getFileStyle(f.type)
                                            const isConfirming = confirmDeleteId === f.id

                                            return (
                                                <div key={f.id} className="rounded-lg overflow-hidden">

                                                    {/* ── Normal file row ── */}
                                                    <div
                                                        className={`flex items-center justify-between p-sm transition-colors group cursor-pointer ${isConfirming ? "bg-error/5" : "hover:bg-surface-container"}`}
                                                        onClick={() => { if (!isConfirming) setReviewFile(f) }}
                                                    >
                                                        <div className="flex items-center gap-md">
                                                            {/* Thumbnail for images, icon for everything else */}
                                                            {f.type?.startsWith("image/") ? (
                                                                <img src={f.url} alt={f.name}
                                                                    className="w-10 h-10 rounded-lg object-cover shrink-0" />
                                                            ) : (
                                                                <div className={`w-10 h-10 ${bg} flex items-center justify-center rounded-lg shrink-0`}>
                                                                    <span className={`material-symbols-outlined ${color}`}
                                                                        style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                                                                </div>
                                                            )}
                                                            <div>
                                                                <p className={`font-body-md text-body-md ${isConfirming ? "text-error" : "text-primary"}`}>{f.name}</p>
                                                                <p className="text-on-surface-variant text-[11px]">
                                                                    {f.uploaded_by ? `Added by ${f.uploaded_by}` : "Uploaded"}
                                                                    {f.size ? ` • ${formatBytes(f.size)}` : ""}
                                                                    {f.created_at ? ` • ${new Date(f.created_at).toLocaleDateString()}` : ""}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Row actions — appear on hover (hidden while confirming) */}
                                                        {!isConfirming && (
                                                            <div className="flex items-center gap-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button type="button" title="Preview"
                                                                    onClick={(e) => { e.stopPropagation(); setReviewFile(f) }}
                                                                    className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-colors text-[18px]">
                                                                    visibility
                                                                </button>
                                                                <a href={f.url} download={f.name} target="_blank" rel="noreferrer"
                                                                    title="Download" onClick={(e) => e.stopPropagation()}
                                                                    className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-colors text-[18px]">
                                                                    download
                                                                </a>
                                                                <button type="button" title="Delete"
                                                                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(f.id) }}
                                                                    className="material-symbols-outlined text-on-surface-variant hover:text-error transition-colors text-[18px]">
                                                                    delete
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* ── Inline delete confirmation bar ── */}
                                                    {isConfirming && (
                                                        <div className="flex items-center justify-between px-sm py-sm bg-error/10 border-t border-error/20">
                                                            <div className="flex items-center gap-xs text-error text-[13px] font-semibold">
                                                                <span className="material-symbols-outlined text-[16px]">warning</span>
                                                                Are you sure you want to delete this file?
                                                            </div>
                                                            <div className="flex items-center gap-sm">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                                                                    className="px-md py-[5px] rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container text-[12px] font-semibold transition-colors cursor-pointer"
                                                                >
                                                                    No, keep it
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); deleteFile(f) }}
                                                                    className="px-md py-[5px] rounded-lg bg-error text-white text-[12px] font-bold hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-xs"
                                                                >
                                                                    <span className="material-symbols-outlined text-[14px]">delete</span>
                                                                    Yes, delete
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Members Tab (UNCHANGED) ── */}
                    {activeTab === "members" && (
                        <div className="tab-pane block" id="section-members">
                            {assignedMembers.length === 0 ? (
                                <div className="bg-surface-container-high rounded-xl p-xl flex flex-col items-center justify-center text-center border border-outline-variant/30">
                                    <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-md opacity-50">group_off</span>
                                    <p className="font-headline-sm text-on-surface mb-xs">No Members Assigned</p>
                                    <p className="font-body-md text-on-surface-variant max-w-md">There are currently no team members assigned to any tasks in this project.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-lg">
                                    {assignedMembers.map((member) => (
                                        <div key={member.id} className="bg-surface-container-high border border-outline-variant/30 rounded-xl p-md flex flex-col h-full relative group transition-colors hover:border-outline-variant/60">
                                            <div className="flex items-start justify-between mb-sm">
                                                <div className="relative">
                                                    <div className="w-12 h-12 rounded-xl overflow-hidden border border-outline-variant bg-surface-variant flex items-center justify-center text-on-surface-variant font-bold text-lg uppercase">
                                                        {member.name?.charAt(0) || "?"}
                                                    </div>
                                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-primary-fixed-dim border-2 border-surface-container-high rounded-full"></div>
                                                </div>
                                                <div className="flex gap-1">
                                                    <span className="px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container text-[9px] font-bold uppercase tracking-tighter">MEMBER</span>
                                                    <button className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-surface-variant text-on-surface-variant transition-colors cursor-pointer">
                                                        <span className="material-symbols-outlined text-xs">more_vert</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="mb-md">
                                                <h4 className="font-headline-md text-body-lg text-on-surface font-bold">{member.name}</h4>
                                                <p className="font-body-sm text-[11px] text-on-surface-variant">member</p>
                                            </div>
                                            <div className="mt-auto flex items-center gap-2">
                                                <button className="flex-1 bg-surface-variant text-on-surface font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5 hover:bg-outline-variant transition-all text-body-sm cursor-pointer">
                                                    <span className="material-symbols-outlined text-sm">chat_bubble</span>Message
                                                </button>
                                                <button className="w-8 h-8 bg-surface-variant text-on-surface rounded-lg flex items-center justify-center hover:bg-outline-variant transition-all cursor-pointer">
                                                    <span className="material-symbols-outlined text-sm">trending_flat</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Calendar Tab (UNCHANGED) ── */}
                    {activeTab === "calendar" && (() => {
                        const startOfCurrentMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)
                        const endOfCurrentMonth   = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0)
                        const startDayOfWeek = startOfCurrentMonth.getDay()
                        const daysInMonth    = endOfCurrentMonth.getDate()
                        const calendarDays   = []
                        for (let i = 0; i < startDayOfWeek; i++) calendarDays.push(null)
                        for (let i = 1; i <= daysInMonth; i++) calendarDays.push(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), i))
                        const formatYMD = (date) => {
                            if (!date) return ""
                            const y = date.getFullYear()
                            const m = String(date.getMonth() + 1).padStart(2, '0')
                            const d = String(date.getDate()).padStart(2, '0')
                            return `${y}-${m}-${d}`
                        }
                        const handlePrevMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))
                        const handleNextMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))
                        return (
                            <div className="tab-pane block h-full min-h-[600px] flex flex-col" id="section-calendar">
                                <div className="flex items-center justify-between pb-md">
                                    <h3 className="font-headline-md text-on-surface font-bold capitalize">
                                        {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <button onClick={handlePrevMonth} className="w-8 h-8 rounded bg-surface-container hover:bg-surface-variant text-on-surface flex items-center justify-center transition-colors cursor-pointer border border-outline-variant/30">
                                            <span className="material-symbols-outlined">chevron_left</span>
                                        </button>
                                        <button onClick={handleNextMonth} className="w-8 h-8 rounded bg-surface-container hover:bg-surface-variant text-on-surface flex items-center justify-center transition-colors cursor-pointer border border-outline-variant/30">
                                            <span className="material-symbols-outlined">chevron_right</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto scroll-hide">
                                    <div className="grid grid-cols-7 gap-px bg-outline-variant/20 overflow-hidden border-y border-outline-variant/30 mt-sm">
                                        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => (
                                            <div key={day} className="bg-surface-container-highest p-2 text-center font-label-sm text-on-surface-variant uppercase tracking-wider">{day}</div>
                                        ))}
                                        {calendarDays.map((date, idx) => {
                                            const dateString = formatYMD(date)
                                            const dayTasks = date ? project_tasks.filter(t => t.due_date && t.due_date.substring(0, 10) === dateString) : []
                                            const isToday  = dateString === formatYMD(new Date())
                                            return (
                                                <div key={idx} className={`min-h-[140px] p-2 transition-colors ${date ? 'bg-surface-container-high hover:bg-surface-container-highest' : 'bg-surface-container-lowest/50'}`}>
                                                    {date && (
                                                        <>
                                                            <div className={`text-right mb-2 flex items-center justify-end gap-1.5 ${isToday ? 'font-bold' : 'text-on-surface-variant'} text-body-md`}>
                                                                {dayTasks.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed-dim" title={`${dayTasks.length} task(s)`}></span>}
                                                                <span className={isToday ? 'inline-block w-7 h-7 leading-7 text-center bg-[#8bc34a] text-black font-bold rounded-full' : ''}>{date.getDate()}</span>
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                {dayTasks.map(task => (
                                                                    <div key={task.id} onClick={() => setSelectedTask(task)}
                                                                        className={`px-2 py-1 text-[11px] font-bold rounded cursor-pointer transition-transform hover:scale-[1.02] truncate border ${task.status === 'done' ? 'bg-[#8bc34a]/10 text-[#8bc34a] border-[#8bc34a]/30' : task.priority === 'urgent' ? 'bg-error/10 text-error border-error/30' : task.priority === 'high' ? 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/30' : 'bg-primary-fixed-dim/10 text-primary-fixed-dim border-primary-fixed-dim/30'}`}
                                                                        title={task.title}>{task.title}</div>
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        )
                    })()}
                </div>
            </main>

            {/* ── FAB (UNCHANGED) ── */}
            <button type="button" onClick={() => { setCreateTaskInitialStatus("todo"); setIsCreateTaskModalOpen(true) }}
                className="fixed bottom-lg right-lg w-14 h-14 bg-primary-fixed-dim text-on-primary rounded-full shadow-[0_8px_32px_rgba(182,255,51,0.3)] flex items-center justify-center hover:scale-105 transition-transform active:scale-95 group z-30 cursor-pointer">
                <span className="material-symbols-outlined text-[28px] font-bold">add</span>
                <span className="absolute right-full mr-md px-md py-sm bg-surface-container text-on-surface font-label-md text-label-md rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap border border-outline-variant">Quick Add Task</span>
            </button>

            {isCreateTaskModalOpen && (
                <CreateTaskModal projectId={project_id} organizationId={organizationId} teamSpaceId={teamSpaceId}
                    initialStatus={createTaskInitialStatus} onClose={() => setIsCreateTaskModalOpen(false)}
                    onCreated={(newTask) => { setProjectTasks(prev => [newTask, ...prev]) }} />
            )}

            {/* ── Task Details Sidebar (UNCHANGED) ── */}
            {selectedTask && (
                <div className="fixed inset-0 z-[60] flex justify-end">
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity" onClick={() => setSelectedTask(null)}></div>
                    <div className="relative w-full max-w-md bg-surface-container-high shadow-2xl h-full overflow-y-auto flex flex-col transform transition-transform duration-300 border-l border-outline-variant/30">
                        <div className="flex items-center justify-between p-lg border-b border-outline-variant/30 bg-surface-container-highest">
                            <h2 className="font-headline-md text-primary-container font-bold flex items-center gap-sm">
                                <span className="material-symbols-outlined">task</span>Task Details
                            </h2>
                            <button className="text-on-surface-variant hover:text-on-surface hover:bg-surface-variant w-8 h-8 rounded flex items-center justify-center transition-colors cursor-pointer" onClick={() => setSelectedTask(null)}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-lg space-y-xl flex-1">
                            <div>
                                <h1 className="font-headline-lg text-on-surface font-bold mb-md leading-tight">{selectedTask.title}</h1>
                                <div className="flex flex-wrap gap-sm">
                                    <span className="px-md py-1.5 bg-surface-container-highest border border-outline-variant/50 text-on-surface-variant rounded text-xs uppercase font-bold tracking-wider flex items-center gap-xs">
                                        <span className="material-symbols-outlined text-[14px]">flag</span>{selectedTask.status.replace('_', ' ')}
                                    </span>
                                    <span className={`px-md py-1.5 rounded border text-xs font-bold uppercase tracking-wider flex items-center gap-xs ${selectedTask.priority === 'urgent' ? 'bg-error/10 border-error/30 text-error' : selectedTask.priority === 'high' ? 'bg-[#f59e0b]/10 border-[#f59e0b]/30 text-[#f59e0b]' : selectedTask.priority === 'medium' ? 'bg-tertiary/10 border-tertiary/30 text-tertiary' : 'bg-primary-fixed-dim/10 border-primary-fixed-dim/30 text-primary-fixed-dim'}`}>
                                        <span className="material-symbols-outlined text-[14px]">bolt</span>{selectedTask.priority || 'Normal'}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <h3 className="font-label-md text-on-surface-variant uppercase tracking-wider mb-sm flex items-center gap-xs">
                                    <span className="material-symbols-outlined text-[16px]">description</span>Description
                                </h3>
                                {selectedTask.description ? (
                                    <p className="font-body-md text-on-surface whitespace-pre-wrap leading-relaxed bg-surface-container-low p-md rounded-xl border border-outline-variant/20">{selectedTask.description}</p>
                                ) : (
                                    <div className="bg-surface-container-lowest p-md rounded-xl border border-outline-variant/20 border-dashed flex flex-col items-center justify-center gap-sm text-center">
                                        <span className="material-symbols-outlined text-on-surface-variant/50 text-3xl">notes</span>
                                        <p className="font-body-sm text-on-surface-variant/70 italic">No description provided for this task.</p>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-md">
                                <div className="bg-surface-container p-md rounded-xl border border-outline-variant/20 flex flex-col gap-xs">
                                    <h3 className="font-label-sm text-on-surface-variant uppercase tracking-wider flex items-center gap-xs">
                                        <span className="material-symbols-outlined text-[14px]">person</span>Assignee
                                    </h3>
                                    {selectedTask.assignee ? (
                                        <div className="flex items-center gap-sm mt-1">
                                            <div className="w-6 h-6 rounded-full bg-surface-variant flex items-center justify-center text-[10px] font-bold text-on-surface-variant uppercase">{selectedTask.assignee.name.charAt(0)}</div>
                                            <p className="font-body-md text-on-surface font-semibold">{selectedTask.assignee.name}</p>
                                        </div>
                                    ) : (
                                        <p className="font-body-md text-on-surface mt-1 italic opacity-70">Unassigned</p>
                                    )}
                                </div>
                                <div className="bg-surface-container p-md rounded-xl border border-outline-variant/20 flex flex-col gap-xs">
                                    <h3 className="font-label-sm text-on-surface-variant uppercase tracking-wider flex items-center gap-xs">
                                        <span className="material-symbols-outlined text-[14px]">calendar_today</span>Deadline
                                    </h3>
                                    <p className="font-body-md text-on-surface font-semibold mt-1">
                                        {selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : <span className="italic opacity-70">No deadline</span>}
                                    </p>
                                </div>
                            </div>
                            <div className="pt-md mt-auto flex justify-between items-center text-[11px] text-on-surface-variant border-t border-outline-variant/20">
                                <span>ID: <span className="font-mono text-on-surface opacity-70">{String(selectedTask.id).substring(0, 8)}</span></span>
                                <span>Created {new Date(selectedTask.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Post-upload file review modal ── */}
            {reviewFile && (
                <DocViewer file={reviewFile} onClose={() => setReviewFile(null)} />
            )}
        </>
    )
}

export default ProjectPage
