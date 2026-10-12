import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"
import PieChart from "./components/PieChart"
import { useState, useEffect, useCallback, useMemo } from "react"
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
    // Ensures updates are captured even if Supabase Realtime is restricted or disconnected
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

  return (
    <div className="flex bg-[#0F1115] text-[#e0e5d0] min-h-screen">
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#2D3139]/50">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                    Ongoing Status & Reports
                  </h1>
                  {isRefreshing && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--primary-color)]/10 text-[var(--primary-color)] border border-[var(--primary-color)]/20 animate-pulse">
                      <span className="material-symbols-outlined text-[13px] animate-spin">refresh</span>
                      Syncing...
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#8c947b] mt-1">
                  Live real-time breakdown of ongoing projects, task lifecycles, and workspace progress.
                </p>
              </div>

              {/* Scope toggle & Action controls */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Scope selector */}
                <div className="bg-[#1C1F26] p-1 rounded-xl border border-[#2D3139] flex items-center">
                  <button
                    onClick={() => setScope("workspace")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      scope === "workspace"
                        ? "bg-[#aff82a] text-[#0F1115] shadow-sm font-bold"
                        : "text-[#8c947b] hover:text-white"
                    }`}
                  >
                    Entire Workspace
                  </button>
                  <button
                    onClick={() => setScope("personal")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      scope === "personal"
                        ? "bg-[#aff82a] text-[#0F1115] shadow-sm font-bold"
                        : "text-[#8c947b] hover:text-white"
                    }`}
                  >
                    Assigned to Me
                  </button>
                </div>

                {/* Project filter dropdown */}
                {allProjects.length > 0 && (
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="bg-[#1C1F26] border border-[#2D3139] text-xs font-medium text-white rounded-xl px-3 py-2 outline-none focus:border-[#aff82a]/50 cursor-pointer transition-all"
                  >
                    <option value="all">All Projects ({allProjects.length})</option>
                    {allProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}

                {/* Manual refresh button */}
                <button
                  onClick={() => fetchReportData(true)}
                  disabled={isRefreshing}
                  title="Force refresh now"
                  className="bg-[#1C1F26] hover:bg-[#252932] border border-[#2D3139] text-[#8c947b] hover:text-white p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center disabled:opacity-50"
                >
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      isRefreshing ? "animate-spin text-[#aff82a]" : ""
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
              <div className="glass-card rounded-2xl p-5 border border-[#2D3139] flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#8c947b] uppercase tracking-wider">
                    Total Tasks
                  </span>
                  <span className="p-2 rounded-xl bg-white/5 text-[#8c947b]">
                    <span className="material-symbols-outlined text-[18px]">checklist</span>
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-3xl font-extrabold text-white">{metrics.total}</div>
                  <div className="text-[11px] text-[#8c947b] mt-1">
                    {scope === "workspace" ? "Across organization" : "Assigned to your profile"}
                  </div>
                </div>
              </div>

              {/* In Progress / Ongoing */}
              <div className="glass-card rounded-2xl p-5 border border-[#2D3139] flex flex-col justify-between">
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
                  <div className="text-[11px] text-[#8c947b] mt-1">Currently in progress</div>
                </div>
              </div>

              {/* Completed Rate */}
              <div className="glass-card rounded-2xl p-5 border border-[#2D3139] flex flex-col justify-between">
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
                    <span className="text-xs font-semibold text-[#8c947b]">({metrics.completionRate}%)</span>
                  </div>
                  <div className="text-[11px] text-[#8c947b] mt-1">Successfully finished</div>
                </div>
              </div>

              {/* Overdue */}
              <div className={`glass-card rounded-2xl p-5 border flex flex-col justify-between ${
                metrics.overdue > 0 ? "border-red-500/30 bg-red-500/[0.03]" : "border-[#2D3139]"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                    Overdue
                  </span>
                  <span className="p-2 rounded-xl bg-red-500/10 text-red-400">
                    <span className="material-symbols-outlined text-[18px]">warning</span>
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-3xl font-extrabold text-red-400">{metrics.overdue}</div>
                  <div className="text-[11px] text-[#8c947b] mt-1">
                    {metrics.overdue > 0 ? "Requires urgent attention" : "No overdue items"}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Main Section: Task Status Distribution & Charts ─────────────── */}
            <div className="glass-card rounded-2xl p-6 md:p-8 border border-[#2D3139]">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-white">Task Status Overview</h2>
                  <p className="text-xs text-[#8c947b] mt-0.5">
                    Categorized distribution of active workloads and completion ratios
                  </p>
                </div>

                {lastUpdated && (
                  <div className="flex items-center gap-2 text-xs text-[#8c947b] bg-[#16191F] px-3 py-1.5 rounded-full border border-[#2D3139]/60">
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
                  <span className="material-symbols-outlined animate-spin text-4xl text-[#aff82a]">
                    progress_activity
                  </span>
                  <p className="text-xs text-[#8c947b]">Calculating latest workspace metrics...</p>
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
                          className="bg-[#16191F] rounded-xl p-4 border border-[#2D3139]/80 flex flex-col justify-between gap-3 hover:border-[#424934] transition-all"
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
                            <span className="text-xs text-[#8c947b]">
                              of {metrics.total} tasks
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="h-1.5 w-full bg-[#2D3139] rounded-full overflow-hidden">
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

            {/* ── Ongoing Projects Status Breakdown ────────────────────────────── */}
            <div className="glass-card rounded-2xl p-6 md:p-8 border border-[#2D3139]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-[#aff82a]">
                      rocket_launch
                    </span>
                    Ongoing Projects Status
                  </h2>
                  <p className="text-xs text-[#8c947b] mt-0.5">
                    Real-time execution status and completion progress per project
                  </p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#1C1F26] border border-[#2D3139] text-[#8c947b] self-start sm:self-auto">
                  {projectStats.length} Projects Tracked
                </span>
              </div>

              {projectStats.length === 0 ? (
                <div className="text-center py-12 bg-[#16191F]/50 rounded-xl border border-dashed border-[#2D3139]">
                  <span className="material-symbols-outlined text-4xl text-[#8c947b]/40 mb-2">
                    folder_off
                  </span>
                  <p className="text-sm text-white font-medium">No projects available yet</p>
                  <p className="text-xs text-[#8c947b] mt-1">
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
                        className="bg-[#16191F] hover:bg-[#1A1D24] border border-[#2D3139] hover:border-[#aff82a]/40 rounded-xl p-5 flex flex-col justify-between gap-4 cursor-pointer transition-all duration-200 group"
                      >
                        {/* Project Header */}
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8c947b] truncate">
                              {proj.team_space_name}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isCompleted
                                  ? "bg-[#33B26C]/15 text-[#33B26C]"
                                  : hasOverdue
                                  ? "bg-red-500/15 text-red-400"
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

                          <h3 className="text-base font-bold text-white group-hover:text-[#aff82a] transition-colors mt-1 truncate">
                            {proj.name}
                          </h3>
                        </div>

                        {/* Progress Bar & Stats */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#8c947b]">
                              {proj.doneTasks} of {proj.totalTasks} tasks done
                            </span>
                            <span className="font-bold text-white">{proj.progressPct}%</span>
                          </div>

                          <div className="h-2 w-full bg-[#2D3139] rounded-full overflow-hidden">
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
                        <div className="flex items-center justify-between pt-2 border-t border-[#2D3139]/40 text-xs text-[#8c947b]">
                          <div className="flex items-center gap-3">
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

                          <span className="material-symbols-outlined text-[16px] text-[#8c947b] group-hover:translate-x-1 group-hover:text-white transition-all">
                            arrow_forward
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Status Explanation Footer ────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#8c947b] px-1">
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
                  <span className="w-2 h-2 rounded-full bg-red-400" /> Overdue
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
