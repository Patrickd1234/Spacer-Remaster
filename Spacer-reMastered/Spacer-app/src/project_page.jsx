import { useState, useEffect } from "react"
import { Link, useNavigate, useParams, useLocation } from "react-router-dom"
import { supabase } from "./supabase"
import Sidebar from "./partials/sidebar"
import Header from "./partials/header"
import CreateTaskModal from "./partials/CreateTaskModal"


function ProjectPage() {
    const location = useLocation()
    const { id: project_id } = useParams()
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

    const handleDragStart = (e, taskId) => {
        e.dataTransfer.setData("taskId", taskId)
    }

    const handleDrop = async (e, newStatus) => {
        e.preventDefault()
        const taskId = e.dataTransfer.getData("taskId")
        if (!taskId) return

        const task = project_tasks.find(t => t.id === taskId)
        if (!task || task.status === newStatus) return

        setProjectTasks(prevTasks =>
            prevTasks.map(t =>
                t.id === taskId ? { ...t, status: newStatus } : t
            )
        )

        const { error } = await supabase
            .from("tasks")
            .update({ status: newStatus })
            .eq("id", taskId)

        if (error) {
            console.error("Error updating task status:", error)
        } else {
            const { data: userData } = await supabase.auth.getUser()
            const logEntry = {
                entity_type: "task",
                entity_id: taskId,
                actor_id: userData?.user?.id,
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
            const { data: userData } = await supabase.auth.getUser();
            const logEntry = {
                entity_type: "task",
                entity_id: taskId,
                actor_id: userData?.user?.id,
                action: "deleted",
                new_state: { project_id: project_id, title: taskTitle }
            };
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single();
            if (newLog) setActivityLog(prev => [newLog, ...prev]);
        }
    }

    const handleDragOver = (e) => {
        e.preventDefault()
    }

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
                if (data[0].team_spaces?.organization_id) setOrganizationId(data[0].team_spaces.organization_id)
                if (data[0].team_space_id) setTeamSpaceId(data[0].team_space_id)
            }
        }

        const fetchTasks = async () => {
            if (!project_id) return
            const { data, error } = await supabase
                .from("tasks")
                .select("*")
                .eq("project_id", project_id)
                .order("created_at", { ascending: false })
            if (error) {
                console.error("Error fetching tasks:", error)
            } else {
                setProjectTasks(data || [])
            }
        }

        const fetchActivity = async () => {
            if (!project_id) return
            const { data, error } = await supabase
                .from("activity_log")
                .select("*, actor:users(name, email)")
                .eq("new_state->>project_id", project_id)
                .order("created_at", { ascending: false })
                .limit(20)

            if (error) {
                console.error("Error fetching activity:", error)
            } else {
                setActivityLog(data || [])
            }
        }

        fetchProject()
        fetchTasks()
        fetchActivity()
    }, [project_id])

    return (
        <>
            <Sidebar />
            <Header />
            <main className="ml-[260px] mt-16 p-lg h-[calc(100vh-64px)] overflow-y-auto scroll-hide">
                {/* Project Header */}
                <div className="mb-lg">
                    <div className="flex items-center justify-between gap-xl">
                        <h2 className="font-headline-xl text-headline-xl text-primary leading-tight shrink-0">{project_name || "Website Redesign"}</h2>
                        {project_tasks.length > 0 && (() => {
                            const todo = project_tasks.filter(t => t.status === "todo").length;
                            const inProgress = project_tasks.filter(t => t.status === "in_progress").length;
                            const done = project_tasks.filter(t => t.status === "done").length;
                            const max = Math.max(todo, inProgress, done, 1);
                            return (
                                <div className="flex-1 max-w-sm space-y-[6px]">
                                    <div className="flex items-center gap-sm">
                                        <span className="text-[11px] text-on-surface-variant w-14 text-right shrink-0">Backlog</span>
                                        <div className="flex-1 h-[6px] rounded-full bg-surface-container-highest overflow-hidden">
                                            <div className="bg-outline-variant h-full rounded-full transition-all duration-500" style={{ width: `${(todo / max) * 100}%` }}></div>
                                        </div>
                                        <span className="text-[10px] text-on-surface-variant w-4">{todo}</span>
                                    </div>
                                    <div className="flex items-center gap-sm">
                                        <span className="text-[11px] text-tertiary w-14 text-right shrink-0">Doing</span>
                                        <div className="flex-1 h-[6px] rounded-full bg-surface-container-highest overflow-hidden">
                                            <div className="bg-tertiary h-full rounded-full transition-all duration-500" style={{ width: `${(inProgress / max) * 100}%` }}></div>
                                        </div>
                                        <span className="text-[10px] text-tertiary w-4">{inProgress}</span>
                                    </div>
                                    <div className="flex items-center gap-sm">
                                        <span className="text-[11px] text-primary-fixed-dim w-14 text-right shrink-0">Done</span>
                                        <div className="flex-1 h-[6px] rounded-full bg-surface-container-highest overflow-hidden">
                                            <div className="bg-primary-fixed-dim h-full rounded-full transition-all duration-500" style={{ width: `${(done / max) * 100}%` }}></div>
                                        </div>
                                        <span className="text-[10px] text-primary-fixed-dim w-4">{done}</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                    {/* Sub-Tabs Navigation */}
                    <div className="flex gap-lg mt-xl border-b border-outline-variant/30">
                        <button
                            type="button"
                            className={`pb-sm px-sm font-label-md text-label-md transition-all cursor-pointer ${activeTab === "summary" ? "text-primary-fixed-dim border-b-2 border-primary-fixed-dim font-bold" : "text-on-surface-variant hover:text-on-surface border-b-2 border-transparent"}`}
                            onClick={() => setActiveTab("summary")}
                        >
                            Summary
                        </button>
                        <button
                            type="button"
                            className={`pb-sm px-sm font-label-md text-label-md transition-all cursor-pointer ${activeTab === "tasks" ? "text-primary-fixed-dim border-b-2 border-primary-fixed-dim font-bold" : "text-on-surface-variant hover:text-on-surface border-b-2 border-transparent"}`}
                            onClick={() => setActiveTab("tasks")}
                        >
                            Tasks
                        </button>
                        <button
                            type="button"
                            className={`pb-sm px-sm font-label-md text-label-md transition-all cursor-pointer ${activeTab === "files" ? "text-primary-fixed-dim border-b-2 border-primary-fixed-dim font-bold" : "text-on-surface-variant hover:text-on-surface border-b-2 border-transparent"}`}
                            onClick={() => setActiveTab("files")}
                        >
                            Public Files
                        </button>
                        <button
                            type="button"
                            className={`pb-sm px-sm font-label-md text-label-md transition-all cursor-pointer ${activeTab === "members" ? "text-primary-fixed-dim border-b-2 border-primary-fixed-dim font-bold" : "text-on-surface-variant hover:text-on-surface border-b-2 border-transparent"}`}
                            onClick={() => setActiveTab("members")}
                        >
                            Members
                        </button>
                    </div>
                </div>
                {/* Tab Contents */}
                <div id="content-area">
                    {/* Summary Tab */}
                    {activeTab === "summary" && (
                        <div className="tab-pane block" id="section-summary">
                            <div className="bento-grid">
                                {/* Recent Activity Feed (Full Width) */}
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
                                                            <span className="text-primary font-bold">{activity.actor?.name || 'Unknown User'}</span>
                                                            {' '}
                                                            {activity.action === "created" && (
                                                                <>created task <span className="text-primary-fixed-dim font-bold">{activity.new_state?.title}</span></>
                                                            )}
                                                            {activity.action === "deleted" && (
                                                                <>deleted task <span className="text-error font-bold">{activity.new_state?.title}</span></>
                                                            )}
                                                            {activity.action === "status_changed" && (
                                                                <>moved task <span className="text-primary-fixed-dim font-bold">{activity.new_state?.title}</span> to <span className="text-on-surface capitalize border border-outline-variant rounded px-1">{activity.new_state?.status?.replace("_", " ")}</span></>
                                                            )}
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

                    {/* Tasks Tab */}
                    {activeTab === "tasks" && (
                        <div className="tab-pane block h-full flex flex-col" id="section-tasks">
                            <div className="flex-1 bg-surface-container-high rounded-xl border border-outline-variant/30 overflow-hidden overflow-y-auto scroll-hide p-md mt-md">
                                <table className="w-full text-left">
                                    <thead className="bg-surface-container-low/50 sticky top-0 z-10 backdrop-blur-md">
                                        <tr>
                                            <th className="px-lg py-md font-label-sm text-label-sm uppercase text-on-surface-variant">Task Name</th>
                                            <th className="px-lg py-md font-label-sm text-label-sm uppercase text-on-surface-variant">Status</th>
                                            <th className="px-lg py-md font-label-sm text-label-sm uppercase text-on-surface-variant">Priority</th>
                                            <th className="px-lg py-md font-label-sm text-label-sm uppercase text-on-surface-variant">Assignee</th>
                                            <th className="px-lg py-md font-label-sm text-label-sm uppercase text-on-surface-variant">Deadline</th>
                                            <th className="px-lg py-md w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-outline-variant/20">
                                        {project_tasks.map(task => (
                                            <tr key={task.id} className="hover:bg-surface-container transition-colors group">
                                                <td className="px-lg py-md font-body-md text-primary font-bold">
                                                    {task.title}
                                                </td>
                                                <td className="px-lg py-md">
                                                    <select
                                                        value={task.status}
                                                        onChange={(e) => handleDrop({ preventDefault: () => { }, dataTransfer: { getData: () => task.id } }, e.target.value)}
                                                        className="bg-transparent border border-outline-variant/50 rounded px-xs py-[2px] text-[11px] font-label-sm text-on-surface focus:outline-none focus:border-primary cursor-pointer"
                                                    >
                                                        <option value="todo">Backlog</option>
                                                        <option value="in_progress">Doing</option>
                                                        <option value="done">Done</option>
                                                    </select>
                                                </td>
                                                <td className="px-lg py-md">
                                                    <span className={`px-xs py-[2px] rounded text-[10px] font-bold uppercase ${task.priority === 'urgent' ? 'bg-error-container/20 text-error' : task.priority === 'high' ? 'bg-error-container/10 text-error/80' : task.priority === 'medium' ? 'bg-tertiary-container/10 text-on-tertiary-container' : 'bg-surface-variant text-on-surface-variant'}`}>
                                                        {task.priority || 'medium'}
                                                    </span>
                                                </td>
                                                <td className="px-lg py-md text-on-surface-variant text-[13px]">
                                                    {task.assignee ? task.assignee.name : 'Unassigned'}
                                                </td>
                                                <td className="px-lg py-md text-on-surface-variant text-[13px]">
                                                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                                                </td>
                                                <td className="px-lg py-md text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteTask(task.id, task.title)}
                                                        className="text-on-surface-variant hover:text-error transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                                                        title="Delete Task"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">delete</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {project_tasks.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="px-lg py-xl text-center text-on-surface-variant">
                                                    No tasks found. Create one to get started.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Public Files Tab */}
                    {activeTab === "files" && (
                        <div className="tab-pane block" id="section-files">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                                {/* Preview Files */}
                                <div className="bg-surface-container-high p-lg rounded-xl glass-panel">
                                    <div className="flex items-center justify-between mb-lg">
                                        <div className="flex items-center gap-sm">
                                            <span className="material-symbols-outlined text-primary-fixed-dim">visibility</span>
                                            <h3 className="font-headline-md text-headline-md">Preview Files</h3>
                                        </div>
                                        <button type="button" className="text-label-sm text-primary-fixed-dim font-label-md uppercase tracking-wide hover:underline cursor-pointer">Upload</button>
                                    </div>
                                    <div className="space-y-sm">
                                        <div className="flex items-center justify-between p-sm hover:bg-surface-container transition-colors rounded-lg group">
                                            <div className="flex items-center gap-md">
                                                <div className="w-10 h-10 bg-error-container/20 flex items-center justify-center rounded-lg">
                                                    <span className="material-symbols-outlined text-error">picture_as_pdf</span>
                                                </div>
                                                <div>
                                                    <p className="font-body-md text-body-md text-primary">Marketing_Landing_Mockup.pdf</p>
                                                    <p className="text-on-surface-variant text-[11px]">Added by Grace • 14.2 MB</p>
                                                </div>
                                            </div>
                                            <button type="button" className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-opacity opacity-0 group-hover:opacity-100">download</button>
                                        </div>
                                        <div className="flex items-center justify-between p-sm hover:bg-surface-container transition-colors rounded-lg group">
                                            <div className="flex items-center gap-md">
                                                <div className="w-10 h-10 bg-primary-container/10 flex items-center justify-center rounded-lg">
                                                    <span className="material-symbols-outlined text-primary-fixed-dim">image</span>
                                                </div>
                                                <div>
                                                    <p className="font-body-md text-body-md text-primary">Hero_Section_Animation.mp4</p>
                                                    <p className="text-on-surface-variant text-[11px]">Added by Alan • 45.8 MB</p>
                                                </div>
                                            </div>
                                            <button type="button" className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-opacity opacity-0 group-hover:opacity-100">download</button>
                                        </div>
                                    </div>
                                </div>
                                {/* Input Files */}
                                <div className="bg-surface-container-high p-lg rounded-xl glass-panel">
                                    <div className="flex items-center justify-between mb-lg">
                                        <div className="flex items-center gap-sm">
                                            <span className="material-symbols-outlined text-primary-fixed-dim">move_to_inbox</span>
                                            <h3 className="font-headline-md text-headline-md">Input Files</h3>
                                        </div>
                                        <button type="button" className="text-label-sm text-primary-fixed-dim font-label-md uppercase tracking-wide hover:underline cursor-pointer">Upload</button>
                                    </div>
                                    <div className="space-y-sm">
                                        <div className="flex items-center justify-between p-sm hover:bg-surface-container transition-colors rounded-lg group">
                                            <div className="flex items-center gap-md">
                                                <div className="w-10 h-10 bg-secondary-container flex items-center justify-center rounded-lg">
                                                    <span className="material-symbols-outlined text-on-surface-variant">description</span>
                                                </div>
                                                <div>
                                                    <p className="font-body-md text-body-md text-primary">Brand_Guidelines_2024.docx</p>
                                                    <p className="text-on-surface-variant text-[11px]">Added by HR Team • 2.1 MB</p>
                                                </div>
                                            </div>
                                            <button type="button" className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-opacity opacity-0 group-hover:opacity-100">download</button>
                                        </div>
                                        <div className="flex items-center justify-between p-sm hover:bg-surface-container transition-colors rounded-lg group">
                                            <div className="flex items-center gap-md">
                                                <div className="w-10 h-10 bg-secondary-container flex items-center justify-center rounded-lg">
                                                    <span className="material-symbols-outlined text-on-surface-variant">folder_zip</span>
                                                </div>
                                                <div>
                                                    <p className="font-body-md text-body-md text-primary">Raw_Asset_Pack_v2.zip</p>
                                                    <p className="text-on-surface-variant text-[11px]">Added by Ada • 1.4 GB</p>
                                                </div>
                                            </div>
                                            <button type="button" className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-opacity opacity-0 group-hover:opacity-100">download</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Members Tab */}
                    {activeTab === "members" && (
                        <div className="tab-pane block" id="section-members">
                            <div className="bg-surface-container-high rounded-xl glass-panel overflow-hidden">
                                <table className="w-full text-left">
                                    <thead className="bg-surface-container-low">
                                        <tr>
                                            <th className="px-lg py-md font-label-sm text-label-sm uppercase text-on-surface-variant">Member</th>
                                            <th className="px-lg py-md font-label-sm text-label-sm uppercase text-on-surface-variant">Role</th>
                                            <th className="px-lg py-md font-label-sm text-label-sm uppercase text-on-surface-variant">Status</th>
                                            <th className="px-lg py-md font-label-sm text-label-sm uppercase text-on-surface-variant">Last Active</th>
                                            <th className="px-lg py-md"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-outline-variant/20">
                                        <tr className="hover:bg-surface-container transition-colors">
                                            <td className="px-lg py-md flex items-center gap-md">
                                                <div className="relative w-10 h-10 shrink-0">
                                                    <img className="w-full h-full rounded-full object-cover" alt="Alan Turing" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDqqPlcDFNyQ0MhTW5nw0XW-2zCyTcT5awZAyI2T2asdkvIK1TNqrDpjMGQvs7QfkG9FmwcPITCPgA12VhFLAZTs3U60wJbUIPHBWAeXsWUdWHGgNXZRsFMLY24AYwgZfB9BizPDQ3gW9foEa9PfXCJ1n-Fp_c6PpXiLWwsvAvvc5iMyYC_dfKYfPHVZeyYVnsAhaZJQRyjVt122hAlBiOP9DAMcx022DFtnUygUvLyBc74M6B5NeXuCQ" />
                                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-primary-fixed-dim border-2 border-surface-container rounded-full"></div>
                                                </div>
                                                <div>
                                                    <p className="font-body-md text-body-md text-primary font-bold">Alan Turing</p>
                                                    <p className="text-on-surface-variant text-[11px]">alan@spacers.io</p>
                                                </div>
                                            </td>
                                            <td className="px-lg py-md">
                                                <span className="px-sm py-base rounded-full border border-outline-variant text-[11px] font-label-sm">Tech Lead</span>
                                            </td>
                                            <td className="px-lg py-md">
                                                <span className="flex items-center gap-xs text-primary-fixed-dim text-label-sm">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed-dim"></span> Active
                                                </span>
                                            </td>
                                            <td className="px-lg py-md text-on-surface-variant font-body-sm text-body-sm">Just now</td>
                                            <td className="px-lg py-md text-right">
                                                <button type="button" className="material-symbols-outlined text-on-surface-variant">mail</button>
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-surface-container transition-colors">
                                            <td className="px-lg py-md flex items-center gap-md">
                                                <div className="relative w-10 h-10 shrink-0">
                                                    <img className="w-full h-full rounded-full object-cover" alt="Grace Hopper" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCJpzE24BKAI1bA5w1wAlv9QCEKbZYO3MJgBxhnyV5towTW_iMicq95We8z_OdaeACKdL9P-OLykg9vlvI5ohT8Mn0Z6ViXutpvNLj0r-G54HitrlUFVRFGkmWHDbmIBpuWcMk8qYdWfv_TX4yTnRWTlGMMThO5f6i6OF2uYItwJL1hmIxQdcPHtapFdAo5sL8FJTgqgi5iA5jcJcplEb8kDEA6ePDMMisGr7gAeYEgtE9ViO8UaiSuJA" />
                                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-primary-fixed-dim border-2 border-surface-container rounded-full"></div>
                                                </div>
                                                <div>
                                                    <p className="font-body-md text-body-md text-primary font-bold">Grace Hopper</p>
                                                    <p className="text-on-surface-variant text-[11px]">grace@spacers.io</p>
                                                </div>
                                            </td>
                                            <td className="px-lg py-md">
                                                <span className="px-sm py-base rounded-full border border-outline-variant text-[11px] font-label-sm">Senior UI Architect</span>
                                            </td>
                                            <td className="px-lg py-md">
                                                <span className="flex items-center gap-xs text-primary-fixed-dim text-label-sm">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed-dim"></span> Active
                                                </span>
                                            </td>
                                            <td className="px-lg py-md text-on-surface-variant font-body-sm text-body-sm">2h ago</td>
                                            <td className="px-lg py-md text-right">
                                                <button type="button" className="material-symbols-outlined text-on-surface-variant">mail</button>
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-surface-container transition-colors">
                                            <td className="px-lg py-md flex items-center gap-md">
                                                <div className="relative w-10 h-10 shrink-0">
                                                    <img className="w-full h-full rounded-full object-cover" alt="Ada Lovelace" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC6HJyICcrafKbZ4526d0McoWWk9zk1gS_77ATXdI_RBt1-yIw8oqXeQtQOBmWeMCD1VOEj4vadgNJIOBpgZcz0MFq39XQHwygnSf8P8BDtGJPl-_px_Hzj1Aj9bdsSy52YAxw7tkUS35sFst72NsoDh2SYewxg1bQq7k09-8Q0hmDJ1YBggl5GvEAYfalSQKeGvB5eaM-M4r-PWlWYBKsdBaF7a3X1k8DtiDR-wv1nw4MQURITpTmKNA" />
                                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-outline-variant border-2 border-surface-container rounded-full"></div>
                                                </div>
                                                <div>
                                                    <p className="font-body-md text-body-md text-primary font-bold">Ada Lovelace</p>
                                                    <p className="text-on-surface-variant text-[11px]">ada@spacers.io</p>
                                                </div>
                                            </td>
                                            <td className="px-lg py-md">
                                                <span className="px-sm py-base rounded-full border border-outline-variant text-[11px] font-label-sm">Project Manager</span>
                                            </td>
                                            <td className="px-lg py-md">
                                                <span className="flex items-center gap-xs text-on-surface-variant text-label-sm opacity-50">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span> Offline
                                                </span>
                                            </td>
                                            <td className="px-lg py-md text-on-surface-variant font-body-sm text-body-sm">Yesterday</td>
                                            <td className="px-lg py-md text-right">
                                                <button type="button" className="material-symbols-outlined text-on-surface-variant">mail</button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </main>
            {/* FAB for Tasks */}
            <button type="button" onClick={() => setIsCreateTaskModalOpen(true)} className="fixed bottom-lg right-lg w-14 h-14 bg-primary-fixed-dim text-on-primary rounded-full shadow-[0_8px_32px_rgba(182,255,51,0.3)] flex items-center justify-center hover:scale-105 transition-transform active:scale-95 group z-30 cursor-pointer">
                <span className="material-symbols-outlined text-[28px] font-bold">add</span>
                <span className="absolute right-full mr-md px-md py-sm bg-surface-container text-on-surface font-label-md text-label-md rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap border border-outline-variant">Quick Add Task</span>
            </button>
            {isCreateTaskModalOpen && (
                <CreateTaskModal
                    projectId={project_id}
                    organizationId={organizationId}
                    teamSpaceId={teamSpaceId}
                    onClose={() => setIsCreateTaskModalOpen(false)}
                    onCreated={(newTask) => {
                        setProjectTasks(prev => [newTask, ...prev])
                    }}
                />
            )}
        </>
    )
}

export default ProjectPage