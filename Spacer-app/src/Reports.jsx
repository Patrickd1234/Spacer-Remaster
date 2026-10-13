import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"
import PieChart from "./components/PieChart"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "./supabase"

const STATUS_COLORS = {
  todo:        "#818cf8",
  in_progress: "#E8A838",
  done:        "#33B26C",
  overdue:     "#ef4444",
}

export default function Reports() {
  const navigate = useNavigate()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  // Current session & profile
  const [currentUserId, setCurrentUserId] = useState(null)
  const [organizationId, setOrganizationId] = useState(null)

  // Raw data from DB
  const [allTasks, setAllTasks] = useState([])
  const [allProjects, setAllProjects] = useState([])

  // Filters
  const [scope, setScope] = useState("workspace") // "workspace" | "personal"
  const [selectedProjectId, setSelectedProjectId] = useState("all") // "all" | project_id

  // Collapsible Ongoing Projects State (persisted for great UX)
  const [isProjectsCollapsed, setIsProjectsCollapsed] = useState(() => {
    return localStorage.getItem("reports_projects_collapsed") === "true"
  })

  const toggleProjectsCollapsed = () => {
    setIsProjectsCollapsed((prev) => {
      const next = !prev
      localStorage.setItem("reports_projects_collapsed", String(next))
      return next
    })
  }

  // Custom Dropdown State & Ref
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false)
  const [projectSearchQuery, setProjectSearchQuery] = useState("")
  const projectDropdownRef = useRef(null)

  // Close dropdown on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target)) {
        setIsProjectDropdownOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsProjectDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  // ── Helper: parse subtasks and calculate accurate status ────────────────
  const parseSubtasks = useCallback((raw) => {
    if (!raw) return []
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [])

  const getEffectiveStatus = useCallback((task) => {
    const subtasks = parseSubtasks(task.sub_tasks)
    if (subtasks.length > 0) {
      if (subtasks.every((st) => st.done)) return "done"
      if (subtasks.some((st => st.done))) return "in_progress"
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
            .select("*")
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

      setAllProjects(projectsList)

      // 4. Fetch tasks
      let taskQuery = supabase
        .from("tasks")
        .select("*, project:project_spaces(id, name, status)")

      if (orgId) {
        taskQuery = taskQuery.eq("organization_id", orgId)
      } else {
        taskQuery = taskQuery.eq("assignee_id", userId)
      }

      const { data: tasksData, error: taskErr } = await taskQuery.order("created_at", { ascending: false })

      if (!taskErr && tasksData) {
        // Compute and normalize status for every task
        const processedTasks = tasksData.map((t) => {
          const effectiveStatus = getEffectiveStatus(t)
          const overdue = isTaskOverdue(t, effectiveStatus)
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

      setLastUpdated(new Date())
    } catch (err) {
      console.error("Error fetching report data:", err)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [getEffectiveStatus, isTaskOverdue])

  // ── Initial load & live subscriptions ──────────────────────────────────
  useEffect(() => {
    fetchReportData()

    // 1. Supabase Realtime channel on both tasks and project_spaces
    const channel = supabase
      .channel("reports-realtime-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
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

    // 2. Background polling fallback (every 10 seconds)
    const pollingInterval = setInterval(() => {
      fetchReportData(true)
    }, 10000)

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
  }, [fetchReportData])

  // ── Filtered tasks according to active scope & project ───────────────────
  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      // Scope filter
      if (scope === "personal" && t.assignee_id !== currentUserId) {
        return false
      }
      // Project filter
      if (selectedProjectId !== "all" && String(t.project_id) !== String(selectedProjectId)) {
        return false
      }
      return true
    })
  }, [allTasks, scope, currentUserId, selectedProjectId])

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
  const projectStats = useMemo(() => {
    return allProjects.map((proj) => {
      const projTasks = allTasks.filter((t) => String(t.project_id) === String(proj.id))
      const total = projTasks.length
      const done = projTasks.filter((t) => t.effectiveStatus === "done").length
      const inProgress = projTasks.filter((t) => t.effectiveStatus === "in_progress").length
      const overdue = projTasks.filter((t) => t.isOverdue).length
      const progressPct = total > 0 ? Math.round((done / total) * 100) : 0

      return {
        ...proj,
        totalTasks: total,
        doneTasks: done,
        inProgressTasks: inProgress,
        overdueTasks: overdue,
        progressPct,
      }
    })
  }, [allProjects, allTasks])

  // Summary statistics for when the project section is collapsed
  const collapsedProjectSummary = useMemo(() => {
    const completedCount = projectStats.filter((p) => p.progressPct === 100 && p.totalTasks > 0).length
    const totalOngoingTasks = projectStats.reduce((acc, p) => acc + p.inProgressTasks, 0)
    const totalOverdueTasks = projectStats.reduce((acc, p) => acc + p.overdueTasks, 0)
    const totalDoneTasks = projectStats.reduce((acc, p) => acc + p.doneTasks, 0)
    const totalAllTasks = projectStats.reduce((acc, p) => acc + p.totalTasks, 0)
    const avgCompletion = totalAllTasks > 0 ? Math.round((totalDoneTasks / totalAllTasks) * 100) : 0

    return {
      completedCount,
      totalOngoingTasks,
      totalOverdueTasks,
      avgCompletion,
    }
  }, [projectStats])

  // Current selected project object for dropdown trigger label
  const selectedProjectObj = useMemo(() => {
    if (selectedProjectId === "all") return null
    return allProjects.find((p) => String(p.id) === String(selectedProjectId)) || null
  }, [allProjects, selectedProjectId])

  // Filtered project list for the custom dropdown search
  const filteredDropdownProjects = useMemo(() => {
    if (!projectSearchQuery.trim()) return allProjects
    const query = projectSearchQuery.toLowerCase()
    return allProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.team_space_name && p.team_space_name.toLowerCase().includes(query))
    )
  }, [allProjects, projectSearchQuery])

  return (
    <div className="flex bg-background text-on-surface min-h-screen">
      <Sidebar onCollapsedChange={setSidebarCollapsed} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main
          className={`${
            sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"
          } flex-1 flex flex-col pt-16 transition-all duration-300 ease-out`}
        >
          <div className="p-6 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
            
            {/* ── Page Header & Controls ─────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-outline-variant/50">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-bold text-on-surface tracking-tight">
                    Ongoing Status & Reports
                  </h1>
                  {isRefreshing && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--primary-color)]/10 text-[var(--primary-color)] border border-[var(--primary-color)]/20 animate-pulse">
                      <span className="material-symbols-outlined text-[13px] animate-spin">refresh</span>
                      Syncing...
                    </span>
                  )}
                </div>
                <p className="text-sm text-on-surface-variant mt-1">
                  Live real-time breakdown of ongoing projects, task lifecycles, and workspace progress.
                </p>
              </div>

              {/* Scope toggle & Action controls */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Scope selector */}
                <div className="bg-surface-container p-1 rounded-xl border border-outline-variant flex items-center shadow-sm">
                  <button
                    onClick={() => setScope("workspace")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      scope === "workspace"
                        ? "bg-primary-container text-on-primary shadow-sm font-bold"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    Entire Workspace
                  </button>
                  <button
                    onClick={() => setScope("personal")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      scope === "personal"
                        ? "bg-primary-container text-on-primary shadow-sm font-bold"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    Assigned to Me
                  </button>
                </div>

                {/* ── Optimal, Sleek Custom Project Dropdown ──────────────────────── */}
                {allProjects.length > 0 && (
                  <div className="relative" ref={projectDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsProjectDropdownOpen((prev) => !prev)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer bg-surface-container shadow-sm ${
                        isProjectDropdownOpen
                          ? "border-primary-fixed text-on-surface ring-2 ring-[#aff82a]/20 shadow-lg"
                          : selectedProjectId !== "all"
                          ? "border-primary-fixed/60 text-on-surface bg-surface-container"
                          : "border-outline-variant text-on-surface hover:border-outline hover:text-on-surface"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[17px] text-primary-fixed">
                        {selectedProjectId === "all" ? "dataset" : "folder_open"}
                      </span>
                      <span className="truncate max-w-[130px] sm:max-w-[170px] text-left">
                        {selectedProjectObj ? selectedProjectObj.name : `All Projects (${allProjects.length})`}
                      </span>
                      <span
                        className={`material-symbols-outlined text-[16px] text-on-surface-variant transition-transform duration-200 ${
                          isProjectDropdownOpen ? "rotate-180 text-on-surface" : ""
                        }`}
                      >
                        expand_more
                      </span>
                    </button>

                    {/* Dropdown Menu Popup */}
                    {isProjectDropdownOpen && (
                      <div className="absolute right-0 mt-2 w-72 max-w-[90vw] rounded-2xl bg-surface-container border border-outline-variant shadow-2xl z-50 overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                        {/* Search input (shown if multiple projects) */}
                        {allProjects.length > 3 && (
                          <div className="p-2.5 border-b border-outline-variant/70 bg-black/20">
                            <div className="relative">
                              <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                search
                              </span>
                              <input
                                type="text"
                                placeholder="Search projects..."
                                value={projectSearchQuery}
                                onChange={(e) => setProjectSearchQuery(e.target.value)}
                                className="w-full bg-background border border-outline-variant rounded-xl pl-8 pr-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/60 outline-none focus:border-primary-fixed/60 focus:ring-1 focus:ring-[#aff82a]/30 transition-all"
                                autoFocus
                              />
                            </div>
                          </div>
                        )}

                        {/* Options List */}
                        <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin">
                          {/* "All Projects" Option */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProjectId("all")
                              setIsProjectDropdownOpen(false)
                              setProjectSearchQuery("")
                            }}
                            className={`w-full px-3 py-2 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer ${
                              selectedProjectId === "all"
                                ? "bg-primary-container/15 text-on-surface font-bold"
                                : "hover:bg-on-surface/5 text-on-surface"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <div
                                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                  selectedProjectId === "all"
                                    ? "bg-primary-container text-on-primary"
                                    : "bg-surface-container-highest text-on-surface-variant"
                                }`}
                              >
                                <span className="material-symbols-outlined text-[15px]">apps</span>
                              </div>
                              <div className="truncate">
                                <div className="text-xs font-semibold truncate">All Projects</div>
                                <div className="text-[10px] text-on-surface-variant">
                                  Organization portfolio ({allProjects.length})
                                </div>
                              </div>
                            </div>

                            {selectedProjectId === "all" && (
                              <span className="material-symbols-outlined text-[16px] text-primary-fixed shrink-0 ml-2">
                                check
                              </span>
                            )}
                          </button>

                          <div className="h-px bg-surface-container-highest/50 my-1" />

                          {/* Individual Projects */}
                          {filteredDropdownProjects.length === 0 ? (
                            <div className="py-4 text-center text-xs text-on-surface-variant italic">
                              No matching projects found
                            </div>
                          ) : (
                            filteredDropdownProjects.map((proj) => {
                              const isSelected = String(selectedProjectId) === String(proj.id)
                              const projTasksCount = allTasks.filter(
                                (t) => String(t.project_id) === String(proj.id)
                              ).length

                              return (
                                <button
                                  key={proj.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedProjectId(proj.id)
                                    setIsProjectDropdownOpen(false)
                                    setProjectSearchQuery("")
                                  }}
                                  className={`w-full px-3 py-2 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer ${
                                    isSelected
                                      ? "bg-primary-container/15 text-on-surface font-bold"
                                      : "hover:bg-on-surface/5 text-on-surface"
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 overflow-hidden">
                                    <div
                                      className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                        isSelected
                                          ? "bg-primary-container text-on-primary"
                                          : "bg-surface-container-highest text-primary-fixed"
                                      }`}
                                    >
                                      <span className="material-symbols-outlined text-[15px]">
                                        folder
                                      </span>
                                    </div>
                                    <div className="truncate">
                                      <div className="text-xs font-semibold truncate text-on-surface">
                                        {proj.name}
                                      </div>
                                      <div className="text-[10px] text-on-surface-variant truncate flex items-center gap-1.5">
                                        <span>{proj.team_space_name}</span>
                                        <span>•</span>
                                        <span>{projTasksCount} tasks</span>
                                      </div>
                                    </div>
                                  </div>

                                  {isSelected && (
                                    <span className="material-symbols-outlined text-[16px] text-primary-fixed shrink-0 ml-2">
                                      check
                                    </span>
                                  )}
                                </button>
                              )
                            })
                          )}
                        </div>

                        {/* Footer Clear / Reset Link */}
                        {selectedProjectId !== "all" && (
                          <div className="p-2 border-t border-outline-variant/60 bg-black/10 flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProjectId("all")
                                setIsProjectDropdownOpen(false)
                                setProjectSearchQuery("")
                              }}
                              className="text-[11px] text-primary-fixed hover:underline font-medium px-2 py-0.5 cursor-pointer"
                            >
                              Reset to All Projects
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Manual refresh button */}
                <button
                  onClick={() => fetchReportData(true)}
                  disabled={isRefreshing}
                  title="Force refresh now"
                  className="bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface-variant hover:text-on-surface p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center disabled:opacity-50 shadow-sm"
                >
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      isRefreshing ? "animate-spin text-primary-fixed" : ""
                    }`}
                  >
                    sync
                  </span>
                </button>
              </div>
            </div>

            {/* ── Key Performance Cards ───────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Total Tasks */}
              <div className="glass-card rounded-2xl p-5 border border-outline-variant flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                    Total Tasks
                  </span>
                  <span className="p-2 rounded-xl bg-on-surface/5 text-on-surface-variant">
                    <span className="material-symbols-outlined text-[18px]">checklist</span>
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-3xl font-extrabold text-on-surface">{metrics.total}</div>
                  <div className="text-[11px] text-on-surface-variant mt-1">
                    {scope === "workspace" ? "Across organization" : "Assigned to your profile"}
                  </div>
                </div>
              </div>

              {/* In Progress / Ongoing */}
              <div className="glass-card rounded-2xl p-5 border border-outline-variant flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#E8A838] uppercase tracking-wider">
                    Ongoing
                  </span>
                  <span className="p-2 rounded-xl bg-[#E8A838]/10 text-[#E8A838]">
                    <span className="material-symbols-outlined text-[18px]">pending_actions</span>
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-3xl font-extrabold text-[#E8A838]">{metrics.in_progress}</div>
                  <div className="text-[11px] text-on-surface-variant mt-1">Currently in progress</div>
                </div>
              </div>

              {/* Completed Rate */}
              <div className="glass-card rounded-2xl p-5 border border-outline-variant flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#33B26C] uppercase tracking-wider">
                    Completed
                  </span>
                  <span className="p-2 rounded-xl bg-[#33B26C]/10 text-[#33B26C]">
                    <span className="material-symbols-outlined text-[18px]">task_alt</span>
                  </span>
                </div>
                <div className="mt-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-[#33B26C]">{metrics.done}</span>
                    <span className="text-xs font-semibold text-on-surface-variant">({metrics.completionRate}%)</span>
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-1">Successfully finished</div>
                </div>
              </div>

              {/* Overdue */}
              <div className={`glass-card rounded-2xl p-5 border flex flex-col justify-between ${
                metrics.overdue > 0 ? "border-error/30 bg-error/[0.03]" : "border-outline-variant"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-error uppercase tracking-wider">
                    Overdue
                  </span>
                  <span className="p-2 rounded-xl bg-error/10 text-error">
                    <span className="material-symbols-outlined text-[18px]">warning</span>
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-3xl font-extrabold text-error">{metrics.overdue}</div>
                  <div className="text-[11px] text-on-surface-variant mt-1">
                    {metrics.overdue > 0 ? "Requires urgent attention" : "No overdue items"}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Main Section: Task Status Distribution & Charts ─────────────── */}
            <div className="glass-card rounded-2xl p-6 md:p-8 border border-outline-variant">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-on-surface">Task Status Overview</h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Categorized distribution of active workloads and completion ratios
                  </p>
                </div>

                {lastUpdated && (
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant/60">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#33B26C] opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#33B26C]" />
                    </span>
                    <span>Live · Updated {lastUpdated.toLocaleTimeString()}</span>
                  </div>
                )}
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <span className="material-symbols-outlined animate-spin text-4xl text-primary-fixed">
                    progress_activity
                  </span>
                  <p className="text-xs text-on-surface-variant">Calculating latest workspace metrics...</p>
                </div>
              ) : (
                <div className="flex flex-col lg:flex-row items-center gap-10">
                  {/* Donut chart */}
                  <div className="shrink-0 flex justify-center py-2">
                    <PieChart slices={pieSlices} size={230} />
                  </div>

                  {/* Status Breakdown Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 w-full">
                    {pieSlices.map(({ label, value, color }) => {
                      const pct = metrics.total === 0 ? 0 : Math.round((value / metrics.total) * 100)
                      return (
                        <div
                          key={label}
                          className="bg-surface-container rounded-xl p-4 border border-outline-variant/80 flex flex-col justify-between gap-3 hover:border-outline transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-on-surface flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block"
                                style={{ backgroundColor: color }}
                              />
                              {label}
                            </span>
                            <span
                              className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: `${color}18`, color }}
                            >
                              {pct}%
                            </span>
                          </div>

                          <div className="flex items-baseline justify-between">
                            <span className="text-2xl font-bold" style={{ color }}>
                              {value}
                            </span>
                            <span className="text-xs text-on-surface-variant">
                              of {metrics.total} tasks
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${pct}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Collapsible Ongoing Projects Status Breakdown ───────────────── */}
            <div className="glass-card rounded-2xl p-6 md:p-8 border border-outline-variant transition-all duration-300">
              {/* Header with Title and Collapse/Expand Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div
                  className="cursor-pointer select-none group"
                  onClick={toggleProjectsCollapsed}
                >
                  <h2 className="text-lg font-bold text-on-surface flex items-center gap-2 group-hover:text-primary-fixed transition-colors">
                    <span className="material-symbols-outlined text-[20px] text-primary-fixed">
                      rocket_launch
                    </span>
                    Ongoing Projects Status
                  </h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Real-time execution status and completion progress per project
                  </p>
                </div>

                {/* Action badges and Collapse/Expand Button */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-surface-container border border-outline-variant text-on-surface-variant">
                    {projectStats.length} Projects Tracked
                  </span>

                  <button
                    type="button"
                    onClick={toggleProjectsCollapsed}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-sm ${
                      isProjectsCollapsed
                        ? "bg-primary-container/10 border-primary-fixed/40 text-primary-fixed hover:bg-primary-container/20"
                        : "bg-surface-container hover:bg-surface-container-high border-outline-variant text-on-surface-variant hover:text-on-surface"
                    }`}
                    title={isProjectsCollapsed ? "Expand ongoing projects grid" : "Collapse section to reduce page length"}
                  >
                    <span>{isProjectsCollapsed ? "Expand" : "Collapse"}</span>
                    <span
                      className={`material-symbols-outlined text-[16px] transition-transform duration-300 ${
                        isProjectsCollapsed ? "rotate-180" : ""
                      }`}
                    >
                      expand_less
                    </span>
                  </button>
                </div>
              </div>

              {/* Collapsed State: Compact Neat Summary Bar */}
              {isProjectsCollapsed ? (
                <div
                  onClick={toggleProjectsCollapsed}
                  className="mt-5 p-4 bg-surface-container/70 hover:bg-surface-container border border-outline-variant hover:border-primary-fixed/40 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer transition-all duration-200 group shadow-inner"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary-container/15 text-primary-fixed flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[19px]">unfold_more</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-on-surface group-hover:text-primary-fixed transition-colors">
                          {projectStats.length} Project Workspaces Collapsed
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-on-surface/5 text-on-surface-variant">
                          Click to expand
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">
                        Overview kept compact for a clean, concise page view.
                      </p>
                    </div>
                  </div>

                  {/* Summary Metric Pills */}
                  <div className="flex flex-wrap items-center gap-2.5 text-xs">
                    <span className="px-3 py-1 rounded-lg bg-on-surface/5 text-on-surface border border-outline-variant/60">
                      Avg Progress: <strong className="text-on-surface font-bold ml-1">{collapsedProjectSummary.avgCompletion}%</strong>
                    </span>
                    <span className="px-3 py-1 rounded-lg bg-[#E8A838]/10 text-[#E8A838] border border-[#E8A838]/20 font-medium">
                      {collapsedProjectSummary.totalOngoingTasks} tasks ongoing
                    </span>
                    {collapsedProjectSummary.totalOverdueTasks > 0 ? (
                      <span className="px-3 py-1 rounded-lg bg-error/10 text-error border border-error/20 font-semibold">
                        {collapsedProjectSummary.totalOverdueTasks} overdue
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-lg bg-[#33B26C]/10 text-[#33B26C] border border-[#33B26C]/20 font-medium">
                        0 overdue
                      </span>
                    )}
                    <span className="text-primary-fixed text-xs font-bold flex items-center gap-0.5 ml-1 group-hover:translate-x-1 transition-transform">
                      View all <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </span>
                  </div>
                </div>
              ) : (
                /* Expanded State: Full Project Cards Grid */
                <div className="mt-6">
                  {projectStats.length === 0 ? (
                    <div className="text-center py-12 bg-surface-container/50 rounded-xl border border-dashed border-outline-variant">
                      <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-2">
                        folder_off
                      </span>
                      <p className="text-sm text-on-surface font-medium">No projects available yet</p>
                      <p className="text-xs text-on-surface-variant mt-1">
                        Create a project to start tracking ongoing milestones and performance.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {projectStats.map((proj) => {
                        const isCompleted = proj.progressPct === 100 && proj.totalTasks > 0
                        const hasOverdue = proj.overdueTasks > 0

                        return (
                          <div
                            key={proj.id}
                            onClick={() => navigate(`/project_page/${proj.id}`)}
                            className="bg-surface-container hover:bg-surface-container border border-outline-variant hover:border-primary-fixed/40 rounded-xl p-5 flex flex-col justify-between gap-4 cursor-pointer transition-all duration-200 group shadow-sm hover:shadow-lg hover:shadow-black/40"
                          >
                            {/* Project Header */}
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant truncate">
                                  {proj.team_space_name}
                                </span>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    isCompleted
                                      ? "bg-[#33B26C]/15 text-[#33B26C]"
                                      : hasOverdue
                                      ? "bg-error/15 text-error"
                                      : "bg-[#E8A838]/15 text-[#E8A838]"
                                  }`}
                                >
                                  {isCompleted
                                    ? "Completed"
                                    : hasOverdue
                                    ? "Needs Attention"
                                    : proj.status || "In Progress"}
                                </span>
                              </div>

                              <h3 className="text-base font-bold text-on-surface group-hover:text-primary-fixed transition-colors mt-1.5 truncate">
                                {proj.name}
                              </h3>
                            </div>

                            {/* Progress Bar & Stats */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-on-surface-variant">
                                  {proj.doneTasks} of {proj.totalTasks} tasks done
                                </span>
                                <span className="font-bold text-on-surface">{proj.progressPct}%</span>
                              </div>

                              <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-700 ${
                                    isCompleted
                                      ? "bg-[#33B26C]"
                                      : hasOverdue
                                      ? "bg-gradient-to-r from-[#E8A838] to-red-500"
                                      : "bg-gradient-to-r from-[#818cf8] to-[#aff82a]"
                                  }`}
                                  style={{ width: `${proj.progressPct}%` }}
                                />
                              </div>
                            </div>

                            {/* Badges footer */}
                            <div className="flex items-center justify-between pt-2 border-t border-outline-variant/40 text-xs text-on-surface-variant">
                              <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#E8A838]" />
                                  {proj.inProgressTasks} ongoing
                                </span>
                                {hasOverdue && (
                                  <span className="flex items-center gap-1 text-error font-semibold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-error" />
                                    {proj.overdueTasks} overdue
                                  </span>
                                )}
                              </div>

                              <span className="material-symbols-outlined text-[16px] text-on-surface-variant group-hover:translate-x-1 group-hover:text-on-surface transition-all">
                                arrow_forward
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Status Explanation Footer ────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-on-surface-variant px-1">
              <p>
                Tasks and project statuses automatically refresh via Supabase Realtime and background synchronization.
              </p>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#33B26C]" /> Done
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#E8A838]" /> Ongoing / In Progress
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-error" /> Overdue
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#818cf8]" /> To Do
                </span>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  )
}
