import { Link } from "react-router-dom"
import { supabase } from "../supabase";
import { useState, useEffect } from "react";
import CreateProjectModal from "./CreateProjectModal";

export default function Sidebar({ collapsed, onToggle, hovered, onHoverChange, searchQuery = "", userEmail = "", userData = null }) {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [projects, setProjects] = useState([]);
    const [showProfilePanel, setShowProfilePanel] = useState(false);
    const expanded = !collapsed || hovered;
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesSearch = (value) => !normalizedQuery || value.toLowerCase().includes(normalizedQuery);
    const visibleProjects = projects.filter((project) => matchesSearch(project.name || ""));
    useEffect(() => {
        const fetchProjects = async () => {
            const userId = localStorage.getItem("userId");
            if (!userId) {
                const { data, error } = await supabase.from("project_spaces").select("*");
                if (!error && data) setProjects(data);
                return;
            }

            // Get team spaces the user is a member of
            const { data: memberData, error: memberError } = await supabase
                .from("memberships")
                .select("team_space_id")
                .eq("user_id", userId);

            if (memberError || !memberData || memberData.length === 0) {
                // Fallback if membership table/rows aren't found or RLS handles access directly
                const { data, error } = await supabase.from("project_spaces").select("*");
                if (error) console.log(error);
                else setProjects(data || []);
            } else {
                const teamIds = memberData.map((m) => m.team_space_id);
                const { data, error } = await supabase
                    .from("project_spaces")
                    .select("*")
                    .in("team_space_id", teamIds);
                if (error) console.log(error);
                else setProjects(data || []);
            }
        };
        fetchProjects();
    }, []);

    const addProject = async () => {
        const { data, error } = await supabase.from("project_spaces").insert({
            name: window.prompt("Enter new project name:")
        })
        if (error) {
            console.log(error)
        } else {
            console.log(data)
        }
    }

    return (
        <aside
            className={`fixed left-0 top-0 h-full ${expanded ? "w-[260px]" : "w-[72px]"} border-r border-outline-variant bg-surface-container-lowest flex flex-col py-lg z-50 transition-all duration-300 ease-out`}
            onMouseEnter={() => {
                if (collapsed) onHoverChange(true)
            }}
            onMouseLeave={() => {
                if (collapsed) onHoverChange(false)
            }}
        >
            <div className="px-lg mb-xl">
                <div className={`flex items-center ${expanded ? "gap-sm mb-xs" : "justify-center mb-sm"}`}>
                    <button
                        type="button"
                        onClick={onToggle}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:bg-surface-variant transition-colors"
                        title={expanded ? "Collapse sidebar" : "Expand sidebar"}
                    >
                        <span className="material-symbols-outlined text-sm">{expanded ? "chevron_left" : "chevron_right"}</span>
                    </button>
                    {expanded && (
                        <div className="flex items-center gap-sm">
                            <div className="w-8 h-8 rounded bg-primary-container flex items-center justify-center">
                                <span className="material-symbols-outlined text-on-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>circle</span>
                            </div>
                            <h1 className="font-headline-lg text-headline-lg font-bold text-on-background">Spacers</h1>
                        </div>
                    )}
                </div>
                {expanded && (
                    <div className="flex items-center justify-between group cursor-pointer">
                        <p className="font-label-md text-label-md text-on-surface-variant">Switch Workspace</p>
                        <span className="material-symbols-outlined text-on-surface-variant text-sm">unfold_more</span>
                    </div>
                )}
            </div>
            <button className={`mx-lg mb-lg py-sm px-md bg-primary-container text-on-primary-container font-semibold rounded-lg flex items-center justify-center gap-sm hover:scale-[0.98] transition-transform ${expanded ? "" : "px-0"}`} onClick={() => setShowCreateModal(true)} title="New Project">
                <span className="material-symbols-outlined">add</span>
                {expanded && <span className="font-label-md">New Project</span>}
            </button>
            <nav className="flex-1 overflow-y-auto px-2">
                <div className="mb-md">
                    {matchesSearch("Home") && (
                        <Link to="/" className="relative bg-primary-container text-on-primary-container font-semibold rounded-lg mx-2 my-1 flex items-center gap-md px-md py-sm">
                            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>home</span>
                            {expanded && <span className="font-body-md">Home</span>}
                        </Link>
                    )}
                    {matchesSearch("Messages") && (
                        <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer group">
                            <span className="material-symbols-outlined">chat</span>
                            {expanded && <span className="font-body-md">Messages</span>}
                        </div>
                    )}
                    {matchesSearch("Department") && (
                        <Link to="/department" className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer">
                            <span className="material-symbols-outlined">groups</span>
                            {expanded && <span className="font-body-md">Department</span>}
                        </Link>
                    )}
                    {matchesSearch("Calendar") && (
                        <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer">
                            <span className="material-symbols-outlined">calendar_today</span>
                            {expanded && <span className="font-body-md">Calendar</span>}
                        </div>
                    )}
                </div>
                {/* PROJECTS SECTION */}
                <div className="mt-lg px-2">
                    <p className="px-md font-label-md text-on-surface-variant uppercase tracking-wider mb-sm">Projects</p>
                    <div className="space-y-0.5">
                        {projects.map((project) => (
                            <Link
                                to={`/project_page/${project.id}`}
                                key={project.id}
                                className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 transition-colors flex items-center justify-between px-md py-sm cursor-pointer group" onClick={() => console.log("Open project", project.id)}><Link to="/project_page/:project_id">
                                    <div className="flex items-center gap-md">
                                        <span className="font-body-md">{project.name}</span>
                                    </div>
                                </Link>
                                <span className="material-symbols-outlined text-on-surface-variant text-sm group-hover:text-on-surface">chevron_right</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </nav>

            <div className="mt-auto px-2 border-t border-outline-variant pt-md">
                <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer">
                    <span className="material-symbols-outlined">menu_book</span>
                    <span className="font-label-md">Knowledge Base</span>
                </div>
                <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer">
                    <span className="material-symbols-outlined">bar_chart</span>
                    <Link to="/reports"><span className="font-label-md">Reports</span></Link>
                </div>
                <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer">
                    <span className="material-symbols-outlined">settings</span>
                    <Link to="/settings"><span className="font-label-md">Settings</span></Link>
                </div>
            </div>

            {showCreateModal && (
                <CreateProjectModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={(newProject) => {
                        setProjects(prev => [...prev, newProject]);
                    }}
                />
            )}
        </aside>
    )
}
