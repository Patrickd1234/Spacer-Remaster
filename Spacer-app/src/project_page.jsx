import { useState, useEffect, useRef } from "react"
import { useParams } from "react-router-dom"
import { supabase } from "./supabase"
import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"
import CreateTaskModal from "./partials/CreateTaskModal"
import DocViewer from "./components/DocViewer"

const ACCEPTED = [
    "image/*", "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip", "application/x-zip-compressed", "text/plain", "text/csv",
].join(",")

function getFileStyle(type = "") {
    if (type.startsWith("image/")) return { icon: "image", color: "text-primary-fixed-dim", bg: "bg-primary-container/20" }
    if (type === "application/pdf") return { icon: "picture_as_pdf", color: "text-error", bg: "bg-error-container/20" }
    if (type.includes("word") || type === "application/msword")
        return { icon: "description", color: "text-[#8c947b]", bg: "bg-[#191c21]" }
    if (type.includes("sheet") || type === "application/vnd.ms-excel")
        return { icon: "table", color: "text-[#aff82a]", bg: "bg-[#aff82a]/10" }
    if (type.includes("zip")) return { icon: "folder_zip", color: "text-[#8c947b]", bg: "bg-[#191c21]" }
    if (type.startsWith("text/")) return { icon: "article", color: "text-[#8c947b]", bg: "bg-[#191c21]" }
    return { icon: "insert_drive_file", color: "text-[#8c947b]", bg: "bg-[#191c21]" }
}

function formatBytes(bytes) {
    if (!bytes) return ""
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
}


