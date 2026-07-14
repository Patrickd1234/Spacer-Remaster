import { Link, useLocation } from "react-router-dom"
import { supabase } from "../supabase"
import { useState, useEffect } from "react"

export default function Sidebar({ onProjectSelect }) {
  const [projects, setProjects] = useState([])
  const [activeProjectId, setActiveProjectId] = useState(null)
  const location = useLocation()

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    const { data, error } = await supabase.from("project_spaces").select("*")
    if (error) console.error(error)
    else setProjects(data || [])
  }

  const addProject = async () => {
    const name = window.prompt("Enter new project name:")
    if (!name) return
    const { error } = await supabase.from("project_spaces").insert({ name })
    if (error) console.error(error)
    else fetchProjects()
  }

  const handleProjectClick = (project) => {
    setActiveProjectId(project.id)
    onProjectSelect?.(project)
  }

  // Helper: is this path currently active?
  const isActive = (path) => location.pathname === path

  return (
    <aside className="fixed left-0 top-0 h-full w-sidebar-width border-r border-outline-variant bg-surface-container-lowest flex flex-col py-lg z-50">

      {/* Brand */}
      <div className="px-lg mb-xl">
        <div className="flex items-center gap-sm mb-xs">
          <div className="w-8 h-8 rounded bg-primary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>circle</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-background">Spacers</h1>
        </div>
        <div className="flex items-center justify-between group cursor-pointer">
          <p className="font-label-md text-label-md text-on-surface-variant">Switch Workspace</p>
          <span className="material-symbols-outlined text-on-surface-variant text-sm">unfold_more</span>
        </div>
      </div>

      {/* New Project */}
      <button
        className="mx-lg mb-lg py-sm px-md bg-primary-container text-on-primary-container font-semibold rounded-lg flex items-center justify-center gap-sm hover:scale-[0.98] transition-transform"
        onClick={addProject}
      >
        <span className="material-symbols-outlined">add</span>
        <span className="font-label-md">New Project</span>
      </button>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-2">
        <div className="mb-md">

          {/* Home */}
          <Link
            to="/"
            className={`rounded-lg mx-2 my-1 flex items-center gap-md px-md py-sm font-semibold transition-colors
              ${isActive("/")
                ? "bg-primary-container text-on-primary-container"
                : "text-on-surface-variant hover:bg-surface-variant hover:text-on-surface"}`}
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>home</span>
            <span className="font-body-md">Home</span>
          </Link>

          {/* Messages */}
          <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer">
            <span className="material-symbols-outlined">chat</span>
            <span className="font-body-md">Messages</span>
          </div>

          {/* Department */}
          <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer">
            <span className="material-symbols-outlined">groups</span>
            <span className="font-body-md">Department</span>
          </div>

          {/* Calendar */}
          <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer">
            <span className="material-symbols-outlined">calendar_today</span>
            <span className="font-body-md">Calendar</span>
          </div>
        </div>

        {/* Projects section */}
        <div className="mt-lg px-2">
          <p className="px-md font-label-md text-on-surface-variant uppercase tracking-wider mb-sm">Projects</p>
          <div className="space-y-0.5">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => handleProjectClick(project)}
                className={`rounded-lg mx-2 transition-colors flex items-center justify-between px-md py-sm cursor-pointer group
                  ${activeProjectId === project.id
                    ? "bg-primary-container text-on-primary-container"
                    : "text-on-surface-variant hover:bg-surface-variant hover:text-on-surface"}`}
              >
                <div className="flex items-center gap-md">
                  <span className="material-symbols-outlined text-base">folder</span>
                  <span className="font-body-md">{project.name}</span>
                </div>
                <span className="material-symbols-outlined text-sm group-hover:text-on-surface">chevron_right</span>
              </div>
            ))}
          </div>
        </div>
      </nav>

      {/* Footer nav */}
      <div className="mt-auto px-2 border-t border-outline-variant pt-md">

        {/* Knowledge Base */}
        <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer">
          <span className="material-symbols-outlined">menu_book</span>
          <span className="font-label-md">Knowledge Base</span>
        </div>

        {/* Reports — NOW a real link to /reports */}
        <Link
          to="/reports"
          className={`rounded-lg mx-2 my-1 flex items-center gap-md px-md py-sm transition-colors
            ${isActive("/reports")
              ? "bg-primary-container text-on-primary-container font-semibold"
              : "text-on-surface-variant hover:bg-surface-variant hover:text-on-surface"}`}
        >
          <span className="material-symbols-outlined">bar_chart</span>
          <span className="font-label-md">Reports</span>
        </Link>

        {/* Settings */}
        <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer">
          <span className="material-symbols-outlined">settings</span>
          <span className="font-label-md">Settings</span>
        </div>

      </div>
    </aside>
  )
}
