import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"
import PieChart from "./components/PieChart"
import AnimatedNumber from "./components/AnimatedNumber"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "./supabase"
import { useRole } from "./RoleContext"

const STATUS_COLORS = {
  todo: "#818cf8",
  in_progress: "#E8A838",
  done: "#33B26C",
  overdue: "#ef4444",
}

const PROJECTS_COLLAPSED_KEY = "reports:projectsCollapsed"
const STAGGER_MS = 60
const MAX_STAGGER_MS = 480

const readProjectsCollapsed = () => {
  try {
    return localStorage.getItem(PROJECTS_COLLAPSED_KEY) === "true"
  } catch {
    return false
  }
}

const writeProjectsCollapsed = (collapsed) => {
  try {
    localStorage.setItem(PROJECTS_COLLAPSED_KEY, String(collapsed))
  } catch {
    // Storage unavailable (private mode / blocked) — state just won't persist.
  }
}

const staggerStyle = (index) => ({
  animationDelay: `${Math.min(index * STAGGER_MS, MAX_STAGGER_MS)}ms`,
})

export default function Reports() {
  const navigate = useNavigate()
  const { isSuperAdmin, isAdmin } = useRole()
  const isAdminLevel = Boolean(isSuperAdmin || isAdmin)

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  // Current session & profile
  const [currentUserId, setCurrentUserId] = useState(() => localStorage.getItem("userId") || null)
  const [organizationId, setOrganizationId] = useState(null)
  const [userAssignedProjectIds, setUserAssignedProjectIds] = useState(new Set())
  const [adminTeamSpaceIds, setAdminTeamSpaceIds] = useState(new Set())
  const [userTeamSpaceIds, setUserTeamSpaceIds] = useState(new Set())
  const [interactionNotice, setInteractionNotice] = useState(null)

  // Raw data from DB
  const [allTasks, setAllTasks] = useState([])
  const [allProjects, setAllProjects] = useState([])

  // Top Filter Controls
  const [scope, setScope] = useState("workspace") // "workspace" | "personal"

  // Project Grid Filter & Search
  const [projectSearchQuery, setProjectSearchQuery] = useState("")
  const [projectStatusFilter, setProjectStatusFilter] = useState("all") // "all" | "in_progress" | "done" | "attention"
  const [isProjectsCollapsed, setIsProjectsCollapsed] = useState(readProjectsCollapsed)

  const toggleProjectsCollapsed = () => {
    const next = !isProjectsCollapsed
    setIsProjectsCollapsed(next)
    writeProjectsCollapsed(next)
  }

  // ── Helper: parse subtasks and calculate accurate status ────────────────
  const parseSubtasks = useCallback((raw) => {
    if (!raw) return []
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
      if (!Array.isArray(parsed)) {
        if (parsed !== null && parsed !== undefined) {
          console.warn("Malformed sub_tasks (expected array):", parsed)
        }
        return []
      }
      return parsed
    } catch (error) {
      console.warn("Malformed sub_tasks:", error)
      return []
    }
  }, [])

  const getEffectiveStatus = useCallback((task) => {
    const subtasks = parseSubtasks(task.sub_tasks)
    if (subtasks.length > 0) {
      if (subtasks.every((st) => st.done)) return "done"
      if (subtasks.some((st) => st.done)) return "in_progress"
      return "todo"
    }
    return task.status || "todo"
  }, [parseSubtasks])

  const isTaskOverdue = useCallback((task, effectiveStatus) => {
    if (effectiveStatus === "done") return false
    if (!task.due_date) return false
    const due = new Date(task.due_date)
    return !isNaN(due.getTime()) && due < new Date()
  }, [])

  // ── Main data fetcher ───────────────────────────────────────────────────
  const fetchReportData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    else setIsRefreshing(true)

    try {
      // 1. Get authenticated user
      let userId = localStorage.getItem("userId")
      if (!userId) {
        const { data: authData } = await supabase.auth.getUser()
        userId = authData?.user?.id
        if (userId) localStorage.setItem("userId", userId)
      }
      if (!userId) {
        setLoading(false)
        setIsRefreshing(false)
        return
      }
      setCurrentUserId(userId)

      // 2. Get user's organization profile
      const { data: userProfile } = await supabase
        .from("users")
        .select("id, organization_id")
        .eq("id", userId)
        .maybeSingle()

      const orgId = userProfile?.organization_id || null
      setOrganizationId(orgId)

      // 3. Fetch team spaces and projects
      let projectsList = []
      if (orgId) {
        const { data: teamSpaces } = await supabase
          .from("team_spaces")
          .select("id, name")
          .eq("organization_id", orgId)

        const teamMap = {}
        const teamIds = (teamSpaces || []).map((t) => {
          teamMap[t.id] = t.name
          return t.id
        })

        if (teamIds.length > 0) {
          const { data: projs } = await supabase
            .from("project_spaces")
            .select("id, name, status, team_space_id, created_at")
            .in("team_space_id", teamIds)
            .order("created_at", { ascending: false })

          if (projs) {
            projectsList = projs.map((p) => ({
              ...p,
              team_space_name: teamMap[p.team_space_id] || "General Team",
            }))
          }
        }
      }

      // 4. Fetch project memberships for current user
      const { data: memberRows } = await supabase
        .from("project_members")
        .select("project_id")
        .eq("user_id", userId)

      const assignedProjectSet = new Set((memberRows || []).map((m) => String(m.project_id)))

      // 5. Fetch tasks strictly for the user's workspace or assigned
      let taskQuery = supabase
        .from("tasks")
        .select("id, status, sub_tasks, due_date, assignee_id, project_id, organization_id, project:project_spaces(id, name, status)")

      if (orgId) {
        taskQuery = taskQuery.eq("organization_id", orgId)
      } else {
        taskQuery = taskQuery.eq("assignee_id", userId)
      }

      const { data: tasksData, error: taskErr } = await taskQuery.order("created_at", { ascending: false })

      if (!taskErr && tasksData) {
        const processedTasks = tasksData.map((t) => {
          const effectiveStatus = getEffectiveStatus(t)
          const overdue = isTaskOverdue(t, effectiveStatus)
          if (String(t.assignee_id) === String(userId) && t.project_id) {
            assignedProjectSet.add(String(t.project_id))
          }
          return {
            ...t,
            effectiveStatus,
            isOverdue: overdue,
            finalStatus: overdue ? "overdue" : effectiveStatus,
            projectName: t.project?.name || null,
          }
        })

        setAllTasks(processedTasks)
      }
      setUserAssignedProjectIds(assignedProjectSet)

      // 6. Departments (team spaces) the user belongs to, and those they administer
      const { data: membershipRows, error: membershipErr } = await supabase
        .from("memberships")
        .select("team_space_id, role")
        .eq("user_id", userId)
      if (membershipErr) console.error("Error fetching departments:", membershipErr)
      const memberships = (membershipRows || []).filter((m) => m.team_space_id)
      setUserTeamSpaceIds(new Set(memberships.map((m) => String(m.team_space_id))))
      const adminTeamIds = memberships.filter((m) => m.role === "admin").map((m) => String(m.team_space_id))
      setAdminTeamSpaceIds(new Set(adminTeamIds))

      // Department projects not already loaded (e.g. user has no organisation)
      const loadedTeamIds = new Set(projectsList.map((p) => String(p.team_space_id)))
      const missingTeamIds = adminTeamIds.filter((id) => !loadedTeamIds.has(id))
      if (missingTeamIds.length > 0) {
        const { data: deptProjs, error: deptErr } = await supabase
          .from("project_spaces")
          .select("id, name, status, team_space_id, created_at, team_space:team_spaces(name)")
          .in("team_space_id", missingTeamIds)
          .order("created_at", { ascending: false })
        if (deptErr) {
          console.error("Error fetching department projects:", deptErr)
        } else {
          projectsList = [
            ...projectsList,
            ...(deptProjs || []).map(({ team_space, ...p }) => ({
              ...p,
              team_space_name: team_space?.name || "General Team",
            })),
          ]
        }
      }

      // 7. Include assigned projects outside the organisation's team spaces,
      //    so the user's workspace list is complete
      const knownIds = new Set(projectsList.map((p) => String(p.id)))
      const missingIds = [...assignedProjectSet].filter((id) => !knownIds.has(id))
      if (missingIds.length > 0) {
        const { data: extraProjs, error: extraErr } = await supabase
          .from("project_spaces")
          .select("id, name, status, team_space_id, created_at, team_space:team_spaces(name)")
          .in("id", missingIds)
        if (extraErr) {
          console.error("Error fetching assigned projects:", extraErr)
        } else {
          projectsList = [
            ...projectsList,
            ...(extraProjs || []).map(({ team_space, ...p }) => ({
              ...p,
              team_space_name: team_space?.name || "General Team",
            })),
          ]
        }
      }
      setAllProjects(projectsList)

      setLastUpdated(new Date())
    } catch (err) {
      console.error("Error fetching report data:", err)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [getEffectiveStatus, isTaskOverdue])

  // ── Project interaction permission check ─────────────────────────────────
  const isAssignedToProject = useCallback((projectId) => {
    if (isAdminLevel) return true
    return userAssignedProjectIds.has(String(projectId))
  }, [isAdminLevel, userAssignedProjectIds])

  const handleProjectClick = (proj) => {
    if (isAdminLevel || isAssignedToProject(proj.id)) {
      navigate(`/project_page/${proj.id}`)
    } else {
      setInteractionNotice({
        title: "Workspace Observer Mode",
        project: proj.name,
        message: "You can view this project's status in the report, but only assigned team members and workspace administrators can enter and manage tasks within it."
      })
    }
  }

  // ── Initial load & live subscriptions ──────────────────────────────────
  useEffect(() => {
    fetchReportData()

    const userId = currentUserId || localStorage.getItem("userId")
    // Determine realtime filter:
    // - Personal reports: filter by assignee_id to only react to user's own tasks
    // - Organization reports: filter by organization_id if available, otherwise fallback to assignee_id
    const taskFilter = scope === "personal" || !organizationId
      ? (userId ? `assignee_id=eq.${userId}` : undefined)
      : `organization_id=eq.${organizationId}`

    const taskSubOptions = {
      event: "*",
      schema: "public",
      table: "tasks",
      ...(taskFilter ? { filter: taskFilter } : {})
    }

    // 1. Supabase Realtime channel on both tasks and project_spaces
    const channelName = `reports-realtime-${scope}-${userId || "anon"}-${organizationId || "none"}`
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        taskSubOptions,
        () => {
          fetchReportData(true)
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_spaces" },
        () => {
          fetchReportData(true)
        }
      )
      .subscribe()

    // 2. Background polling fallback (every 12 seconds)
    const pollingInterval = setInterval(() => {
      fetchReportData(true)
    }, 12000)

    // 3. Tab focus & visibility change listener
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchReportData(true)
      }
    }
    const handleWindowFocus = () => {
      fetchReportData(true)
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleWindowFocus)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollingInterval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleWindowFocus)
    }
  }, [fetchReportData, scope, currentUserId, organizationId])

  // ── Filtered tasks according to active scope & project ───────────────────
  // project id -> department (team space) id
  const projectTeamSpace = useMemo(
    () => new Map(allProjects.map((p) => [String(p.id), String(p.team_space_id)])),
    [allProjects]
  )

  // "Entire Workspace": super admins see the whole organisation; admins and
  // members see the departments they belong to.
  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (scope === "workspace") {
        if (organizationId && t.organization_id && String(t.organization_id) !== String(organizationId)) {
          return false
        }
        if (!isSuperAdmin && !userTeamSpaceIds.has(projectTeamSpace.get(String(t.project_id)))) {
          return false
        }
      }
      if (scope === "personal" && String(t.assignee_id) !== String(currentUserId)) {
        return false
      }
      return true
    })
  }, [allTasks, scope, currentUserId, organizationId, isSuperAdmin, userTeamSpaceIds, projectTeamSpace])

  // ── Metrics computation ──────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const counts = { todo: 0, in_progress: 0, done: 0, overdue: 0 }
    filteredTasks.forEach((t) => {
      if (counts[t.finalStatus] !== undefined) {
        counts[t.finalStatus]++
      }
    })
    const total = Object.values(counts).reduce((s, v) => s + v, 0)
    const completionRate = total > 0 ? Math.round((counts.done / total) * 100) : 0
    return { ...counts, total, completionRate }
  }, [filteredTasks])

  const pieSlices = useMemo(() => [
    { label: "To do",       value: metrics.todo,        color: STATUS_COLORS.todo },
    { label: "In progress", value: metrics.in_progress, color: STATUS_COLORS.in_progress },
    { label: "Done",        value: metrics.done,        color: STATUS_COLORS.done },
    { label: "Overdue",     value: metrics.overdue,     color: STATUS_COLORS.overdue },
  ], [metrics])

  // ── Ongoing Projects breakdown ──────────────────────────────────────────
  // Project cards follow the scope switch: "Assigned to Me" counts only the
  // user's own tasks, "Entire Workspace" counts every task in the project.
  const projectStats = useMemo(() => {
    const scopedTasks = scope === "personal"
      ? allTasks.filter((t) => String(t.assignee_id) === String(currentUserId))
      : allTasks
    return allProjects.map((proj) => {
      const projTasks = scopedTasks.filter((t) => String(t.project_id) === String(proj.id))
      const total = projTasks.length
      const done = projTasks.filter((t) => t.effectiveStatus === "done").length
      const inProgress = projTasks.filter((t) => t.effectiveStatus === "in_progress").length
      const overdue = projTasks.filter((t) => t.isOverdue).length
      const progressPct = total > 0 ? Math.round((done / total) * 100) : 0

      let calculatedStatus = "in_progress"
      if (total > 0 && done === total) {
        calculatedStatus = "done"
      } else if (overdue > 0) {
        calculatedStatus = "attention"
      }

      return {
        ...proj,
        totalTasks: total,
        doneTasks: done,
        inProgressTasks: inProgress,
        overdueTasks: overdue,
        progressPct,
        calculatedStatus,
      }
    })
  }, [allProjects, allTasks, scope, currentUserId])

  // Projects filtered for the Grid Section
  // Project Workspaces lists the projects the signed-in user is assigned to
  // (project member or assignee of a task in it). Admins also see every
  // project in the departments they administer.
  const assignedProjectStats = useMemo(
    () => projectStats.filter((proj) =>
      userAssignedProjectIds.has(String(proj.id)) ||
      (isAdmin && adminTeamSpaceIds.has(String(proj.team_space_id)))
    ),
    [projectStats, userAssignedProjectIds, isAdmin, adminTeamSpaceIds]
  )

  const filteredProjectGrid = useMemo(() => {
    return assignedProjectStats.filter((proj) => {
      if (projectStatusFilter === "in_progress" && proj.calculatedStatus !== "in_progress") {
        return false
      }
      if (projectStatusFilter === "done" && proj.calculatedStatus !== "done") {
        return false
      }
      if (projectStatusFilter === "attention" && proj.calculatedStatus !== "attention") {
        return false
      }
      if (projectSearchQuery.trim()) {
        const query = projectSearchQuery.toLowerCase()
        const matchesName = proj.name.toLowerCase().includes(query)
        const matchesTeam = proj.team_space_name && proj.team_space_name.toLowerCase().includes(query)
        if (!matchesName && !matchesTeam) return false
      }
      return true
    })
  }, [assignedProjectStats, projectStatusFilter, projectSearchQuery])

  return (
    <div className="bg-[#0F1115] text-[#e0e5d0] min-h-screen font-sans flex antialiased">
      <Sidebar onCollapsedChange={setSidebarCollapsed} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main
          className={`${
            sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"
          } flex-1 flex flex-col pt-16 transition-all duration-300 ease-out`}
        >
          <div className="p-6 md:p-8 space-y-7 max-w-[1400px] w-full mx-auto">

            {/* ══════════════════════════════════════════════════════════════════════
                1. UNIFIED HEADER & TOP CONTROLS BAR
                ══════════════════════════════════════════════════════════════════════ */}
            <div className="reports-rise relative z-20 bg-[#16191F] border border-[#2D3139] rounded-2xl p-5 md:p-6 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                
                {/* Title & Live Status */}
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                      Reports & Analytics
                    </h1>
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                        isRefreshing
                          ? "bg-[var(--primary-color)]/10 text-[var(--primary-color)] border-[var(--primary-color)]/30 animate-pulse"
                          : "bg-[#33B26C]/10 text-[#33B26C] border-[#33B26C]/25"
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isRefreshing ? "bg-[var(--primary-color)] animate-spin" : "bg-[#33B26C]"
                        }`}
                      />
                      {isRefreshing ? "Syncing..." : "Live Data"}
                    </span>
                    {!isAdminLevel && (
                      <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-white/5 border border-[#2D3139] text-[#8c947b] text-xs">
                        <span className="material-symbols-outlined text-[14px] text-amber-400">shield_person</span>
                        Member Mode
                      </span>
                    )}
                  </div>
                  <p className="text-xs md:text-sm text-[#8c947b] mt-1.5">
                    Real-time performance metrics, team workload distribution, and milestone tracking.
                  </p>
                </div>

                {/* Filter Controls Toolbar */}
                <div className="flex flex-wrap lg:flex-nowrap items-center gap-3 shrink-0">
                  
                  {/* Scope Switcher Segmented Control */}
                  <div className="bg-[#0F1115] p-1 rounded-xl border border-[#2D3139] flex items-center shadow-inner">
                    <button
                      type="button"
                      onClick={() => setScope("workspace")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        scope === "workspace"
                          ? "bg-[#aff82a] text-[#0F1115] shadow font-bold"
                          : "text-[#8c947b] hover:text-white"
                      }`}
                    >
                      Entire Workspace
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope("personal")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        scope === "personal"
                          ? "bg-[#aff82a] text-[#0F1115] shadow font-bold"
                          : "text-[#8c947b] hover:text-white"
                      }`}
                    >
                      Assigned to Me
                    </button>
                  </div>

                  {/* Manual Refresh Button */}
                  <button
                    type="button"
                    onClick={() => fetchReportData(true)}
                    disabled={isRefreshing}
                    title="Force refresh data"
                    className="shrink-0 bg-[#0F1115] hover:bg-[#1C1F26] border border-[#2D3139] hover:border-[#424934] text-[#8c947b] hover:text-white p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center disabled:opacity-50 shadow-sm"
                  >
                    <span className={`material-symbols-outlined text-[18px] ${isRefreshing ? "animate-spin text-[#aff82a]" : ""}`}>
                      refresh
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                2. KEY PERFORMANCE INDICATORS (KPI CARDS ROW)
                ══════════════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Total Tasks */}
              <div
                style={staggerStyle(1)}
                className="reports-rise bg-[#16191F] border border-[#2D3139] hover:border-[#424934] rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/30 group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#8c947b] uppercase tracking-wider">
                    Total Tasks
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-white/5 border border-[#2D3139] flex items-center justify-center text-[#818cf8] transition-transform duration-300 group-hover:scale-110">
                    <span className="material-symbols-outlined text-[18px]">checklist</span>
                  </div>
                </div>
                <div className="mt-4">
                  <AnimatedNumber value={metrics.total} className="block text-3xl font-extrabold text-white tracking-tight" />
                  <div className="text-[11px] text-[#8c947b] mt-1 flex items-center gap-1">
                    <span>{scope === "workspace" ? (isSuperAdmin ? "Across organization" : "Across your department") : "Assigned to your profile"}</span>
                  </div>
                </div>
              </div>

              {/* In Progress */}
              <div
                style={staggerStyle(2)}
                className="reports-rise bg-[#16191F] border border-[#2D3139] hover:border-[#E8A838]/40 rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-[#E8A838]/5 group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#E8A838] uppercase tracking-wider">
                    In Progress
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-[#E8A838]/10 border border-[#E8A838]/20 flex items-center justify-center text-[#E8A838] transition-transform duration-300 group-hover:scale-110">
                    <span className="material-symbols-outlined text-[18px]">pending_actions</span>
                  </div>
                </div>
                <div className="mt-4">
                  <AnimatedNumber value={metrics.in_progress} className="block text-3xl font-extrabold text-[#E8A838] tracking-tight" />
                  <div className="text-[11px] text-[#8c947b] mt-1">
                    Currently under active execution
                  </div>
                </div>
              </div>

              {/* Completed */}
              <div
                style={staggerStyle(3)}
                className="reports-rise bg-[#16191F] border border-[#2D3139] hover:border-[#33B26C]/40 rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-[#33B26C]/5 group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#33B26C] uppercase tracking-wider">
                    Completed
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-[#33B26C]/10 border border-[#33B26C]/20 flex items-center justify-center text-[#33B26C] transition-transform duration-300 group-hover:scale-110">
                    <span className="material-symbols-outlined text-[18px]">task_alt</span>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-baseline gap-2">
                    <AnimatedNumber value={metrics.done} className="text-3xl font-extrabold text-[#33B26C] tracking-tight" />
                    <span className="text-xs font-bold text-[#33B26C]/90 bg-[#33B26C]/15 px-2 py-0.5 rounded-md">
                      {metrics.completionRate}%
                    </span>
                  </div>
                  <div className="text-[11px] text-[#8c947b] mt-1">
                    Successfully finished deliverables
                  </div>
                </div>
              </div>

              {/* Overdue */}
              <div
                style={staggerStyle(4)}
                className={`reports-rise rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg group border ${
                  metrics.overdue > 0
                    ? "bg-[#16191F] border-red-500/40 shadow-sm shadow-red-500/10"
                    : "bg-[#16191F] border-[#2D3139] hover:border-[#424934]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                    Overdue
                  </span>
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${
                      metrics.overdue > 0
                        ? "bg-red-500/15 text-red-400 border border-red-500/30"
                        : "bg-white/5 text-[#8c947b] border border-[#2D3139]"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">warning</span>
                  </div>
                </div>
                <div className="mt-4">
                  <AnimatedNumber
                    value={metrics.overdue}
                    className={`block text-3xl font-extrabold tracking-tight transition-colors duration-300 ${metrics.overdue > 0 ? "text-red-400" : "text-white"}`}
                  />
                  <div className="text-[11px] text-[#8c947b] mt-1">
                    {metrics.overdue > 0 ? "Requires urgent attention" : "All deliverables on schedule"}
                  </div>
                </div>
              </div>

            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                3. WORKLOAD DISTRIBUTION & TASK STATUS
                ══════════════════════════════════════════════════════════════════════ */}
            <div style={staggerStyle(5)} className="reports-rise bg-[#16191F] border border-[#2D3139] rounded-2xl p-6 md:p-8 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-[#2D3139]/60">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#aff82a]/10 text-[#aff82a] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[19px]">pie_chart</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Workload Distribution</h2>
                    <p className="text-xs text-[#8c947b] mt-0.5">
                      Categorized breakdown of task statuses across the selected workspace filter
                    </p>
                  </div>
                </div>

                {lastUpdated && (
                  <div className="flex items-center gap-2 text-xs text-[#8c947b] bg-[#0F1115] px-3 py-1.5 rounded-full border border-[#2D3139]/60 self-start sm:self-auto">
                    <span className="w-2 h-2 rounded-full bg-[#33B26C] animate-pulse" />
                    <span>Live · Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                )}
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <span className="material-symbols-outlined animate-spin text-3xl text-[#aff82a]">
                    progress_activity
                  </span>
                  <p className="text-xs text-[#8c947b]">Calculating workspace metrics...</p>
                </div>
              ) : (
                <div className="reports-fade mt-6 flex flex-col md:flex-row items-center gap-8 lg:gap-14">
                  {/* Donut chart */}
                  <div className="shrink-0 flex justify-center">
                    <PieChart slices={pieSlices} size={210} showLegend={false} />
                  </div>

                  {/* 4 Status Breakdown Bars in clean 2x2 grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 w-full">
                    {pieSlices.map(({ label, value, color }, index) => {
                      const pct = metrics.total === 0 ? 0 : Math.round((value / metrics.total) * 100)
                      return (
                        <div
                          key={label}
                          style={staggerStyle(index + 1)}
                          className="reports-rise bg-[#0F1115] border border-[#2D3139] rounded-xl p-4 flex flex-col justify-between gap-3 hover:border-[#424934] hover:-translate-y-0.5 transition-all duration-300"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-white flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block"
                                style={{ backgroundColor: color }}
                              />
                              {label}
                            </span>
                            <span
                              className="text-xs font-bold px-2 py-0.5 rounded-md"
                              style={{ backgroundColor: `${color}18`, color }}
                            >
                              {pct}%
                            </span>
                          </div>

                          <div className="flex items-baseline justify-between">
                            <AnimatedNumber value={value} className="text-2xl font-bold" style={{ color }} />
                            <span className="text-xs text-[#8c947b]">
                              of {metrics.total} tasks
                            </span>
                          </div>

                          <div className="h-1.5 w-full bg-[#1C1F26] rounded-full overflow-hidden">
                            <div
                              className="reports-grow h-full rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${pct}%`, backgroundColor: color, ...staggerStyle(index + 3) }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                4. PROJECTS PERFORMANCE SECTION (STRUCTURED & INTUITIVE)
                ══════════════════════════════════════════════════════════════════════ */}
            <div style={staggerStyle(6)} className="reports-rise bg-[#16191F] border border-[#2D3139] rounded-2xl p-6 shadow-sm">

              {/* Section Header with Search & Filter Pills */}
              <div
                className={`flex flex-col md:flex-row md:items-center justify-between gap-4 border-b transition-all duration-300 ${
                  isProjectsCollapsed ? "pb-0 border-transparent" : "pb-4 border-[#2D3139]/60"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={toggleProjectsCollapsed}
                      aria-expanded={!isProjectsCollapsed}
                      title={isProjectsCollapsed ? "Expand project workspaces" : "Collapse project workspaces"}
                      className="w-7 h-7 rounded-lg bg-[#0F1115] border border-[#2D3139] hover:border-[#424934] text-[#8c947b] hover:text-white flex items-center justify-center transition-all cursor-pointer"
                    >
                      <span
                        className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${
                          isProjectsCollapsed ? "-rotate-90" : ""
                        }`}
                      >
                        expand_more
                      </span>
                    </button>
                    <h2 className="text-lg font-bold text-white">Project Workspaces</h2>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#0F1115] text-[#aff82a] border border-[#2D3139]">
                      {filteredProjectGrid.length} of {assignedProjectStats.length}
                    </span>
                  </div>
                  <p className="text-xs text-[#8c947b] mt-0.5">
                    Individual project progress, milestone velocity, and member access.
                  </p>
                </div>

                {/* Search & Status Filters */}
                {!isProjectsCollapsed && (
                <div className="reports-fade flex flex-wrap items-center gap-2.5">
                  
                  {/* Inline Project Search */}
                  <div className="relative">
                    <span className="material-symbols-outlined text-[16px] text-[#8c947b] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      search
                    </span>
                    <input
                      type="text"
                      placeholder="Search projects..."
                      value={projectSearchQuery}
                      onChange={(e) => setProjectSearchQuery(e.target.value)}
                      className="bg-[#0F1115] border border-[#2D3139] focus:border-[#aff82a] text-xs text-white placeholder-[#8c947b]/60 pl-8 pr-3 py-1.5 rounded-xl outline-none transition-all w-36 sm:w-48"
                    />
                  </div>

                  {/* Filter Pills */}
                  <div className="bg-[#0F1115] p-1 rounded-xl border border-[#2D3139] flex items-center text-xs">
                    <button
                      type="button"
                      onClick={() => setProjectStatusFilter("all")}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                        projectStatusFilter === "all" ? "bg-[#1C1F26] text-white" : "text-[#8c947b] hover:text-white"
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setProjectStatusFilter("in_progress")}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                        projectStatusFilter === "in_progress" ? "bg-[#1C1F26] text-[#E8A838]" : "text-[#8c947b] hover:text-white"
                      }`}
                    >
                      In Progress
                    </button>
                    <button
                      type="button"
                      onClick={() => setProjectStatusFilter("done")}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                        projectStatusFilter === "done" ? "bg-[#1C1F26] text-[#33B26C]" : "text-[#8c947b] hover:text-white"
                      }`}
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={() => setProjectStatusFilter("attention")}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                        projectStatusFilter === "attention" ? "bg-[#1C1F26] text-red-400" : "text-[#8c947b] hover:text-white"
                      }`}
                    >
                      Attention
                    </button>
                  </div>

                </div>
                )}
              </div>

              {/* Projects Grid — animates height via grid rows so collapse/expand glides */}
              <div
                inert={isProjectsCollapsed}
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                  isProjectsCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
                }`}
              >
              {/* Negative margins give hover lift + shadow room inside the clipping wrapper */}
              <div className="min-h-0 overflow-hidden -mx-2 px-2 -mb-2 pb-2">
              <div className="pt-5">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-8">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-[#0F1115] border border-[#2D3139] rounded-xl p-5 h-44 animate-pulse" />
                  ))}
                </div>
              ) : filteredProjectGrid.length === 0 ? (
                <div className="reports-fade text-center py-14 bg-[#0F1115] rounded-xl border border-dashed border-[#2D3139]">
                  <span className="material-symbols-outlined text-4xl text-[#8c947b]/40 mb-2">
                    folder_off
                  </span>
                  <p className="text-sm text-white font-medium">
                    {assignedProjectStats.length === 0 ? "No projects assigned to you yet" : "No matching projects found"}
                  </p>
                  <p className="text-xs text-[#8c947b] mt-1 max-w-sm mx-auto">
                    {assignedProjectStats.length === 0
                      ? "Projects appear here once you're added as a member or assigned a task."
                      : "Try adjusting your search query or status filter to see your other projects."}
                  </p>
                  {(projectSearchQuery || projectStatusFilter !== "all") && (
                    <button
                      type="button"
                      onClick={() => {
                        setProjectSearchQuery("")
                        setProjectStatusFilter("all")
                      }}
                      className="mt-3.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-[#aff82a] border border-[#2D3139] cursor-pointer transition-colors"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProjectGrid.map((proj, index) => {
                    const isCompleted = proj.calculatedStatus === "done"
                    const hasOverdue = proj.calculatedStatus === "attention"
                    const isAssigned = isAssignedToProject(proj.id)
                    const canInteract = isAdminLevel || isAssigned

                    return (
                      <div
                        key={proj.id}
                        onClick={() => handleProjectClick(proj)}
                        style={staggerStyle(index)}
                        className={`reports-rise bg-[#0F1115] border rounded-xl p-5 flex flex-col justify-between gap-4 cursor-pointer transition-all duration-300 group shadow-sm hover:shadow-lg hover:shadow-black/40 hover:-translate-y-1 ${
                          canInteract
                            ? "hover:bg-[#14171E] border-[#2D3139] hover:border-[#aff82a]/50"
                            : "hover:bg-[#14171E] border-[#2D3139] hover:border-amber-500/40"
                        }`}
                      >
                        {/* Project Header Row */}
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8c947b] truncate">
                              {proj.team_space_name}
                            </span>
                            
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                isCompleted
                                  ? "bg-[#33B26C]/15 text-[#33B26C]"
                                  : hasOverdue
                                  ? "bg-red-500/15 text-red-400"
                                  : "bg-[#E8A838]/15 text-[#E8A838]"
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              {isCompleted ? "Completed" : hasOverdue ? "Needs Attention" : "In Progress"}
                            </span>
                          </div>

                          <h3 className="text-base font-bold text-white group-hover:text-[#aff82a] transition-colors mt-2 truncate">
                            {proj.name}
                          </h3>
                        </div>

                        {/* Progress Bar & Numerical Stats */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#8c947b]">
                              {proj.doneTasks} of {proj.totalTasks} tasks done
                            </span>
                            <span className="font-bold text-white">{proj.progressPct}%</span>
                          </div>

                          <div className="h-2 w-full bg-[#1C1F26] rounded-full overflow-hidden border border-[#2D3139]/40">
                            <div
                              className={`reports-grow h-full rounded-full transition-all duration-700 ${
                                isCompleted
                                  ? "bg-[#33B26C]"
                                  : hasOverdue
                                  ? "bg-gradient-to-r from-[#E8A838] to-red-500"
                                  : "bg-gradient-to-r from-[#818cf8] to-[#aff82a]"
                              }`}
                              style={{ width: `${proj.progressPct}%`, ...staggerStyle(index + 2) }}
                            />
                          </div>
                        </div>

                        {/* Footer Badges & Action Link */}
                        <div className="flex items-center justify-between pt-3 border-t border-[#2D3139]/50 text-xs text-[#8c947b]">
                          <div className="flex items-center gap-2.5">
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#E8A838]" />
                              {proj.inProgressTasks} ongoing
                            </span>
                            {hasOverdue && (
                              <span className="flex items-center gap-1 text-red-400 font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                {proj.overdueTasks} overdue
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 font-medium group-hover:text-white transition-colors">
                            {canInteract ? (
                              <span className="flex items-center text-xs text-[#8c947b] group-hover:text-[#aff82a] transition-colors">
                                <span>Open</span>
                                <span className="material-symbols-outlined text-[15px] group-hover:translate-x-0.5 transition-transform">
                                  arrow_forward
                                </span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[11px] text-amber-400/80">
                                <span>Observer</span>
                                <span className="material-symbols-outlined text-[13px]">lock</span>
                              </span>
                            )}
                          </div>
                        </div>

                      </div>
                    )
                  })}
                </div>
              )}
              </div>
              </div>
              </div>

            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                5. TOAST NOTIFICATION FOR OBSERVER MODE
                ══════════════════════════════════════════════════════════════════════ */}
            {interactionNotice && (
              <div className="fixed bottom-6 right-6 z-50 max-w-sm sm:max-w-md bg-[#16191F]/95 border border-amber-500/40 text-white p-4 rounded-2xl shadow-2xl flex items-start gap-3 backdrop-blur-xl reports-rise">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                </div>
                <div className="flex-1 text-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-amber-300 text-xs sm:text-sm">{interactionNotice.title}</h4>
                    <button
                      type="button"
                      onClick={() => setInteractionNotice(null)}
                      className="text-[#8c947b] hover:text-white p-0.5 rounded cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                  <p className="text-white/90 font-medium mt-1">
                    Project: <span className="text-[#aff82a]">{interactionNotice.project}</span>
                  </p>
                  <p className="text-[#8c947b] mt-1 leading-relaxed">
                    {interactionNotice.message}
                  </p>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  )
}