function ProjectPage() {
    const { project_id } = useParams()
    const [project_name, setProjectName] = useState("Website Redesign")
    const [project_description, setProjectDescription] = useState("Corporate portal redesign featuring accessible dark mode theme, optimized rendering, and unified design tokens.")
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
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [calendarMonth, setCalendarMonth] = useState(new Date())
    const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false)
    const [newSubtaskTitle, setNewSubtaskTitle] = useState("")
    const [selectedDateEvents, setSelectedDateEvents] = useState(null)
    const [sidebarActionMenuOpen, setSidebarActionMenuOpen] = useState(false)
    const [creatingInSidebar, setCreatingInSidebar] = useState(null)
    const [project_events, setProjectEvents] = useState([])

    // ── Delete project
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deletingProject, setDeletingProject] = useState(false)
    const [userRole, setUserRole] = useState(null)
    const [showActionBlocked, setShowActionBlocked] = useState(false)

    // ── Members
    const [projectMembers, setProjectMembers] = useState([])
    const [showAddMemberModal, setShowAddMemberModal] = useState(false)

    // ── File upload state
    const [projectFiles, setProjectFiles] = useState([])
    const [showUploadZone, setShowUploadZone] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState("")
    const [dragOver, setDragOver] = useState(false)
    const [pendingFile, setPendingFile] = useState(null)
    const [pendingUrl, setPendingUrl] = useState(null)
    const [reviewFile, setReviewFile] = useState(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState(null)
    const fileInputRef = useRef()

    const updateTaskPriority = async (taskId, newPriority) => {
        const task = project_tasks.find(t => String(t.id) === String(taskId))
        setSelectedTask(prev => prev ? { ...prev, priority: newPriority } : null)
        setProjectTasks(prevTasks =>
            prevTasks.map(t =>
                String(t.id) === String(taskId) ? { ...t, priority: newPriority } : t
            )
        )
        const { error } = await supabase.from('tasks').update({ priority: newPriority }).eq('id', taskId)
        if (error) {
            console.error("Error updating priority", error)
        } else if (task) {
            const { data: userData } = await supabase.auth.getUser()
            const logEntry = {
                entity_type: "task",
                entity_id: taskId,
                actor_id: userData?.user?.id,
                action: "priority_changed",
                new_state: { project_id: project_id, title: task.title, priority: newPriority }
            }
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single()
            if (newLog) setActivityLog(prev => [newLog, ...prev])
        }
    }

    const updateTaskSubtasks = async (taskId, newSubtasks) => {
        const allDone = newSubtasks.length > 0 && newSubtasks.every(st => st.done)
        const anyDone = newSubtasks.some(st => st.done)
        const task = project_tasks.find(t => String(t.id) === String(taskId))
        if (!task) return

        let newStatus = task.status
        let statusChanged = false

        if (allDone) {
            if (task.status !== 'done') {
                newStatus = 'done'
                statusChanged = true
            }
        } else if (newSubtasks.length === 0 || !anyDone) {
            if (task.status !== 'todo') {
                newStatus = 'todo'
                statusChanged = true
            }
        } else {
            if (task.status !== 'in_progress') {
                newStatus = 'in_progress'
                statusChanged = true
            }
        }

        const serialized = JSON.stringify(newSubtasks)

        setSelectedTask(prev => prev && String(prev.id) === String(taskId) ? { ...prev, sub_tasks: serialized, status: newStatus } : prev)
        setProjectTasks(prevTasks =>
            prevTasks.map(t =>
                String(t.id) === String(taskId) ? { ...t, sub_tasks: serialized, status: newStatus } : t
            )
        )

        const updatePayload = { sub_tasks: serialized }
        if (statusChanged) {
            updatePayload.status = newStatus
        }

        const { error } = await supabase.from('tasks').update(updatePayload).eq('id', taskId)
        if (error) {
            console.error("Error updating subtasks", error)
        } else if (statusChanged) {
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

    // ─── Task handlers (UNCHANGED) ────────────────────────────────────────────
    const handleDragStart = (e, taskId) => {
        e.dataTransfer.setData("taskId", taskId)
    }

    const handleDrop = async (e, newStatus) => {
        e.preventDefault()
        const taskId = e.dataTransfer.getData("taskId")
        if (!taskId) return
        const task = project_tasks.find(t => String(t.id) === String(taskId))
        if (!task) return

        let subtasksList = [];
        if (task.sub_tasks) {
            try {
                subtasksList = JSON.parse(task.sub_tasks);
                if (!Array.isArray(subtasksList)) subtasksList = [];
            } catch (err) { }
        }

        const allDone = subtasksList.length > 0 && subtasksList.every(st => st.done);
        const anyDone = subtasksList.some(st => st.done);

        let allowedStatus = task.status;
        if (allDone) {
            allowedStatus = 'done';
        } else if (subtasksList.length === 0 || !anyDone) {
            allowedStatus = 'todo';
        } else {
            allowedStatus = 'in_progress';
        }

        if (newStatus !== allowedStatus) return;
        if (task.status === newStatus) return

        setProjectTasks(prevTasks =>
            prevTasks.map(t =>
                String(t.id) === String(taskId) ? { ...t, status: newStatus } : t
            )
        )

        const { error } = await supabase
            .from("tasks")
            .update({ status: newStatus })
            .eq("id", taskId)

        if (error) {
            console.error("Error updating overdue task:", error)
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
        if (!window.confirm("Are you sure you want to delete this task?")) return;

        // Optimistically remove from UI
        setProjectTasks(prev => prev.filter(t => t.id !== taskId));

        const { error } = await supabase
            .from("tasks")
            .delete()
            .eq("id", taskId);

        if (error) {
            console.error("Error deleting task:", error);
            // Revert state if needed, but keeping it simple here
        } else {
            const { data: userData } = await supabase.auth.getUser()
            const logEntry = {
                entity_type: "task", entity_id: taskId, actor_id: userData?.user?.id,
                action: "deleted",
                new_state: { project_id: project_id, title: taskTitle }
            };
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single();
            if (newLog) setActivityLog(prev => [newLog, ...prev]);
        }
    }

    //     const handleDragOver = (e) => {
    //         e.preventDefault()
    // }

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
                if (data[0].team_space_id) {
                    setTeamSpaceId(data[0].team_space_id)
                    // Fetch current user's role for this team space
                    const userId = localStorage.getItem("userId")
                    if (userId) {
                        const { data: membershipData } = await supabase
                            .from("memberships")
                            .select("role")
                            .eq("user_id", userId)
                            .eq("team_space_id", data[0].team_space_id)
                            .maybeSingle()
                        setUserRole(membershipData?.role ?? "member")
                    }
                }
            }
        }

        const fetchOrgUsers = async (orgId) => {
            if (!orgId) return
            const { data, error } = await supabase
                .from("users")
                .select("*")
                .eq("organization_id", orgId)
            if (error) {
                console.error("Error fetching org users:", error)
            } else {
                setOrgUsers(data || [])
            }
        }

        const fetchTasks = async () => {
            if (!project_id) return
            const { data, error } = await supabase.from("tasks").select("*").eq("project_id", project_id).order("created_at", { ascending: false })
            if (error) { console.error("Error fetching tasks:", error) }
            else {
                const corrected = data.map(t => {
                    let subtasksList = [];
                    if (t.sub_tasks) {
                        try {
                            subtasksList = JSON.parse(t.sub_tasks);
                            if (!Array.isArray(subtasksList)) subtasksList = [];
                        } catch (e) { }
                    }
                    const allDone = subtasksList.length > 0 && subtasksList.every(st => st.done);
                    const anyDone = subtasksList.some(st => st.done);

                    let expectedStatus = t.status;
                    if (allDone) {
                        expectedStatus = 'done';
                    } else if (subtasksList.length === 0 || !anyDone) {
                        expectedStatus = 'todo';
                    } else {
                        expectedStatus = 'in_progress';
                    }

                    if (t.status !== expectedStatus) {
                        supabase.from('tasks').update({ status: expectedStatus }).eq('id', t.id).then(({ error }) => {
                            if (error) console.error("Error auto-correcting task status", error);
                        });
                        return { ...t, status: expectedStatus };
                    }
                    return t;
                });
                setProjectTasks(corrected);
                const urlParams = new URLSearchParams(window.location.search);
                const taskIdParam = urlParams.get("task_id");
                if (taskIdParam) {
                    const taskToOpen = corrected.find(t => String(t.id) === String(taskIdParam));
                    if (taskToOpen) {
                        setSelectedTask(taskToOpen);
                        setActiveTab("tasks");
                    }
                }
            }
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
        fetchProjectMembers()
    }, [project_id])

    const fetchProjectMembers = async () => {
        if (!project_id) return
        const { data, error } = await supabase
            .from("project_members")
            .select("*, user:users(*)")
            .eq("project_id", project_id)
        if (!error) setProjectMembers(data || [])
    }

    // ── Delete this project
    const handleDeleteProject = async () => {
        setDeletingProject(true)
        const { error } = await supabase.from("project_spaces").delete().eq("id", project_id)
        if (error) {
            console.error("Error deleting project:", error)
            setDeletingProject(false)
            return
        }
        // Navigate home after deletion
        window.location.href = "/"
    }

    const assignedMemberIds = new Set(project_tasks.map(t => t.assignee_id).filter(Boolean))
    const assignedMembers = orgUsers.filter(u => assignedMemberIds.has(u.id))

    // ── File handlers
    const fetchFiles = async () => {
        if (!project_id) return
        const { data, error } = await supabase
            .from("project_files").select("*").eq("project_id", project_id)
            .order("created_at", { ascending: false })
        if (!error) setProjectFiles(data || [])
    }
    const handleFilePick = (file) => {
        if (!file) return
        if (pendingUrl) URL.revokeObjectURL(pendingUrl)
        setPendingFile(file)
        setPendingUrl(URL.createObjectURL(file))
        setUploadError("")
    }
    const cancelPending = () => {
        if (pendingUrl) URL.revokeObjectURL(pendingUrl)
        setPendingFile(null); setPendingUrl(null); setUploadError("")
    }
    const confirmUpload = async () => {
        if (!pendingFile) return
        setUploading(true); setUploadError("")
        const path = `${project_id}/${Date.now()}-${pendingFile.name}`
        const { error: storageError } = await supabase.storage
            .from("project-files").upload(path, pendingFile, { contentType: pendingFile.type, upsert: false })
        if (storageError) { setUploadError("Upload failed: " + storageError.message); setUploading(false); return }
        const { data: urlData } = supabase.storage.from("project-files").getPublicUrl(path)
        const { data: userData } = await supabase.auth.getUser()
        const uploaderName = userData?.user?.email?.split("@")[0] || "You"
        const { data: fileData, error: dbError } = await supabase.from("project_files").insert({
            project_id, name: pendingFile.name, type: pendingFile.type,
            size: pendingFile.size, path, url: urlData?.publicUrl || "",
            uploaded_by: uploaderName,
        }).select().single()

        if (!dbError && fileData) {
            const logEntry = {
                entity_type: "file",
                entity_id: fileData.id,
                actor_id: userData?.user?.id,
                action: "file_added",
                new_state: { project_id: project_id, name: pendingFile.name }
            }
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single()
            if (newLog) setActivityLog(prev => [newLog, ...prev])
        }

        URL.revokeObjectURL(pendingUrl)
        setPendingFile(null); setPendingUrl(null); setShowUploadZone(false); setUploading(false)
        fetchFiles()
    }
    const deleteFile = async (f) => {
        await supabase.storage.from("project-files").remove([f.path])
        const { error } = await supabase.from("project_files").delete().eq("id", f.id)
        if (!error) {
            const { data: userData } = await supabase.auth.getUser()
            const logEntry = {
                entity_type: "file",
                entity_id: f.id,
                actor_id: userData?.user?.id,
                action: "file_removed",
                new_state: { project_id: project_id, name: f.name }
            }
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single()
            if (newLog) setActivityLog(prev => [newLog, ...prev])
        }
        setConfirmDeleteId(null); fetchFiles()
    }

    const PreUploadPreview = () => {
        const isImage = pendingFile?.type?.startsWith("image/")
        const isPDF = pendingFile?.type === "application/pdf"
        const { icon, color, bg } = getFileStyle(pendingFile?.type)
        return (
            <div className="mt-lg border border-[#2D3139]/40 rounded-xl overflow-hidden">
                <div className="bg-[#1C1F26] flex items-center justify-center" style={{ minHeight: 220 }}>
                    {isImage && <img src={pendingUrl} alt={pendingFile.name} className="max-w-full max-h-[220px] object-contain rounded" />}
                    {isPDF && <iframe src={pendingUrl} title={pendingFile.name} className="w-full border-0" style={{ height: 220 }} />}
                    {!isImage && !isPDF && (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <div className={`w-16 h-16 ${bg} flex items-center justify-center rounded-2xl`}>
                                <span className={`material-symbols-outlined text-4xl ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                            </div>
                            <p className="text-[#8c947b] text-sm">No visual preview for this file type</p>
                        </div>
                    )}
                </div>
                <div className="bg-[#191c21] px-md py-sm flex items-center justify-between gap-md border-t border-[#2D3139]/30">
                    <div className="min-w-0">
                        <p className="font-body-md text-white font-semibold truncate">{pendingFile?.name}</p>
                        <p className="text-[11px] text-[#8c947b]">{formatBytes(pendingFile?.size)}</p>
                    </div>
                    <div className="flex items-center gap-sm shrink-0">
                        <button type="button" onClick={cancelPending} className="px-md py-sm rounded-lg border border-[#2D3139] text-[#8c947b] hover:bg-[#2D3139] text-sm font-semibold transition-colors cursor-pointer">Cancel</button>
                        <button type="button" onClick={confirmUpload} disabled={uploading} className="px-md py-sm rounded-lg bg-[#aff82a] text-[#1C1F26] font-bold hover:opacity-90 active:scale-95 cursor-pointer flex items-center gap-xs disabled:opacity-60">
                            {uploading
                                ? <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span> Uploading…</>
                                : <><span className="material-symbols-outlined text-[16px]">cloud_upload</span> Confirm Upload</>}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-[#0F1115] min-h-screen text-white font-sans antialiased">
            <Sidebar onCollapsedChange={setSidebarCollapsed} />
            <Header />
            <main className="ml-[260px] mt-16 p-lg h-[calc(100vh-64px)] overflow-y-auto scroll-hide">
                {/* Project Header */}
                <div className="mb-lg">
                    <div className="flex items-center justify-between gap-xl">
                        <h2 className="font-headline-xl text-headline-xl text-primary leading-tight shrink-0">{project_name || "Website Redesign"}</h2>
                    </div>
                    {/* Sub-Tabs Navigation */}
                    <div className="flex items-center gap-sm mt-xl mb-lg">
                        {[
                            { id: "summary", label: "Summary", icon: "dashboard" },
                            { id: "tasks", label: "Tasks", icon: "view_kanban" },
                            { id: "calendar", label: "Calendar", icon: "calendar_month" },
                            { id: "files", label: "Public Files", icon: "folder" },
                            { id: "members", label: "Members", icon: "group" }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md font-label-md text-label-md transition-colors cursor-pointer ${activeTab === tab.id
                                    ? "bg-[#8bc34a] text-white font-semibold"
                                    : "text-[#8c947b] hover:text-white hover:bg-[#2D3139]/50"
                                    }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}

                        {/* Trash — delete current project */}
                        <button
                            type="button"
                            title="Delete this project"
                            onClick={() => {
                                const canDelete = userRole === "admin" || userRole === "super_admin" || userRole === "superadmin"
                                if (canDelete) setShowDeleteConfirm(true)
                                else setShowActionBlocked(true)
                            }}
                            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-md text-[#8c947b] hover:text-red-400 hover:bg-red-950/20 transition-colors cursor-pointer text-[13px] font-medium"
                        >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                            Delete project
                        </button>
                    </div>
                </div>
                {/* Tab Contents */}
                <div id="content-area">
                    {/* Summary Tab */}
                    {activeTab === "summary" && (
                        <div className="tab-pane block" id="section-summary">
                            <div className="bento-grid">
                                {/* Task Status Overview */}
                                <div className="col-span-12 bg-[#191c21] border border-[#2D3139] p-xl rounded-xl mb-lg">
                                    <h3 className="font-headline-lg text-headline-lg mb-xl text-white">Task Overview</h3>
                                    <div className="space-y-lg max-w-3xl">
                                        {[
                                            { label: 'Backlog', count: project_tasks.filter(t => t.status === 'todo').length, color: 'text-white', barColor: 'bg-[#8c947b]' },
                                            { label: 'Doing', count: project_tasks.filter(t => t.status === 'in_progress').length, color: 'text-white', barColor: 'bg-[#8c947b]' },
                                            { label: 'Done', count: project_tasks.filter(t => t.status === 'done').length, color: 'text-[#aff82a]', barColor: 'bg-[#aff82a]' },
                                            { label: 'Overdue', count: project_tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()).length, color: 'text-error', barColor: 'bg-error' },
                                        ].map(stat => {
                                            const total = Math.max(1, project_tasks.length);
                                            const percent = (stat.count / total) * 100;
                                            return (
                                                <div key={stat.label} className="flex items-center gap-6">
                                                    <span className={`w-28 text-right font-headline-sm tracking-wide ${stat.color}`}>{stat.label}</span>
                                                    <div className="flex-1 h-3.5 bg-[#2D3139] rounded-full overflow-hidden">
                                                        <div className={`h-full ${stat.barColor} rounded-full transition-all duration-1000`} style={{ width: `${percent}%` }}></div>
                                                    </div>
                                                    <span className="w-12 font-headline-sm text-white">{stat.count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Recent Activity Feed (Full Width) */}
                                <div className="col-span-12 bg-[#191c21] border border-[#2D3139] p-lg rounded-xl">
                                    <h3 className="font-headline-md text-headline-md mb-lg text-white">Recent Activity</h3>
                                    <div className="space-y-lg overflow-y-auto max-h-[600px] scroll-hide">
                                        {activityLog.length === 0 ? (
                                            <p className="text-[#8c947b] font-body-md">No recent activity found.</p>
                                        ) : (
                                            activityLog.map(activity => (
                                                <div key={activity.id} className="flex gap-sm">
                                                    <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden bg-[#2D3139] flex items-center justify-center font-bold text-xs text-[#8c947b] uppercase">
                                                        {activity.actor?.name?.charAt(0) || '?'}
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-body-sm font-body-sm leading-snug">
                                                            <span className="text-primary font-bold">{activity.actor?.name || 'Unknown User'}</span>
                                                            {' '}
                                                            {activity.action === "created" && (
                                                                <>created task <span className="text-primary-fixed-dim font-bold">{activity.new_state?.title}</span></>
                                                            )}
                                                            {activity.action === "deleted" && (
                                                                <>deleted task <span className="text-error font-bold">{activity.new_state?.title}</span></>
                                                            )}
                                                            {activity.action === "status_changed" && (
                                                                <>moved task <span className="text-primary-fixed-dim font-bold">{activity.new_state?.title}</span> to <span className="text-white capitalize border border-[#2D3139] rounded px-1">{activity.new_state?.status?.replace("_", " ")}</span></>
                                                            )}
                                                            {activity.action === "priority_changed" && (
                                                                <>changed priority of task <span className="text-primary-fixed-dim font-bold">{activity.new_state?.title}</span> to <span className="text-white capitalize border border-[#2D3139] rounded px-1">{activity.new_state?.priority}</span></>
                                                            )}
                                                            {activity.action === "file_added" && (
                                                                <>uploaded file <span className="text-primary-fixed-dim font-bold">{activity.new_state?.name}</span></>
                                                            )}
                                                            {activity.action === "file_removed" && (
                                                                <>deleted file <span className="text-error font-bold">{activity.new_state?.name}</span></>
                                                            )}
                                                        </p>
                                                        <p className="text-[#8c947b] text-[10px] mt-xs">{new Date(activity.created_at).toLocaleString()}</p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tasks Tab — Kanban Board */}
                    {activeTab === "tasks" && (
                        <div className="tab-pane block" id="section-tasks">
                            <div className="flex gap-md overflow-x-auto scroll-hide pb-md mt-md" style={{ minHeight: 'calc(100vh - 280px)' }}>
                                {[
                                    { key: "todo", label: "Backlog", dotColor: "bg-[#2D3139]" },
                                    { key: "in_progress", label: "Doing", dotColor: "bg-[#3b82f6]" },
                                    { key: "done", label: "Done", dotColor: "bg-primary-fixed-dim" },
                                    { key: "overdue", label: "Overdue", dotColor: "bg-error" },
                                ].map(column => {
                                    const columnTasks = project_tasks.filter(t => {
                                        if (t.status === "done") return column.key === "done";
                                        const isOverdue = t.due_date && new Date(t.due_date) < new Date();
                                        if (isOverdue) return column.key === "overdue";
                                        return column.key === t.status;
                                    });
                                    return (
                                        <div
                                            key={column.key}
                                            className="flex-shrink-0 w-[280px] flex flex-col rounded-xl transition-all duration-200 bg-[#191c21]/50 border border-[#2D3139]/30"
                                        >
                                            {/* Column Header */}
                                            <div className="flex items-center justify-between px-md py-sm sticky top-0 z-10">
                                                <div className="flex items-center gap-sm">
                                                    <span className={`w-2.5 h-2.5 rounded-full ${column.dotColor}`}></span>
                                                    <span className="font-label-md text-label-md text-white font-bold">{column.label}</span>
                                                    <span className="text-[10px] text-[#8c947b] bg-[#1C1F26] border border-[#2D3139]/50 rounded-full px-[6px] py-[1px] min-w-[18px] text-center">{columnTasks.length}</span>
                                                </div>
                                            </div>

                                            {/* Task Cards */}
                                            <div className="flex-1 overflow-y-auto scroll-hide px-sm space-y-sm pb-sm">
                                                {columnTasks.map(task => (
                                                    <div
                                                        key={task.id}
                                                        onClick={() => setSelectedTask(task)}
                                                        className="bg-[#191c21] border border-[#2D3139] rounded-lg p-md cursor-pointer hover:border-[#aff82a]/50 transition-all group"
                                                    >
                                                        {/* Priority Badge */}
                                                        <div className="mb-sm">
                                                            <span className={`inline-flex items-center gap-xs px-sm py-[2px] rounded text-[10px] font-bold uppercase ${task.priority === 'urgent' ? 'bg-error/15 text-error' :
                                                                task.priority === 'high' ? 'bg-[#f59e0b]/15 text-[#f59e0b]' :
                                                                    task.priority === 'medium' ? 'bg-tertiary/15 text-tertiary' :
                                                                        'bg-primary-fixed-dim/15 text-primary-fixed-dim'
                                                                }`}>
                                                                <span className={`w-1.5 h-1.5 rounded-sm ${task.priority === 'urgent' ? 'bg-error' :
                                                                    task.priority === 'high' ? 'bg-[#f59e0b]' :
                                                                        task.priority === 'medium' ? 'bg-tertiary' :
                                                                            'bg-primary-fixed-dim'
                                                                    }`}></span>
                                                                {task.priority || 'Normal'}
                                                            </span>
                                                        </div>

                                                        {/* Project Name */}
                                                        <p className="text-[11px] text-[#8c947b] mb-[2px]">{project_name}</p>

                                                        {/* Task Title */}
                                                        <h4 className="font-body-md text-white font-bold leading-snug mb-xs">{task.title}</h4>

                                                        {/* Description */}
                                                        {task.description && (
                                                            <p className="text-[11px] text-[#8c947b]/70 leading-relaxed mb-md" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{task.description}</p>
                                                        )}

                                                        {/* Sub-tasks Progress Bar */}
                                                        {(() => {
                                                            let subtasksList = [];
                                                            if (task.sub_tasks) {
                                                                try {
                                                                    subtasksList = JSON.parse(task.sub_tasks);
                                                                    if (!Array.isArray(subtasksList)) subtasksList = [];
                                                                } catch (e) { }
                                                            }
                                                            if (subtasksList.length === 0) return null;

                                                            const completedCount = subtasksList.filter(st => st.done).length;
                                                            const totalCount = subtasksList.length;
                                                            const percent = (completedCount / totalCount) * 100;

                                                            return (
                                                                <div className="mb-md">
                                                                    <div className="flex items-center justify-between text-[10px] text-[#8c947b] mb-1 font-medium">
                                                                        <span className="flex items-center gap-xs">
                                                                            <span className="material-symbols-outlined text-[12px]">format_list_bulleted</span>
                                                                            Sub-tasks
                                                                        </span>
                                                                        <span>{completedCount}/{totalCount}</span>
                                                                    </div>
                                                                    <div className="w-full bg-[#1e222b] rounded-full h-1 overflow-hidden">
                                                                        <div
                                                                            className="bg-[#aff82a] h-full transition-all duration-300"
                                                                            style={{ width: `${percent}%` }}
                                                                        ></div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}

                                                        {/* Footer */}
                                                        <div className="flex items-center justify-between mt-auto pt-sm border-t border-[#2D3139]/20">
                                                            <div className="flex items-center gap-sm text-[#8c947b]">
                                                                {(() => {
                                                                    const assignee = orgUsers.find(u => u.id === task.assignee_id);
                                                                    return task.assignee_id ? (
                                                                        <div className="w-5 h-5 rounded-full bg-[#1C1F26] border border-[#2D3139] flex items-center justify-center" title={assignee?.name || 'Assigned'}>
                                                                            <span className="text-[9px] font-bold text-[#8c947b] uppercase">
                                                                                {assignee?.name?.charAt(0) || '?'}
                                                                            </span>
                                                                        </div>
                                                                    ) : null;
                                                                })()}
                                                            </div>
                                                            <div className="flex items-center gap-sm text-[#8c947b]">
                                                                {task.due_date && (
                                                                    <span className="flex items-center gap-[3px] text-[10px]">
                                                                        <span className="material-symbols-outlined text-[13px]">calendar_today</span>
                                                                        {task.due_date.includes('T') || task.due_date.includes(' ')
                                                                            ? new Date(task.due_date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                                                                            : new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                                    </span>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id, task.title); }}
                                                                    className="text-[#8c947b] hover:text-error transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                                                                    title="Delete Task"
                                                                >
                                                                    <span className="material-symbols-outlined text-[13px]">delete</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {columnTasks.length === 0 && (
                                                    <div className="flex flex-col items-center justify-center py-xl text-center opacity-40">
                                                        <span className="material-symbols-outlined text-[32px] text-[#8c947b] mb-xs">drag_indicator</span>
                                                        <p className="text-[11px] text-[#8c947b]">Drag tasks here</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {selectedDateEvents && (
                        <>
                            {/* Backdrop */}
                            <div
                                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                                onClick={() => setSelectedDateEvents(null)}
                            ></div>
                            {/* Sidebar */}
                            <div className="fixed top-0 right-0 z-50 w-1/2 h-full bg-[#191c21] border-l border-[#2D3139] shadow-2xl flex flex-col transform transition-transform duration-300">
                                <div className="flex items-center justify-between p-lg border-b border-[#2D3139]/20 shrink-0">
                                    <h2 className="font-headline-md text-white">
                                        Schedule for {selectedDateEvents.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                    </h2>
                                    <div className="flex items-center gap-sm relative">
                                        <button
                                            className="text-[#8c947b] hover:text-white cursor-pointer w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#2D3139] transition-colors relative"
                                            onClick={() => setSidebarActionMenuOpen(!sidebarActionMenuOpen)}
                                        >
                                            <span className="material-symbols-outlined">add</span>
                                        </button>
                                        {sidebarActionMenuOpen && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setSidebarActionMenuOpen(false)}></div>
                                                <div className="absolute right-0 top-full mt-1 w-48 bg-[#1C1F26] border border-[#2D3139] rounded-lg shadow-xl z-[70] overflow-hidden">
                                                    <button
                                                        className="w-full text-left px-4 py-3 hover:bg-[#2D3139] transition-colors flex items-center gap-3 text-sm font-medium text-white cursor-pointer"
                                                        onClick={() => { setSidebarActionMenuOpen(false); setCreatingInSidebar('task'); }}
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">task</span> Add Task
                                                    </button>
                                                    <button
                                                        className="w-full text-left px-4 py-3 hover:bg-[#2D3139] transition-colors flex items-center gap-3 text-sm font-medium text-white cursor-pointer"
                                                        onClick={() => { setSidebarActionMenuOpen(false); setCreatingInSidebar('meeting'); }}
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">event</span> Add Meeting
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                        <button className="text-[#8c947b] hover:text-white cursor-pointer w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#2D3139] transition-colors" onClick={() => { setSelectedDateEvents(null); setCreatingInSidebar(null); setSidebarActionMenuOpen(false); }}>
                                            <span className="material-symbols-outlined">close</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="p-lg overflow-y-auto flex-1 scroll-hide space-y-md">
                                    {creatingInSidebar === 'task' ? (
                                        <div className="h-full flex flex-col">
                                            <button onClick={() => setCreatingInSidebar(null)} className="mb-4 text-sm font-medium text-[#8c947b] flex items-center gap-1 hover:text-white transition-colors cursor-pointer w-fit">
                                                <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to schedule
                                            </button>
                                            <CreateTaskModal
                                                projectId={project_id}
                                                organizationId={organizationId}
                                                teamSpaceId={teamSpaceId}
                                                initialStatus="todo"
                                                initialDate={selectedDateEvents ? `${selectedDateEvents.getFullYear()}-${String(selectedDateEvents.getMonth() + 1).padStart(2, '0')}-${String(selectedDateEvents.getDate()).padStart(2, '0')}T09:00` : ""}
                                                isInline={true}
                                                onClose={() => setCreatingInSidebar(null)}
                                                onCreated={(newTask) => {
                                                    setProjectTasks(prev => [newTask, ...prev])
                                                    setCreatingInSidebar(null)
                                                }}
                                            />
                                        </div>
                                    ) : creatingInSidebar === 'meeting' ? (
                                        <div className="h-full flex flex-col">
                                            <button onClick={() => setCreatingInSidebar(null)} className="mb-4 text-sm font-medium text-[#8c947b] flex items-center gap-1 hover:text-white transition-colors cursor-pointer w-fit">
                                                <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to schedule
                                            </button>
                                            <div className="flex-1 flex items-center justify-center bg-[#191c21] rounded-xl border border-[#2D3139]/20 border-dashed p-6 text-center">
                                                <p className="text-[#8c947b] italic">Meeting creation functionality coming soon...</p>
                                            </div>
                                        </div>
                                    ) : (() => {
                                        const formatYMD = (date) => {
                                            if (!date) return ""
                                            const y = date.getFullYear()
                                            const m = String(date.getMonth() + 1).padStart(2, '0')
                                            const d = String(date.getDate()).padStart(2, '0')
                                            return `${y}-${m}-${d}`
                                        }
                                        const dateString = formatYMD(selectedDateEvents);
                                        const dayTasks = project_tasks.filter(t => t.due_date && t.due_date.substring(0, 10) === dateString);
                                        const dayEvents = project_events.filter(e => e.event_date && e.event_date.substring(0, 10) === dateString);

                                        const combined = [
                                            ...dayEvents.map(e => ({ ...e, isEvent: true, sortTime: new Date(e.event_date).getTime(), originalDateStr: e.event_date })),
                                            ...dayTasks.map(t => ({ ...t, isTask: true, sortTime: new Date(t.due_date).getTime(), originalDateStr: t.due_date }))
                                        ].sort((a, b) => a.sortTime - b.sortTime);

                                        if (combined.length === 0) {
                                            return <p className="text-[#8c947b] text-center italic py-md">Nothing scheduled for this day.</p>;
                                        }

                                        return combined.map(item => (
                                            <div
                                                key={(item.isEvent ? 'evt-' : 'tsk-') + item.id}
                                                onClick={() => {
                                                    if (!item.isEvent) {
                                                        setSelectedTask(item);
                                                    }
                                                }}
                                                className={`bg-[#191c21] p-md rounded-xl border border-[#2D3139]/20 flex flex-col gap-xs ${!item.isEvent ? 'cursor-pointer hover:border-primary-fixed-dim/50 transition-colors hover:shadow-lg' : ''}`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1 ${item.isEvent ? 'bg-[#9c27b0]/20 text-[#9c27b0]' : 'bg-primary-fixed-dim/20 text-primary-fixed-dim'
                                                        }`}>
                                                        <span className="material-symbols-outlined text-[12px]">{item.isEvent ? 'event' : 'task'}</span>
                                                        {item.isEvent ? 'Event' : 'Task'}
                                                    </span>
                                                    <span className="text-xs text-[#8c947b] font-medium">
                                                        {(item.originalDateStr.includes('T') || item.originalDateStr.includes(' '))
                                                            ? new Date(item.sortTime).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                                                            : 'All Day'}
                                                    </span>
                                                </div>
                                                <h3 className="font-body-lg text-white font-semibold mt-1">{item.title}</h3>
                                                {item.description && <p className="text-body-sm text-[#8c947b] line-clamp-2">{item.description}</p>}
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Public Files Tab */}
                    {activeTab === "files" && (
                        <div className="tab-pane block" id="section-files">
                            <div className="bg-[#191c21] p-lg rounded-xl glass-panel">
                                {/* Header */}
                                <div className="flex items-center justify-between mb-lg">
                                    <div className="flex items-center gap-sm">
                                        <span className="material-symbols-outlined text-primary-fixed-dim">move_to_inbox</span>
                                        <h3 className="font-headline-md text-headline-md">Project Files</h3>
                                        <span className="text-[11px] text-[#8c947b]">
                                            {projectFiles.length} file{projectFiles.length !== 1 ? "s" : ""}
                                        </span>
                                    </div>
                                    <button type="button"
                                        onClick={() => { if (showUploadZone) { cancelPending(); setShowUploadZone(false) } else setShowUploadZone(true) }}
                                        className="flex items-center gap-xs text-label-sm text-primary-fixed-dim font-label-md uppercase tracking-wide hover:underline cursor-pointer">
                                        <span className="material-symbols-outlined text-[16px]">{showUploadZone ? "close" : "upload"}</span>
                                        {showUploadZone ? "Close" : "Upload"}
                                    </button>
                                </div>

                                {/* Upload zone */}
                                {showUploadZone && (
                                    <div className="mb-lg">
                                        <input ref={fileInputRef} type="file" accept={ACCEPTED} className="hidden"
                                            onChange={(e) => handleFilePick(e.target.files[0])} />
                                        {!pendingFile && (
                                            <div
                                                className={`rounded-xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${dragOver ? "border-[#8bc34a] bg-[#8bc34a]/10" : "border-[#2D3139] hover:border-outline hover:bg-[#2D3139]/50"}`}
                                                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                                                onDragLeave={() => setDragOver(false)}
                                                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFilePick(e.dataTransfer.files[0]) }}
                                                onClick={() => fileInputRef.current?.click()}>
                                                <span className="material-symbols-outlined text-[#8c947b] text-6xl">upload_file</span>
                                                <p className="font-body-md text-white font-semibold">Drop a file here or click to browse</p>
                                                <p className="text-[12px] text-[#8c947b] text-center">JPG · PNG · PDF · DOCX · XLSX · ZIP · CSV and more</p>
                                            </div>
                                        )}
                                        {pendingFile && <PreUploadPreview />}
                                        {uploadError && <p className="mt-2 text-xs text-error">{uploadError}</p>}
                                    </div>
                                )}

                                {/* File list */}
                                {projectFiles.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                                        <span className="material-symbols-outlined text-[#8c947b] text-5xl">folder_open</span>
                                        <p className="text-[#8c947b] font-body-md">No files uploaded yet.</p>
                                        <p className="text-[12px] text-[#8c947b]">Click <strong>Upload</strong> above to add the first file.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-sm">
                                        {projectFiles.map((f) => {
                                            const { icon, color, bg } = getFileStyle(f.type)
                                            const isConfirming = confirmDeleteId === f.id
                                            return (
                                                <div key={f.id} className="rounded-lg overflow-hidden">
                                                    <div
                                                        className={`flex items-center justify-between p-sm transition-colors group cursor-pointer ${isConfirming ? "bg-error/5" : "hover:bg-[#2D3139]"}`}
                                                        onClick={() => { if (!isConfirming) setReviewFile(f) }}>
                                                        <div className="flex items-center gap-md">
                                                            {f.type?.startsWith("image/") ? (
                                                                <img src={f.url} alt={f.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                                                            ) : (
                                                                <div className={`w-10 h-10 ${bg} flex items-center justify-center rounded-lg shrink-0`}>
                                                                    <span className={`material-symbols-outlined ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                                                                </div>
                                                            )}
                                                            <div>
                                                                <p className={`font-body-md text-body-md ${isConfirming ? "text-error" : "text-primary"}`}>{f.name}</p>
                                                                <p className="text-[#8c947b] text-[11px]">
                                                                    {f.uploaded_by ? `Added by ${f.uploaded_by}` : "Uploaded"}
                                                                    {f.size ? ` · ${formatBytes(f.size)}` : ""}
                                                                    {f.created_at ? ` · ${new Date(f.created_at).toLocaleDateString()}` : ""}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {!isConfirming && (
                                                            <div className="flex items-center gap-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button type="button" title="Preview"
                                                                    onClick={(e) => { e.stopPropagation(); setReviewFile(f) }}
                                                                    className="material-symbols-outlined text-[#8c947b] hover:text-white transition-colors text-[18px]">visibility</button>
                                                                <a href={f.url} download={f.name} target="_blank" rel="noreferrer"
                                                                    title="Download" onClick={(e) => e.stopPropagation()}
                                                                    className="material-symbols-outlined text-[#8c947b] hover:text-white transition-colors text-[18px]">download</a>
                                                                <button type="button" title="Delete"
                                                                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(f.id) }}
                                                                    className="material-symbols-outlined text-[#8c947b] hover:text-error transition-colors text-[18px]">delete</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {isConfirming && (
                                                        <div className="flex items-center justify-between px-sm py-sm bg-error/10 border-t border-error/20">
                                                            <div className="flex items-center gap-xs text-error text-[13px] font-semibold">
                                                                <span className="material-symbols-outlined text-[16px]">warning</span>
                                                                Are you sure you want to delete this file?
                                                            </div>
                                                            <div className="flex items-center gap-sm">
                                                                <button type="button"
                                                                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                                                                    className="px-md py-[5px] rounded-lg border border-[#2D3139] text-[#8c947b] hover:bg-[#2D3139] text-[12px] font-semibold transition-colors cursor-pointer">No, keep it</button>
                                                                <button type="button"
                                                                    onClick={(e) => { e.stopPropagation(); deleteFile(f) }}
                                                                    className="px-md py-[5px] rounded-lg bg-error text-white text-[12px] font-bold hover:opacity-90 cursor-pointer flex items-center gap-xs">
                                                                    <span className="material-symbols-outlined text-[14px]">delete</span>Yes, delete
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

                    {/* Members Tab */}
                    {activeTab === "members" && (() => {
                        // Merge explicitly added project_members with task-assigned members, no duplicates
                        const explicitIds = new Set(projectMembers.map(pm => pm.user_id))
                        const explicitUsers = projectMembers.map(pm => pm.user).filter(Boolean)
                        const taskOnlyMembers = assignedMembers.filter(u => !explicitIds.has(u.id))
                        const allMembers = [...explicitUsers, ...taskOnlyMembers]
                        const removeMember = async (userId) => {
                            await supabase.from("project_members").delete().eq("project_id", project_id).eq("user_id", userId)
                            fetchProjectMembers()
                        }
                        return (
                        <div className="tab-pane block" id="section-members">
                            {allMembers.length === 0 ? (
                                <div className="bg-[#191c21] rounded-xl p-xl flex flex-col items-center justify-center text-center border border-[#2D3139]/30">
                                    <span className="material-symbols-outlined text-4xl text-[#8c947b] mb-md opacity-50">group_off</span>
                                    <p className="font-headline-sm text-white mb-xs">No Members Yet</p>
                                    <p className="font-body-md text-[#8c947b] max-w-md">Tap the <strong className="text-white">+</strong> button to add team members to this project.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-lg">
                                    {allMembers.map((member) => (
                                        <div
                                            key={member.id}
                                            className="bg-[#191c21] border border-[#2D3139]/30 rounded-xl p-md flex flex-col h-full relative group transition-colors hover:border-[#2D3139]/60"
                                        >
                                            <div className="flex items-start justify-between mb-sm">
                                                <div className="relative">
                                                    <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#2D3139] bg-[#1C1F26] flex items-center justify-center text-[#8c947b] font-bold text-lg uppercase">
                                                        {member.name?.charAt(0) || "?"}
                                                    </div>
                                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-primary-fixed-dim border-2 border-[#191c21] rounded-full"></div>
                                                </div>
                                                <div className="flex gap-1">
                                                    <span className="px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container text-[9px] font-bold uppercase tracking-tighter">
                                                        MEMBER
                                                    </span>
                                                    <button className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-[#2D3139] text-[#8c947b] transition-colors cursor-pointer">
                                                        <span className="material-symbols-outlined text-xs">more_vert</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="mb-md">
                                                <h4 className="font-headline-md text-body-lg text-white font-bold">
                                                    {member.name}
                                                </h4>
                                                <p className="font-body-sm text-[11px] text-[#8c947b]">
                                                    member
                                                </p>
                                            </div>
                                            <div className="mt-auto flex items-center gap-2">
                                                <button className="flex-1 bg-[#1C1F26] text-white font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5 hover:bg-[#2D3139] transition-all text-body-sm cursor-pointer">
                                                    <span className="material-symbols-outlined text-sm">chat_bubble</span>
                                                    Message
                                                </button>
                                                {explicitIds.has(member.id) && (
                                                    <button
                                                        title="Remove from project"
                                                        onClick={() => removeMember(member.id)}
                                                        className="w-8 h-8 bg-red-950/20 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-950/40 transition-all cursor-pointer"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">person_remove</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        )
                    })()}

                    {/* Calendar Tab */}
                    {activeTab === "calendar" && (() => {
                        const startOfCurrentMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
                        const endOfCurrentMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
                        const startDayOfWeek = startOfCurrentMonth.getDay(); // 0 = Sunday, 1 = Monday...
                        const daysInMonth = endOfCurrentMonth.getDate();

                        const calendarDays = [];
                        // Pad start of month
                        for (let i = 0; i < startDayOfWeek; i++) {
                            calendarDays.push(null);
                        }
                        // Add days
                        for (let i = 1; i <= daysInMonth; i++) {
                            calendarDays.push(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), i));
                        }

                        const formatYMD = (date) => {
                            if (!date) return "";
                            const y = date.getFullYear();
                            const m = String(date.getMonth() + 1).padStart(2, '0');
                            const d = String(date.getDate()).padStart(2, '0');
                            return `${y}-${m}-${d}`;
                        };

                        const handlePrevMonth = () => {
                            setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
                        };

                        const handleNextMonth = () => {
                            setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
                        };

                        return (
                            <div className="tab-pane block h-full min-h-[600px] flex flex-col" id="section-calendar">
                                {/* Calendar Header */}
                                <div className="flex items-center justify-between pb-4 border-b border-[#2D3139] shrink-0">
                                    <h3 className="text-lg font-bold text-white capitalize">
                                        {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <button onClick={handlePrevMonth} className="w-8 h-8 rounded-lg bg-[#1e2025] hover:bg-[#2D3139] text-[#8c947b] hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-[#2D3139]">
                                            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                                        </button>
                                        <button onClick={handleNextMonth} className="w-8 h-8 rounded-lg bg-[#1e2025] hover:bg-[#2D3139] text-[#8c947b] hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-[#2D3139]">
                                            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                                        </button>
                                    </div>
                                </div>
                                {/* Calendar Grid */}
                                <div className="flex-1 overflow-y-auto min-h-0 mt-4">
                                    <div className="grid grid-cols-7 gap-px bg-[#2D3139] overflow-hidden rounded-lg border border-[#2D3139]">
                                        {/* Day Names */}
                                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                                            <div key={day} className="bg-[#181a20] p-3 text-center text-xs font-bold text-[#8c947b] uppercase tracking-wider">
                                                {day}
                                            </div>
                                        ))}
                                        {/* Day Cells */}
                                        {calendarDays.map((date, idx) => {
                                            const dateString = formatYMD(date);
                                            const dayTasks = date ? project_tasks.filter(t => t.due_date && t.due_date.substring(0, 10) === dateString) : [];
                                            const dayEvents = date ? project_events.filter(e => e.event_date && e.event_date.substring(0, 10) === dateString) : [];
                                            const isToday = dateString === formatYMD(new Date());

                                            return (
                                                <div
                                                    key={idx}
                                                    onClick={() => date && setSelectedDateEvents(date)}
                                                    className={`min-h-[120px] p-3 transition-colors cursor-pointer ${date ? 'bg-[#191c21] hover:bg-[#1C1F26]' : 'bg-[#111318]'}`}
                                                >
                                                    {date && (
                                                        <>
                                                            <div className={`text-right mb-2 flex items-center justify-end gap-1 text-xs ${isToday ? 'font-bold' : 'text-[#8c947b]'}`}>
                                                                {dayEvents.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-purple-400" title={`${dayEvents.length} event(s)`}></span>}
                                                                {dayTasks.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#aff82a]" title={`${dayTasks.length} task(s)`}></span>}
                                                                <span className={isToday ? 'inline-flex items-center justify-center w-6 h-6 bg-[#5b644d] text-white font-bold rounded-full text-[11px]' : ''}>
                                                                    {date.getDate()}
                                                                </span>
                                                            </div>
                                                            <div className="space-y-1">
                                                                {dayEvents.map(event => (
                                                                    <div
                                                                        key={`evt-${event.id}`}
                                                                        className="px-2 py-1 text-[10px] font-medium rounded truncate bg-purple-500/10 text-purple-400 border border-purple-500/30"
                                                                        title={event.title}
                                                                    >
                                                                        {event.title}
                                                                    </div>
                                                                ))}
                                                                {dayTasks.map(task => (
                                                                    <div
                                                                        key={task.id}
                                                                        onClick={(e) => { e.stopPropagation(); setSelectedTask(task); }}
                                                                        className={`px-2 py-1 text-[10px] font-medium rounded truncate border ${task.status === 'done' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                                                                            'bg-[#aff82a]/10 text-[#aff82a] border-[#aff82a]/30'
                                                                            }`}
                                                                        title={task.title}
                                                                    >
                                                                        {task.title}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </main>
            {/* ── Context-aware FAB ── */}
            {(() => {
                const fabConfig = {
                    files:   { icon: "upload",      label: "Upload File",    action: () => { setShowUploadZone(true); window.scrollTo({ top: 0, behavior: "smooth" }) } },
                    members: { icon: "person_add",  label: "Add Member",     action: () => setShowAddMemberModal(true) },
                }
                const cfg = fabConfig[activeTab] || { icon: "add", label: "Quick Add Task", action: () => { setCreateTaskInitialStatus("todo"); setIsCreateTaskModalOpen(true) } }
                return (
                    <button
                        type="button"
                        onClick={cfg.action}
                        className="fixed bottom-lg right-lg w-14 h-14 bg-primary-fixed-dim text-on-primary rounded-full shadow-[0_8px_32px_rgba(182,255,51,0.3)] flex items-center justify-center hover:scale-105 transition-transform active:scale-95 group z-30 cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[28px] font-bold">{cfg.icon}</span>
                        <span className="absolute right-full mr-md px-md py-sm bg-[#191c21] text-white font-label-md text-label-md rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap border border-[#2D3139]">
                            {cfg.label}
                        </span>
                    </button>
                )
            })()}
            {isCreateTaskModalOpen && (
                <CreateTaskModal projectId={project_id} organizationId={organizationId} teamSpaceId={teamSpaceId}
                    initialStatus={createTaskInitialStatus} onClose={() => setIsCreateTaskModalOpen(false)}
                    onCreated={(newTask) => { setProjectTasks(prev => [newTask, ...prev]) }} />
            )}

            {/* Task Details Sidebar */}
            {selectedTask && (
                <div className="fixed inset-0 z-[60] flex justify-end">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
                        onClick={() => setSelectedTask(null)}
                    ></div>

                    {/* Sidebar */}
                    <div className="relative w-1/2 bg-[#191c21] shadow-2xl h-full overflow-y-auto flex flex-col transform transition-transform duration-300 border-l border-[#2D3139]">
                        {/* Header */}
                        <div className="flex items-center justify-between p-lg border-b border-[#2D3139]/30 bg-[#1C1F26]">
                            <h2 className="font-headline-md text-white font-bold flex items-center gap-sm">
                                <span className="material-symbols-outlined">task</span>
                                Task Details
                            </h2>
                            <button
                                className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] w-8 h-8 rounded flex items-center justify-center transition-colors cursor-pointer"
                                onClick={() => setSelectedTask(null)}
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-lg space-y-xl flex-1">
                            <div>
                                <h1 className="font-headline-lg text-white font-bold mb-md leading-tight">{selectedTask.title}</h1>
                                <div className="flex flex-wrap gap-sm">
                                    {(() => {
                                        const isOverdue = selectedTask.status !== 'done' && selectedTask.due_date && new Date(selectedTask.due_date) < new Date();
                                        const displayStatus = isOverdue ? 'overdue' : selectedTask.status;
                                        return (
                                            <span className={`px-md py-1.5 border rounded text-xs uppercase font-bold tracking-wider flex items-center gap-xs ${isOverdue ? 'bg-error/10 border-error/30 text-error' : 'bg-[#1C1F26] border border-[#2D3139]/50 text-[#8c947b]'
                                                }`}>
                                                <span className="material-symbols-outlined text-[14px]">{isOverdue ? 'error' : 'flag'}</span>
                                                {displayStatus.replace('_', ' ')}
                                            </span>
                                        );
                                    })()}
                                    <div className="relative">
                                        <button
                                            className={`px-md py-1.5 rounded border text-xs font-bold uppercase tracking-wider flex items-center gap-xs cursor-pointer hover:opacity-80 transition-opacity ${selectedTask.priority === 'urgent' ? 'bg-error/10 border-error/30 text-error' :
                                                selectedTask.priority === 'high' ? 'bg-[#f59e0b]/10 border-[#f59e0b]/30 text-[#f59e0b]' :
                                                    selectedTask.priority === 'medium' ? 'bg-tertiary/10 border-tertiary/30 text-tertiary' :
                                                        'bg-primary-fixed-dim/10 border-primary-fixed-dim/30 text-primary-fixed-dim'
                                                }`}
                                            onClick={() => setPriorityDropdownOpen(!priorityDropdownOpen)}
                                        >
                                            <span className="material-symbols-outlined text-[14px]">bolt</span>
                                            {selectedTask.priority || 'Normal'}
                                        </button>
                                        {priorityDropdownOpen && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setPriorityDropdownOpen(false)}></div>
                                                <div className="absolute left-0 top-full mt-1 w-32 bg-[#1C1F26] border border-[#2D3139] rounded-lg shadow-xl z-[70] overflow-hidden flex flex-col">
                                                    {['low', 'medium', 'high', 'urgent'].map(p => (
                                                        <button
                                                            key={p}
                                                            className={`text-left px-4 py-2 hover:bg-[#2D3139] transition-colors text-xs font-bold uppercase cursor-pointer ${selectedTask.priority === p ? 'text-primary' : 'text-white'}`}
                                                            onClick={() => {
                                                                updateTaskPriority(selectedTask.id, p);
                                                                setPriorityDropdownOpen(false);
                                                            }}
                                                        >
                                                            {p}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-label-md text-[#8c947b] uppercase tracking-wider mb-sm flex items-center gap-xs">
                                    <span className="material-symbols-outlined text-[16px]">description</span>
                                    Description
                                </h3>
                                {selectedTask.description ? (
                                    <p className="font-body-md text-white whitespace-pre-wrap leading-relaxed bg-[#14171d] p-md rounded-xl border border-[#2D3139]/20">{selectedTask.description}</p>
                                ) : (
                                    <div className="bg-[#0F1115] p-md rounded-xl border border-[#2D3139]/20 border-dashed flex flex-col items-center justify-center gap-sm text-center">
                                        <span className="material-symbols-outlined text-[#8c947b]/50 text-3xl">notes</span>
                                        <p className="font-body-sm text-[#8c947b]/70 italic">No description provided for this task.</p>
                                    </div>
                                )}
                            </div>

                            <div>
                                <h3 className="font-label-md text-[#8c947b] uppercase tracking-wider mb-sm flex items-center gap-xs">
                                    <span className="material-symbols-outlined text-[16px]">format_list_bulleted</span>
                                    Sub-tasks
                                </h3>
                                {(() => {
                                    let subtasksList = [];
                                    if (selectedTask.sub_tasks) {
                                        try {
                                            subtasksList = JSON.parse(selectedTask.sub_tasks);
                                            if (!Array.isArray(subtasksList)) subtasksList = [];
                                        } catch (e) {
                                            console.error("Failed to parse sub_tasks:", e);
                                        }
                                    }

                                    const handleToggleSubtask = (stId) => {
                                        const updated = subtasksList.map(st =>
                                            st.id === stId ? { ...st, done: !st.done } : st
                                        );
                                        updateTaskSubtasks(selectedTask.id, updated);
                                    };

                                    const handleDeleteSubtask = (stId) => {
                                        const updated = subtasksList.filter(st => st.id !== stId);
                                        updateTaskSubtasks(selectedTask.id, updated);
                                    };

                                    const handleAddSubtask = (e) => {
                                        e.preventDefault();
                                        if (!newSubtaskTitle.trim()) return;
                                        const newSub = {
                                            id: Math.random().toString(36).substring(2, 9),
                                            title: newSubtaskTitle.trim(),
                                            done: false
                                        };
                                        updateTaskSubtasks(selectedTask.id, [...subtasksList, newSub]);
                                        setNewSubtaskTitle("");
                                    };

                                    return (
                                        <div className="space-y-sm bg-[#14171d] p-md rounded-xl border border-[#2D3139]/20">
                                            {subtasksList.length > 0 ? (
                                                <div className="space-y-xs max-h-48 overflow-y-auto pr-xs">
                                                    {subtasksList.map(st => (
                                                        <div key={st.id} className="flex items-center justify-between gap-sm group/sub">
                                                            <label className="flex items-center gap-sm cursor-pointer flex-1 py-0.5">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={st.done}
                                                                    onChange={() => handleToggleSubtask(st.id)}
                                                                    className="w-4 h-4 rounded border-[#2D3139] text-primary focus:ring-primary cursor-pointer"
                                                                />
                                                                <span className={`text-sm text-white leading-tight transition-all ${st.done ? 'line-through text-[#8c947b]/50' : ''}`}>
                                                                    {st.title}
                                                                </span>
                                                            </label>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteSubtask(st.id)}
                                                                className="text-[#8c947b] hover:text-white opacity-0 group-hover/sub:opacity-100 transition-opacity cursor-pointer flex items-center justify-center p-0.5 rounded hover:bg-[#2D3139]"
                                                            >
                                                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-[#8c947b]/60 italic pb-xs">No sub-tasks yet.</p>
                                            )}
                                            <form onSubmit={handleAddSubtask} className="flex items-center gap-xs pt-xs border-t border-[#2D3139]/10">
                                                <input
                                                    type="text"
                                                    placeholder="Add a sub-task..."
                                                    value={newSubtaskTitle}
                                                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                                    className="flex-1 bg-[#0F1115] border border-[#2D3139]/20 rounded px-sm py-[5px] text-sm text-white placeholder-[#8c947b]/40 focus:outline-none focus:border-primary/50"
                                                />
                                                <button
                                                    type="submit"
                                                    className="bg-primary text-on-primary hover:bg-primary/90 text-xs font-bold px-sm py-[7px] rounded flex items-center gap-xs cursor-pointer transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">add</span> Add
                                                </button>
                                            </form>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="grid grid-cols-2 gap-md">
                                <div className="bg-[#191c21] p-md rounded-xl border border-[#2D3139]/20 flex flex-col gap-xs">
                                    <h3 className="font-label-sm text-[#8c947b] uppercase tracking-wider flex items-center gap-xs">
                                        <span className="material-symbols-outlined text-[14px]">person</span> Assignee
                                    </h3>
                                    {(() => {
                                        const assignee = selectedTask.assignee_id ? orgUsers.find(u => u.id === selectedTask.assignee_id) : null;
                                        return assignee ? (
                                            <div className="flex items-center gap-sm mt-1">
                                                <div className="w-6 h-6 rounded-full bg-[#1C1F26] border border-[#2D3139]/50 flex items-center justify-center text-[10px] font-bold text-[#8c947b] uppercase">
                                                    {assignee.name.charAt(0)}
                                                </div>
                                                <p className="font-body-md text-white font-semibold">{assignee.name}</p>
                                            </div>
                                        ) : (
                                            <p className="font-body-md text-white mt-1 italic opacity-70">Unassigned</p>
                                        );
                                    })()}
                                </div>
                                <div className="bg-[#191c21] p-md rounded-xl border border-[#2D3139]/20 flex flex-col gap-xs">
                                    <h3 className="font-label-sm text-[#8c947b] uppercase tracking-wider flex items-center gap-xs">
                                        <span className="material-symbols-outlined text-[14px]">calendar_today</span> Deadline
                                    </h3>
                                    <p className="font-body-md text-white font-semibold mt-1">
                                        {selectedTask.due_date ? (
                                            selectedTask.due_date.includes('T') || selectedTask.due_date.includes(' ')
                                                ? new Date(selectedTask.due_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                                                : new Date(selectedTask.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                        ) : <span className="italic opacity-70">No deadline</span>}
                                    </p>
                                </div>
                            </div>

                            <div className="pt-md mt-auto flex justify-between items-center text-[11px] text-[#8c947b] border-t border-[#2D3139]/20">
                                <span>ID: <span className="font-mono text-white opacity-70">{String(selectedTask.id).substring(0, 8)}</span></span>
                                <span>Created {new Date(selectedTask.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Post-upload file review modal */}
            {reviewFile && (
                <DocViewer file={reviewFile} onClose={() => setReviewFile(null)} />
            )}

            {/* ── Action Blocked modal (non-admin clicked delete) ── */}
            {showActionBlocked && (
                <div
                    className="fixed inset-0 z-[150] flex items-center justify-center p-4"
                    style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
                    onClick={() => setShowActionBlocked(false)}
                >
                    <div
                        className="bg-[#1C1F26] border border-[#2D3139] rounded-2xl shadow-2xl w-full max-w-sm p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Icon */}
                        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 mx-auto mb-4">
                            <span className="material-symbols-outlined text-amber-400 text-[32px]">lock</span>
                        </div>

                        {/* Text */}
                        <h2 className="text-white font-bold text-[18px] text-center mb-2">Action Blocked</h2>
                        <p className="text-[#8c947b] text-[13px] text-center mb-1">
                            You don't have permission to delete this project.
                        </p>
                        <p className="text-[#8c947b] text-[13px] text-center mb-6">
                            Only <span className="text-amber-400 font-semibold">Admins</span> and <span className="text-amber-400 font-semibold">Super Admins</span> can perform this action. Contact your workspace admin if you need this project removed.
                        </p>

                        <button
                            type="button"
                            onClick={() => setShowActionBlocked(false)}
                            className="w-full py-2.5 rounded-xl bg-[#2D3139] hover:bg-[#3a3f4a] text-white text-[13px] font-semibold transition-colors cursor-pointer"
                        >
                            Got it
                        </button>
                    </div>
                </div>
            )}

            {/* ── Delete project confirmation modal ── */}
            {showDeleteConfirm && (
                <div
                    className="fixed inset-0 z-[150] flex items-center justify-center p-4"
                    style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
                    onClick={() => !deletingProject && setShowDeleteConfirm(false)}
                >
                    <div
                        className="bg-[#1C1F26] border border-[#2D3139] rounded-2xl shadow-2xl w-full max-w-sm p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Icon */}
                        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 mx-auto mb-4">
                            <span className="material-symbols-outlined text-red-400 text-[32px]">delete_forever</span>
                        </div>

                        {/* Text */}
                        <h2 className="text-white font-bold text-[18px] text-center mb-2">Delete this project?</h2>
                        <p className="text-[#8c947b] text-[13px] text-center mb-1">You are about to permanently delete</p>
                        <p className="text-white font-bold text-[15px] text-center mb-3">"{project_name}"</p>
                        <p className="text-[#8c947b] text-[12px] text-center mb-6">
                            All tasks, files, and activity linked to this project will also be removed. This cannot be undone.
                        </p>

                        {/* Buttons */}
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={deletingProject}
                                className="flex-1 py-2.5 rounded-xl border border-[#2D3139] text-[#8c947b] hover:bg-[#2D3139] hover:text-white text-[13px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                            >
                                No, keep it
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteProject}
                                disabled={deletingProject}
                                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[13px] font-bold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {deletingProject ? (
                                    <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>Deleting…</>
                                ) : (
                                    <><span className="material-symbols-outlined text-[16px]">delete</span>Yes, delete</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Add Member modal ── */}
            {showAddMemberModal && (() => {
                const alreadyIn = new Set([
                    ...projectMembers.map(pm => pm.user_id),
                    ...assignedMembers.map(u => u.id),
                ])
                const available = orgUsers.filter(u => !alreadyIn.has(u.id))

                const addMember = async (user) => {
                    const { error } = await supabase.from("project_members").insert({
                        project_id,
                        user_id: user.id,
                    })
                    if (!error) {
                        fetchProjectMembers()
                        const { data: userData } = await supabase.auth.getUser()
                        await supabase.from("activity_log").insert({
                            entity_type: "member", entity_id: user.id,
                            actor_id: userData?.user?.id, action: "member_added",
                            new_state: { project_id, name: user.name }
                        })
                    }
                }

                return (
                    <div
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
                        onClick={() => setShowAddMemberModal(false)}
                    >
                        <div
                            className="bg-[#1C1F26] border border-[#2D3139] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2D3139]">
                                <div>
                                    <h2 className="text-white font-bold text-[16px]">Add Members</h2>
                                    <p className="text-[#8c947b] text-[12px]">Pick team members to add to this project</p>
                                </div>
                                <button onClick={() => setShowAddMemberModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8c947b] hover:text-white hover:bg-[#2D3139] transition-colors cursor-pointer">
                                    <span className="material-symbols-outlined text-[20px]">close</span>
                                </button>
                            </div>

                            {/* List */}
                            <div className="max-h-80 overflow-y-auto p-4 space-y-2">
                                {available.length === 0 ? (
                                    <div className="text-center py-8">
                                        <span className="material-symbols-outlined text-[#8c947b] text-4xl mb-2 block">group</span>
                                        <p className="text-[#8c947b] text-[13px]">All team space members are already in this project.</p>
                                    </div>
                                ) : (
                                    available.map(user => (
                                        <div key={user.id} className="flex items-center justify-between p-3 rounded-xl bg-[#191c21] border border-[#2D3139]/50 hover:border-[#aff82a]/30 transition-colors group">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-[#2D3139] flex items-center justify-center font-bold text-[14px] text-white uppercase shrink-0">
                                                    {user.name?.charAt(0) || "?"}
                                                </div>
                                                <div>
                                                    <p className="text-white text-[13px] font-semibold">{user.name}</p>
                                                    <p className="text-[#8c947b] text-[11px]">{user.email}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => addMember(user)}
                                                className="px-3 py-1.5 rounded-lg bg-[#aff82a]/10 border border-[#aff82a]/30 text-[#aff82a] text-[12px] font-bold hover:bg-[#aff82a]/20 transition-colors cursor-pointer flex items-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">add</span>
                                                Add
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="px-6 py-4 border-t border-[#2D3139]">
                                <button onClick={() => setShowAddMemberModal(false)} className="w-full py-2.5 rounded-xl bg-[#2D3139] text-white text-[13px] font-semibold hover:bg-[#3a3f4a] transition-colors cursor-pointer">
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })()}
        </div>
    )
}

export default ProjectPage
