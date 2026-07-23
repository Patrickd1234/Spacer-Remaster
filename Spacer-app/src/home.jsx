import Sidebar from "./partials/sidebar"
import Header from "./partials/header"
import ProjectPanel from "./components/ProjectPanel"
import DocViewer from "./components/DocViewer"
import { useState, useEffect } from "react"
import { supabase } from "./supabase"
import { Link } from "react-router-dom"

function Home() {
    const [userEmail, setUserEmail] = useState("")
    const [userData, setUserData] = useState(null)
    const [selectedProject, setSelectedProject] = useState(null)
    const [previewFile, setPreviewFile] = useState(null)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

    // Superadmin role state
    const [userRole, setUserRole] = useState(null)
    const [roleLoading, setRoleLoading] = useState(true)

    // Org stats (superadmin only)
    const [orgStats, setOrgStats] = useState({ members: null, teams: null, activeProjects: null })
    const [teams, setTeams] = useState([])
    const [teamPage, setTeamPage] = useState(0)
    const TEAMS_PER_PAGE = 3

    // User tasks (non-superadmin only)
    const [userTasks, setUserTasks] = useState([])
    const [tasksLoading, setTasksLoading] = useState(false)

    useEffect(() => {
        const email = localStorage.getItem("userEmail")
        if (email) setUserEmail(email)

        const init = async () => {
            try {
                // 1. Get authenticated user
                const { data: authData } = await supabase.auth.getUser()
                const userId = authData?.user?.id

                if (!userId) { setRoleLoading(false); return }

                // 2. Fetch user profile
                const { data: profile } = await supabase
                    .from("users")
                    .select("*")
                    .eq("id", userId)
                    .maybeSingle()
                if (profile) setUserData(profile)

                // 3. Query memberships table for current user's role
                const { data: membership, error: memError } = await supabase
                    .from("memberships")
                    .select("role")
                    .eq("user_id", userId)
                    .maybeSingle()

                if (memError) console.warn("membership fetch error:", memError)

                const role = membership?.role ?? null
                setUserRole(role)

                // 4. Branch on role: org data for superadmin, personal tasks for others
                if (role === "super_admin" || role === "superadmin") {
                    let orgId = authData?.user?.user_metadata?.organization_id;
                    if (!orgId && membership?.team_space_id) {
                        const { data: tsData } = await supabase
                            .from("team_spaces")
                            .select("organization_id")
                            .eq("id", membership.team_space_id)
                            .maybeSingle();
                        orgId = tsData?.organization_id;
                    }
                    await fetchOrgData(orgId)
                } else {
                    await fetchUserTasks(userId)
                }
            } catch (err) {
                console.error("Home init error:", err)
            } finally {
                setRoleLoading(false)
            }
        }

        init()
    }, [])

    const fetchOrgData = async (orgId) => {
        try {
            // Teams from team_spaces table
            let teamQuery = supabase.from("team_spaces").select("id, name")
            if (orgId) teamQuery = teamQuery.eq("organization_id", orgId)
            const { data: teamSpaces, error } = await teamQuery
            console.log("DEBUG: fetchOrgData orgId =", orgId, "teamSpaces =", teamSpaces, "error =", error)
            const teamCount = teamSpaces?.length ?? 0

            const teamIds = teamSpaces?.map(ts => ts.id) || []

            // Total members based on fetched teams
            let memberCount = 0
            if (teamIds.length > 0) {
                const { data: allMembers } = await supabase.from("memberships").select("id").in("team_space_id", teamIds)
                memberCount = allMembers?.length ?? 0
            }

            // Active project spaces based on fetched teams
            let projectCount = 0
            if (teamIds.length > 0) {
                const { data: activeProjects } = await supabase.from("project_spaces").select("id").in("team_space_id", teamIds)
                projectCount = activeProjects?.length ?? 0
            }

            setOrgStats({ members: memberCount, teams: teamCount, activeProjects: projectCount })

            // Per-team member & project counts
            if (teamSpaces && teamSpaces.length > 0) {
                const enriched = await Promise.all(
                    teamSpaces.map(async (ts) => {
                        const { data: mems } = await supabase
                            .from("memberships").select("id").eq("team_space_id", ts.id)
                        const { data: projs } = await supabase
                            .from("project_spaces").select("id").eq("team_space_id", ts.id)
                        return {
                            ...ts,
                            member_count: mems?.length ?? 0,
                            project_count: projs?.length ?? 0,
                            status: ts.status || "ON TRACK",
                        }
                    })
                )
                setTeams(enriched)
            }
        } catch (err) {
            console.error("Org data fetch error:", err)
        }
    }

    // ── Fetch tasks assigned to the current user only ────────────────────────
    const fetchUserTasks = async (userId) => {
        setTasksLoading(true)
        try {
            // SELECT * FROM tasks WHERE assignee_id = <userId>
            const { data, error } = await supabase
                .from("tasks")
                .select("*")
                .eq("assignee_id", userId)

            if (error) {
                console.warn("tasks fetch error:", error)
            } else {
                setUserTasks(data || [])
            }
        } catch (err) {
            console.error("fetchUserTasks error:", err)
        } finally {
            setTasksLoading(false)
        }
    }

    const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin"
    const isAdmin = userRole === "admin"
    const totalTeamPages = Math.ceil(teams.length / TEAMS_PER_PAGE)
    const visibleTeams = teams.slice(teamPage * TEAMS_PER_PAGE, teamPage * TEAMS_PER_PAGE + TEAMS_PER_PAGE)

    // Derived task buckets — only the current user's tasks, grouped by status
    const todoTasks = userTasks.filter(t => t.status === "todo")
    const inProgressTasks = userTasks.filter(t => t.status === "in_progress")
    const doneTasks = userTasks.filter(t => t.status === "done")
    const openCount = todoTasks.length + inProgressTasks.length

    return (
        <>
            <Sidebar onCollapsedChange={setSidebarCollapsed} />
            {/* Main content wrapper */}
            <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} flex-1 flex flex-col min-h-screen transition-all duration-300 ease-out bg-[#0F1115] text-[#e0e5d0]`}>
                {/* Top Navbar */}
                <header className="px-lg py-md flex items-center justify-between border-b border-[#2D3139]">
                    <div className="flex items-center gap-2 text-[#8c947b]">
                        <span className="material-symbols-outlined text-[20px]">home</span>
                        <span className="font-body-md font-medium text-[#e0e5d0]">Home</span>
                    </div>
                    <div className="flex items-center gap-md">
                        <button className="flex items-center gap-2 px-md py-sm bg-[#1C1F26] border border-[#2D3139] hover:border-[#424934] rounded-lg text-body-sm transition-colors">
                            <span className="material-symbols-outlined text-[16px]">description</span>
                            New Document
                        </button>
                        <button className="flex items-center gap-2 px-md py-sm bg-[#1C1F26] border border-[#2D3139] hover:border-[#424934] rounded-lg text-body-sm transition-colors">
                            <span className="material-symbols-outlined text-[16px]">task</span>
                            New Task
                        </button>
                        <button className="flex items-center gap-2 px-md py-sm bg-[#1C1F26] border border-[#2D3139] hover:border-[#424934] rounded-lg text-body-sm transition-colors">
                            <span className="material-symbols-outlined text-[16px]">phone_in_talk</span>
                            New Meeting
                        </button>
                    </div>
                </header>

                <div className="p-lg space-y-xl max-w-[1400px] w-full mx-auto">
                    {/* GREETING SECTION */}
                    <section>
                        <h1 className="text-[28px] font-semibold text-white flex items-center gap-2">
                            Hello {userData?.name || userEmail.split('@')[0] || "User"}! 👋
                        </h1>
                        <p className="text-[#8c947b] text-[18px] mt-1 font-medium">
                            Here's what's happening in <span className="text-white">Circle Corp Dev Team</span>
                        </p>
                    </section>

                    {/* METRICS ROW */}
                    <section className="grid grid-cols-1 md:grid-cols-4 gap-md">
                        {/* Metric 1 */}
                        <div className="bg-[#1C1F26] border border-[#2D3139] p-lg rounded-xl flex flex-col justify-between min-h-[140px]">
                            <div>
                                <h2 className="text-[40px] font-bold text-white leading-none mb-2">{tasksLoading ? "..." : openCount}</h2>
                                <p className="text-[#8c947b] text-[15px]">My Open Task</p>
                            </div>
                            <div className="flex items-center gap-2 mt-4 text-[#8c947b] text-[12px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#8c947b]"></span>
                                Spread across multiple projects
                            </div>
                        </div>
                        {/* Metric 2 */}
                        <div className="bg-[#1C1F26] border border-[#2D3139] p-lg rounded-xl flex flex-col justify-between min-h-[140px]">
                            <div>
                                <h2 className="text-[40px] font-bold text-white leading-none mb-2">{isSuperAdmin ? orgStats.activeProjects ?? "..." : "8"}</h2>
                                <p className="text-[#8c947b] text-[15px]">Active Projects</p>
                            </div>
                            <div className="flex items-center gap-2 mt-4 text-[#8c947b] text-[12px]">
                                <span className="material-symbols-outlined text-[14px]">sync</span>
                                Current sprint ends 11 Jul
                            </div>
                        </div>
                        {/* Metric 3 */}
                        <div className="bg-[#1C1F26] border border-[#2D3139] p-lg rounded-xl flex flex-col justify-between min-h-[140px]">
                            <div>
                                <h2 className="text-[40px] font-bold text-white leading-none mb-2">{isSuperAdmin ? orgStats.members ?? "..." : "24"}</h2>
                                <p className="text-[#8c947b] text-[15px]">{isSuperAdmin ? "Org Members" : "Team Members"}</p>
                            </div>
                            <div className="flex items-center gap-2 mt-4 text-[#8c947b] text-[12px]">
                                <span className="material-symbols-outlined text-[14px] rotate-[-45deg]">arrow_forward</span>
                                2 Active members
                            </div>
                        </div>
                        {/* Metric 4 */}
                        <div className="bg-[#1C1F26] border border-[#2D3139] p-lg rounded-xl flex flex-col justify-between min-h-[140px]">
                            <div>
                                <h2 className="text-[40px] font-bold text-[#ffb4ab] leading-none mb-2">5</h2>
                                <p className="text-[#ffb4ab] text-[15px]">Task Due Today</p>
                            </div>
                            <div className="flex items-center gap-2 mt-4 text-[#8c947b] text-[12px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#8c947b]"></span>
                                3 not started yet
                            </div>
                        </div>
                    </section>

                    {/* MAIN CONTENT AREA */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-xl">
                        
                        {/* LEFT COLUMN: MY TASK */}
                        <div className="lg:col-span-2 space-y-md">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[20px] font-semibold text-white">My Task</h3>
                                <Link to="/tasks" className="text-[#aff82a] text-[14px] hover:underline">View all task</Link>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                                
                                {/* Task Card 1 */}
                                <div className="bg-[#1C1F26] border border-[#2D3139] rounded-xl p-md hover:border-[#424934] transition-colors cursor-pointer">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className="flex items-center gap-1 text-[11px] font-medium text-[#ffb4ab] bg-[#ffb4ab]/10 px-2 py-1 rounded-md">
                                                <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab]"></span> Overdue
                                            </span>
                                            <span className="flex items-center gap-1 text-[11px] font-medium text-[#ffb4ab] bg-[#1C1F26] border border-[#2D3139] px-2 py-1 rounded-md">
                                                <span className="material-symbols-outlined text-[12px]">flag</span> Urgent <span className="material-symbols-outlined text-[12px]">expand_more</span>
                                            </span>
                                        </div>
                                        <div className="flex -space-x-2">
                                            <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26]">TJ</div>
                                            <div className="w-6 h-6 rounded-full bg-yellow-600 flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26]">MG</div>
                                            <div className="w-6 h-6 rounded-full bg-[#2D3139] flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26] text-[#8c947b]">+2</div>
                                        </div>
                                    </div>
                                    <p className="text-[12px] text-[#8c947b] mb-1">Website Redesign</p>
                                    <h4 className="text-[15px] font-semibold text-white mb-2">Fix auth token expiry bug</h4>
                                    <p className="text-[13px] text-[#8c947b] line-clamp-2 mb-6">Sessions dropping before timeout period ends - users getting logged...</p>
                                    
                                    <div className="space-y-2 mb-6">
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-[#8c947b]">progress</span>
                                            <span className="text-white">30%</span>
                                        </div>
                                        <div className="h-1 bg-[#2D3139] rounded-full overflow-hidden">
                                            <div className="h-full bg-[#ffb4ab] w-[30%]"></div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-between items-center text-[12px] text-[#8c947b] pt-4 border-t border-[#2D3139]">
                                        <div className="flex items-center gap-4">
                                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">chat_bubble</span> 5</span>
                                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">format_list_bulleted</span> 2/5</span>
                                        </div>
                                        <span className="flex items-center gap-1 text-[#ffb4ab]"><span className="material-symbols-outlined text-[14px]">calendar_today</span> 25 July</span>
                                    </div>
                                </div>

                                {/* Task Card 2 */}
                                <div className="bg-[#1C1F26] border border-[#2D3139] rounded-xl p-md hover:border-[#424934] transition-colors cursor-pointer">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className="flex items-center gap-1 text-[11px] font-medium text-blue-400 bg-blue-400/10 px-2 py-1 rounded-md">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> In progress
                                            </span>
                                            <span className="flex items-center gap-1 text-[11px] font-medium text-yellow-400 bg-[#1C1F26] border border-[#2D3139] px-2 py-1 rounded-md">
                                                <span className="material-symbols-outlined text-[12px]">flag</span> High <span className="material-symbols-outlined text-[12px]">expand_more</span>
                                            </span>
                                        </div>
                                        <div className="flex -space-x-2">
                                            <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26]">TJ</div>
                                            <div className="w-6 h-6 rounded-full bg-yellow-600 flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26]">MG</div>
                                            <div className="w-6 h-6 rounded-full bg-[#2D3139] flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26] text-[#8c947b]">+2</div>
                                        </div>
                                    </div>
                                    <p className="text-[12px] text-[#8c947b] mb-1">Website Redesign</p>
                                    <h4 className="text-[15px] font-semibold text-white mb-2">Refactor dashboard data layer</h4>
                                    <p className="text-[13px] text-[#8c947b] line-clamp-2 mb-6">Move API calls to custom hooks, remove prop drilling across components...</p>
                                    
                                    <div className="space-y-2 mb-6">
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-[#8c947b]">progress</span>
                                            <span className="text-white">50%</span>
                                        </div>
                                        <div className="h-1 bg-[#2D3139] rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 w-[50%]"></div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-between items-center text-[12px] text-[#8c947b] pt-4 border-t border-[#2D3139]">
                                        <div className="flex items-center gap-4">
                                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">chat_bubble</span> 7</span>
                                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">format_list_bulleted</span> 3/5</span>
                                        </div>
                                        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">calendar_today</span> 30 July</span>
                                    </div>
                                </div>

                                {/* Task Card 3 */}
                                <div className="bg-[#1C1F26] border border-[#2D3139] rounded-xl p-md hover:border-[#424934] transition-colors cursor-pointer">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className="flex items-center gap-1 text-[11px] font-medium text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-md">
                                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span> In review
                                            </span>
                                            <span className="flex items-center gap-1 text-[11px] font-medium text-yellow-400 bg-[#1C1F26] border border-[#2D3139] px-2 py-1 rounded-md">
                                                <span className="material-symbols-outlined text-[12px]">flag</span> High <span className="material-symbols-outlined text-[12px]">expand_more</span>
                                            </span>
                                        </div>
                                        <div className="flex -space-x-2">
                                            <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26]">TJ</div>
                                            <div className="w-6 h-6 rounded-full bg-yellow-600 flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26]">MG</div>
                                            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26]">OL</div>
                                            <div className="w-6 h-6 rounded-full bg-[#2D3139] flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26] text-[#8c947b]">+2</div>
                                        </div>
                                    </div>
                                    <p className="text-[12px] text-[#8c947b] mb-1">Website Redesign</p>
                                    <h4 className="text-[15px] font-semibold text-white mb-2">Fix auth token expiry bug</h4>
                                    <p className="text-[13px] text-[#8c947b] line-clamp-2 mb-6">Sessions dropping before timeout period ends - users getting logged...</p>
                                    
                                    <div className="space-y-2 mb-6">
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-[#8c947b]">progress</span>
                                            <span className="text-white">20%</span>
                                        </div>
                                        <div className="h-1 bg-[#2D3139] rounded-full overflow-hidden">
                                            <div className="h-full bg-yellow-500 w-[20%]"></div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-between items-center text-[12px] text-[#8c947b] pt-4 border-t border-[#2D3139]">
                                        <div className="flex items-center gap-4">
                                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">chat_bubble</span> 5</span>
                                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">format_list_bulleted</span> 2/5</span>
                                        </div>
                                        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">calendar_today</span> 1 August</span>
                                    </div>
                                </div>
                                
                                {/* Task Card 4 */}
                                <div className="bg-[#1C1F26] border border-[#2D3139] rounded-xl p-md hover:border-[#424934] transition-colors cursor-pointer">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className="flex items-center gap-1 text-[11px] font-medium text-gray-300 bg-gray-300/10 px-2 py-1 rounded-md">
                                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span> To do
                                            </span>
                                            <span className="flex items-center gap-1 text-[11px] font-medium text-gray-400 bg-[#1C1F26] border border-[#2D3139] px-2 py-1 rounded-md">
                                                <span className="material-symbols-outlined text-[12px]">flag</span> Normal <span className="material-symbols-outlined text-[12px]">expand_more</span>
                                            </span>
                                        </div>
                                        <div className="flex -space-x-2">
                                            <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26]">TJ</div>
                                            <div className="w-6 h-6 rounded-full bg-yellow-600 flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26]">MG</div>
                                            <div className="w-6 h-6 rounded-full bg-[#2D3139] flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26] text-[#8c947b]">-2</div>
                                        </div>
                                    </div>
                                    <p className="text-[12px] text-[#8c947b] mb-1">Website Redesign</p>
                                    <h4 className="text-[15px] font-semibold text-white mb-2">Document API endpoints — v2 spec</h4>
                                    <p className="text-[13px] text-[#8c947b] line-clamp-2 mb-6">Create OpenAPI spec for the new auth and payments endpoints...</p>
                                    
                                    <div className="space-y-2 mb-6">
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-[#8c947b]">progress</span>
                                            <span className="text-white">0%</span>
                                        </div>
                                        <div className="h-1 bg-[#2D3139] rounded-full overflow-hidden">
                                            <div className="h-full bg-gray-500 w-[0%]"></div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-between items-center text-[12px] text-[#8c947b] pt-4 border-t border-[#2D3139]">
                                        <div className="flex items-center gap-4">
                                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">chat_bubble</span> 1</span>
                                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">format_list_bulleted</span> 0/5</span>
                                        </div>
                                        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">calendar_today</span> 10 August</span>
                                    </div>
                                </div>
                                
                            </div>
                        </div>

                        {/* RIGHT COLUMN: RECENT ACTIVITY */}
                        <div className="lg:col-span-1 space-y-md">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[20px] font-semibold text-white">Recent Activities</h3>
                                <button className="text-[#aff82a] text-[14px] hover:underline">See recent activities</button>
                            </div>
                            <div className="bg-[#1C1F26] border border-[#2D3139] rounded-xl p-md h-full min-h-[500px]">
                                <div className="flex items-center justify-between mb-6">
                                    <button className="flex items-center gap-1 text-[14px] font-medium text-white">
                                        Today <span className="material-symbols-outlined text-[16px]">expand_more</span>
                                    </button>
                                </div>
                                
                                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-[#2D3139] before:to-transparent">
                                    
                                    {/* Activity 1 */}
                                    <div className="relative flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-[12px] font-bold text-white shrink-0 z-10 border-4 border-[#1C1F26]">TJ</div>
                                        <div className="flex-1 min-w-0 bg-[#0F1115] border border-[#2D3139] rounded-lg p-3">
                                            <p className="text-[13px] text-[#e0e5d0] mb-2">
                                                <span className="font-semibold text-white">Temi Joolaso</span> commented on <span className="text-[#aff82a] cursor-pointer hover:underline">Fix auth token expiry bug</span>
                                            </p>
                                            <div className="bg-[#1C1F26] p-3 rounded border border-[#2D3139] text-[#8c947b] text-[13px] italic mb-3">
                                                "Reproduced the issue on Safari too — seems like the refresh token isn't being persisted correctly after a tab restore."
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#8c947b]">
                                                <span>9:14 AM</span>
                                                <span className="w-1 h-1 rounded-full bg-[#424934]"></span>
                                                <span className="text-blue-400">Commented</span>
                                                <span className="w-1 h-1 rounded-full bg-[#424934]"></span>
                                                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[12px] text-[#aff82a]">folder</span> Website Redesign</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Activity 2 */}
                                    <div className="relative flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-[12px] font-bold text-white shrink-0 z-10 border-4 border-[#1C1F26]">MR</div>
                                        <div className="flex-1 min-w-0 bg-[#0F1115] border border-[#2D3139] rounded-lg p-3">
                                            <p className="text-[13px] text-[#e0e5d0] mb-3">
                                                <span className="font-semibold text-white">Maya Ricard</span> moved <span className="text-[#aff82a] cursor-pointer hover:underline">Payments module - code review</span> from In Progress → In Review
                                            </p>
                                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#8c947b]">
                                                <span>9:14 AM</span>
                                                <span className="w-1 h-1 rounded-full bg-[#424934]"></span>
                                                <span className="text-[#aff82a]">Status Change</span>
                                                <span className="w-1 h-1 rounded-full bg-[#424934]"></span>
                                                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[12px] text-[#aff82a]">folder</span> Website Redesign</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Activity 3 */}
                                    <div className="relative flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-full bg-pink-600 flex items-center justify-center text-[12px] font-bold text-white shrink-0 z-10 border-4 border-[#1C1F26]">AK</div>
                                        <div className="flex-1 min-w-0 bg-[#0F1115] border border-[#2D3139] rounded-lg p-3">
                                            <p className="text-[13px] text-[#e0e5d0] mb-3">
                                                <span className="font-semibold text-white">Ade Kolade</span> assigned <span className="text-[#aff82a] cursor-pointer hover:underline">Document API endpoints — v2 spec</span> to you
                                            </p>
                                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#8c947b]">
                                                <span>9:14 AM</span>
                                                <span className="w-1 h-1 rounded-full bg-[#424934]"></span>
                                                <span className="text-orange-400">Assigned to you</span>
                                                <span className="w-1 h-1 rounded-full bg-[#424934]"></span>
                                                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[12px] text-[#aff82a]">folder</span> Project launch</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Activity 4 */}
                                    <div className="relative flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-[12px] font-bold text-white shrink-0 z-10 border-4 border-[#1C1F26]">TJ</div>
                                        <div className="flex-1 min-w-0 bg-[#0F1115] border border-[#2D3139] rounded-lg p-3">
                                            <p className="text-[13px] text-[#e0e5d0] mb-3">
                                                <span className="font-semibold text-white">Temi Joolaso</span> uploaded <b>auth-flow-revised.fig</b> to <span className="text-[#aff82a] cursor-pointer hover:underline">Fix auth token expiry bug</span>
                                            </p>
                                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#8c947b]">
                                                <span>9:14 AM</span>
                                                <span className="w-1 h-1 rounded-full bg-[#424934]"></span>
                                                <span className="text-blue-400">File upload</span>
                                                <span className="w-1 h-1 rounded-full bg-[#424934]"></span>
                                                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[12px] text-[#aff82a]">folder</span> Website Redesign</span>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                    </div>

                    {/* MEETINGS SECTION */}
                    <div className="space-y-md">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[20px] font-semibold text-white">Meetings</h3>
                            <button className="text-[#aff82a] text-[14px] hover:underline">View all meetings</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">
                            
                            {/* Meeting 1 */}
                            <div className="bg-[#1C1F26] border border-[#2D3139] rounded-xl p-md hover:border-[#424934] transition-colors">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3 text-[12px] text-[#8c947b]">
                                        <span className="font-semibold text-white">9:00 - 9:30 AM</span>
                                        <span className="w-1 h-1 rounded-full bg-[#424934]"></span>
                                        <span>30 mins</span>
                                    </div>
                                    <div className="flex -space-x-2">
                                        <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26] text-white">TJ</div>
                                        <div className="w-6 h-6 rounded-full bg-yellow-600 flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26] text-white">MG</div>
                                        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26] text-white">CL</div>
                                        <div className="w-6 h-6 rounded-full bg-[#2D3139] flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26] text-[#8c947b]">+2</div>
                                    </div>
                                </div>
                                <div className="mb-6">
                                    <h4 className="text-[16px] font-semibold text-white mb-1">Daily standup — Dev team</h4>
                                    <p className="text-[#aff82a] text-[13px]">Website redesign</p>
                                </div>
                                <div className="flex gap-3">
                                    <button className="flex-1 flex items-center justify-center gap-2 bg-[#0F1115] border border-[#2D3139] hover:bg-[#2D3139] text-white py-2 rounded-lg text-[13px] font-medium transition-colors">
                                        <span className="material-symbols-outlined text-[16px]">video_camera_front</span> Join Meeting
                                    </button>
                                    <button className="flex-1 flex items-center justify-center gap-2 bg-[#0F1115] border border-[#2D3139] hover:bg-[#2D3139] text-white py-2 rounded-lg text-[13px] font-medium transition-colors">
                                        <span className="material-symbols-outlined text-[16px]">description</span> Meeting notes
                                    </button>
                                </div>
                            </div>
                            
                            {/* Meeting 2 */}
                            <div className="bg-[#1C1F26] border border-[#2D3139] rounded-xl p-md hover:border-[#424934] transition-colors">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3 text-[12px] text-[#8c947b]">
                                        <span className="font-semibold text-white">9:00 - 9:30 AM</span>
                                        <span className="w-1 h-1 rounded-full bg-[#424934]"></span>
                                        <span>30 mins</span>
                                    </div>
                                    <div className="flex -space-x-2">
                                        <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26] text-white">TJ</div>
                                        <div className="w-6 h-6 rounded-full bg-yellow-600 flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26] text-white">MG</div>
                                        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26] text-white">CL</div>
                                        <div className="w-6 h-6 rounded-full bg-[#2D3139] flex items-center justify-center text-[10px] font-bold border-2 border-[#1C1F26] text-[#8c947b]">+2</div>
                                    </div>
                                </div>
                                <div className="mb-6">
                                    <h4 className="text-[16px] font-semibold text-white mb-1">Daily standup — Dev team</h4>
                                    <p className="text-[#aff82a] text-[13px]">Website redesign</p>
                                </div>
                                <div className="flex gap-3">
                                    <button className="flex-1 flex items-center justify-center gap-2 bg-[#0F1115] border border-[#2D3139] hover:bg-[#2D3139] text-white py-2 rounded-lg text-[13px] font-medium transition-colors">
                                        <span className="material-symbols-outlined text-[16px]">video_camera_front</span> Join Meeting
                                    </button>
                                    <button className="flex-1 flex items-center justify-center gap-2 bg-[#0F1115] border border-[#2D3139] hover:bg-[#2D3139] text-white py-2 rounded-lg text-[13px] font-medium transition-colors">
                                        <span className="material-symbols-outlined text-[16px]">description</span> Meeting notes
                                    </button>
                                </div>
                            </div>
                            
                        </div>
                    </div>
                </div>
            </main>

            {/* Project panel */}
            {selectedProject && (
                <ProjectPanel
                    project={selectedProject}
                    onClose={() => setSelectedProject(null)}
                    onPreview={setPreviewFile}
                />
            )}

            {/* Document viewer */}
            {previewFile && (
                <DocViewer
                    file={previewFile}
                    onClose={() => setPreviewFile(null)}
                />
            )}
        </>
    )
}

export default Home
