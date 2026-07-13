import Sidebar from "./partials/sidebar"
import Header from "./partials/header"
import PieChart from "./components/PieChart"
import { useState, useEffect } from "react"
import { supabase } from "./supabase"

const STATUS_COLORS = {
  todo:        "#6750A4",
  in_progress: "#E8A838",
  done:        "#33B26C",
  overdue:     "#B3261E",
}

function Reports() {
  const [metrics, setMetrics] = useState({ todo: 0, in_progress: 0, done: 0, overdue: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMetrics = async () => {
      const userId = localStorage.getItem("userId")
      if (!userId) { setLoading(false); return }

      const { data, error } = await supabase
        .from("tasks")
        .select("status")
        .eq("assignee_id", userId)

      if (!error && data) {
        const counts = { todo: 0, in_progress: 0, done: 0, overdue: 0 }
        data.forEach(({ status }) => {
          if (counts[status] !== undefined) counts[status]++
        })
        setMetrics(counts)
      }
      setLoading(false)
    }
    fetchMetrics()
  }, [])

  const pieSlices = [
    { label: "To do",       value: metrics.todo,        color: STATUS_COLORS.todo },
    { label: "In progress", value: metrics.in_progress,  color: STATUS_COLORS.in_progress },
    { label: "Done",        value: metrics.done,         color: STATUS_COLORS.done },
    { label: "Overdue",     value: metrics.overdue,      color: STATUS_COLORS.overdue },
  ]

  const total = Object.values(metrics).reduce((s, v) => s + v, 0)

  return (
    <>
      <Sidebar />
      <Header />
      <main className="ml-[260px] flex-1 flex flex-col min-h-screen">
        <div className="p-lg space-y-lg">

          {/* Page title */}
          <section>
            <h1 className="text-headline-xl font-bold text-on-surface">Reports</h1>
            <p className="text-on-surface-variant font-body-md mt-1">
              A visual breakdown of task progress across your workspace.
            </p>
          </section>

          {/* Pie chart card */}
          <section className="glass-card rounded-2xl p-lg">
            <h2 className="font-semibold text-on-surface mb-lg">Task Status Overview</h2>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <span className="material-symbols-outlined animate-spin text-4xl text-primary-fixed">
                  progress_activity
                </span>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row items-center gap-10">

                {/* Donut chart */}
                <div className="shrink-0">
                  <PieChart slices={pieSlices} size={220} />
                </div>

                {/* Stat breakdown */}
                <div className="grid grid-cols-2 gap-4 flex-1 w-full">
                  {pieSlices.map(({ label, value, color }) => {
                    const pct = total === 0 ? 0 : Math.round((value / total) * 100)
                    return (
                      <div
                        key={label}
                        className="glass-card rounded-xl p-md flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-on-surface-variant text-sm font-medium">{label}</p>
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: color + "22", color }}
                          >
                            {pct}%
                          </span>
                        </div>
                        <p className="text-3xl font-bold" style={{ color }}>{value}</p>
                        {/* Mini progress bar */}
                        <div className="h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Summary note */}
          <p className="text-xs text-on-surface-variant">
            Showing tasks assigned to you. More report types — by project, by team member, and by date range — coming soon.
          </p>

        </div>
      </main>
    </>
  )
}

export default Reports
