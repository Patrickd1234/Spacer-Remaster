import { Link, useNavigate } from "react-router-dom"
import { supabase } from "../supabase";
import { useState, useEffect } from "react";
import CreateProjectModal from "./CreateProjectModal";

export default function Sidebar({ searchQuery = "", userEmail = "", userData = null, onCollapsedChange }) {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [projects, setProjects] = useState([]);
    const [collapsed, setCollapsed] = useState(false);
    const [hovered, setHovered] = useState(false);
    const expanded = !collapsed || hovered;

    const handleToggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        setHovered(false);
        onCollapsedChange?.(next);
    };

    const handleMouseEnter = () => {
        if (collapsed) setHovered(true);
    };

    const handleMouseLeave = () => {
        setHovered(false);
    };

    // Clicking the sidebar body while hover-expanded pins it open
    const handleSidebarClick = () => {
        if (collapsed && hovered) {
            setCollapsed(false);
            setHovered(false);
            onCollapsedChange?.(false);
        }
    };
    const navigate = useNavigate();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        localStorage.removeItem("userId");
        localStorage.removeItem("userEmail");
        navigate("/login");
    };
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
        <>
            <aside
                className={`fixed left-0 top-0 h-full ${expanded ? "w-[260px]" : "w-[72px]"} border-r border-[#2D3139] bg-[#1C1F26] flex flex-col py-lg z-50 transition-all duration-300 ease-out overflow-hidden`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={handleSidebarClick}
            >
                <div className="px-lg mb-xl">
                    <div className={`flex items-center ${expanded ? "gap-sm mb-6" : "justify-center mb-sm"}`}>
                        {expanded ? (
                            <div className="flex items-center gap-sm w-full">
                                <div className="w-8 h-8 rounded bg-[#2D3139] flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[#aff82a] text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                </div>
                                <h1 className="text-[18px] font-semibold text-white flex-1">Circle Corp</h1>
                                <button type="button" onClick={(e) => { e.stopPropagation(); handleToggle(); }} className="text-[#8c947b] hover:text-white transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">switch_right</span>
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleToggle(); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2D3139] text-[#8c947b] hover:text-white transition-colors" title="Expand sidebar">
                                <span className="material-symbols-outlined text-sm">chevron_right</span>
                            </button>
                        )}
                    </div>

                    {expanded && (
                        <div className="flex items-center justify-between cursor-pointer mb-6 text-[#8c947b] hover:text-white transition-colors">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[20px]">computer</span>
                                <span className="text-[14px] font-medium">Switch Workspace</span>
                            </div>
                            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                        </div>
                    )}

                    {expanded && (
                        <div className="relative mb-2">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#8c947b] text-[18px]">search</span>
                            <input type="text" placeholder="Search..." className="w-full bg-[#0F1115] border border-[#2D3139] rounded-lg py-2 pl-10 pr-3 text-[13px] text-white focus:outline-none focus:border-[#424934]" />
                            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[#8c947b] text-[16px]">keyboard_command_key</span>
                        </div>
                    )}
                </div>

                <nav className="flex-1 overflow-y-auto px-4">
                    <div className="mb-8 space-y-1">
                        {matchesSearch("Home") && (
                            <Link to="/" className={`rounded-lg my-1 flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${window.location.pathname === '/' ? 'bg-[#aff82a] text-[#1C1F26]' : 'text-[#8c947b] hover:text-white hover:bg-[#2D3139]'}`}>
                                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>home</span>
                                {expanded && <span className="font-medium text-[14px]">Home</span>}
                            </Link>
                        )}
                        {matchesSearch("My Tasks") && (
                            <Link to="/tasks" className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-lg my-1 flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors">
                                <span className="material-symbols-outlined text-[20px]">task</span>
                                {expanded && <span className="font-medium text-[14px]">My Tasks</span>}
                            </Link>
                        )}
                        {matchesSearch("Inbox") && (
                            <div className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-lg my-1 flex items-center justify-between px-3 py-2 cursor-pointer transition-colors">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[20px]">inbox</span>
                                    {expanded && <span className="font-medium text-[14px]">Inbox</span>}
                                </div>
                                {expanded && <span className="bg-[#ffb4ab] text-[#93000a] text-[11px] font-bold px-2 py-0.5 rounded-full">12</span>}
                            </div>
                        )}
                        {matchesSearch("Documents") && (
                            <div className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-lg my-1 flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors">
                                <span className="material-symbols-outlined text-[20px]">description</span>
                                {expanded && <span className="font-medium text-[14px]">Documents</span>}
                            </div>
                        )}
                        {matchesSearch("Meetings") && (
                            <div className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-lg my-1 flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors">
                                <span className="material-symbols-outlined text-[20px]">phone_in_talk</span>
                                {expanded && <span className="font-medium text-[14px]">Meetings</span>}
                            </div>
                        )}
                    </div>

                    {/* PROJECTS SECTION */}
                    <div className="mb-8">
                        <div className="flex items-center justify-between mb-3 px-3">
                            {expanded && <p className="text-[12px] font-semibold text-[#8c947b] uppercase tracking-wider">Projects</p>}
                            {expanded && (
                                <div className="flex gap-1 text-[#8c947b]">
                                    <span className="material-symbols-outlined text-[16px] cursor-pointer hover:text-white">expand_more</span>
                                    <span className="material-symbols-outlined text-[16px] cursor-pointer hover:text-white" onClick={() => setShowCreateModal(true)}>add</span>
                                </div>
                            )}
                        </div>
                        <div className="space-y-1">
                            {projects.length > 0 ? projects.map((project) => (
                                <div key={project.id} className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-lg flex items-center justify-between px-3 py-2 cursor-pointer transition-colors group" onClick={() => console.log("Open project", project.id)}>
                                    {expanded && <Link to={`/project_page/${project.id}`} className="flex items-center gap-3 w-full">
                                        <span className="material-symbols-outlined text-[20px] text-green-500">book</span>
                                        <span className="font-medium text-[14px] whitespace-nowrap overflow-hidden text-ellipsis">{project.name}</span>
                                    </Link>}
                                    {expanded && <span className="material-symbols-outlined text-[18px] opacity-0 group-hover:opacity-100 transition-opacity">expand_more</span>}
                                </div>
                            )) : (
                                <div className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-lg flex items-center px-3 py-2 cursor-pointer transition-colors group">
                                    {expanded && <Link to={`/project_page/1`} className="flex items-center gap-3 w-full">
                                        <span className="material-symbols-outlined text-[20px] text-green-500">book</span>
                                        <span className="font-medium text-[14px] whitespace-nowrap overflow-hidden text-ellipsis">Project Launch</span>
                                    </Link>}
                                    {expanded && <span className="material-symbols-outlined text-[18px]">expand_more</span>}
                                </div>
                            )}

                            <div className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-lg flex items-center px-3 py-2 cursor-pointer transition-colors group">
                                {expanded && <div className="flex items-center gap-3 w-full">
                                    <span className="material-symbols-outlined text-[20px] text-pink-500">book</span>
                                    <span className="font-medium text-[14px] whitespace-nowrap overflow-hidden text-ellipsis">Marketing Campaign</span>
                                </div>}
                                {expanded && <span className="material-symbols-outlined text-[18px]">expand_more</span>}
                            </div>
                            <div className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-lg flex items-center px-3 py-2 cursor-pointer transition-colors group">
                                {expanded && <div className="flex items-center gap-3 w-full">
                                    <span className="material-symbols-outlined text-[20px] text-red-500">book</span>
                                    <span className="font-medium text-[14px] whitespace-nowrap overflow-hidden text-ellipsis">HR Operation</span>
                                </div>}
                                {expanded && <span className="material-symbols-outlined text-[18px]">expand_more</span>}
                            </div>
                            <div className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-lg flex items-center px-3 py-2 cursor-pointer transition-colors group">
                                {expanded && <div className="flex items-center gap-3 w-full">
                                    <span className="material-symbols-outlined text-[20px] text-blue-500">book</span>
                                    <span className="font-medium text-[14px] whitespace-nowrap overflow-hidden text-ellipsis">Website Redesign</span>
                                </div>}
                                {expanded && <span className="material-symbols-outlined text-[18px]">expand_more</span>}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1 mb-8">
                        <div className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-lg flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors">
                            <span className="material-symbols-outlined text-[20px]">school</span>
                            {expanded && <span className="font-medium text-[14px] whitespace-nowrap">Knowledge Base</span>}
                        </div>
                        <div className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-lg flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors">
                            <span className="material-symbols-outlined text-[20px]">bar_chart</span>
                            {expanded && <Link to="/reports" className="font-medium text-[14px] whitespace-nowrap w-full">Reports / Accountability</Link>}
                        </div>
                        <div className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-lg flex items-center justify-between px-3 py-2 cursor-pointer transition-colors">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-[20px]">how_to_reg</span>
                                {expanded && <span className="font-medium text-[14px] whitespace-nowrap">Approvals</span>}
                            </div>
                            {expanded && <span className="bg-[#ffb4ab] text-[#93000a] text-[11px] font-bold px-2 py-0.5 rounded-full">3</span>}
                        </div>
                        <div className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-lg flex items-center justify-between px-3 py-2 cursor-pointer transition-colors">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-[20px]">list_alt</span>
                                {expanded && <span className="font-medium text-[14px] whitespace-nowrap">Forms & Intakes</span>}
                            </div>
                            {expanded && <span className="bg-green-900/30 text-green-400 border border-green-800 text-[10px] font-bold px-1.5 py-0.5 rounded">Admin</span>}
                        </div>
                    </div>
                </nav>

                <div className="mt-auto px-4 border-t border-[#2D3139] pt-4 pb-2">
                    <div className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-lg flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors mb-4">
                        <span className="material-symbols-outlined text-[20px]">settings</span>
                        {expanded && <Link to="/settings" className="font-medium text-[14px] whitespace-nowrap w-full">Settings</Link>}
                    </div>

                    {expanded ? (
                        <div className="flex items-center justify-between px-3 cursor-pointer group">
                            <div className="flex items-center gap-3">
                                <img src="https://i.pravatar.cc/150?img=11" alt="User avatar" className="w-9 h-9 rounded-full object-cover border border-[#2D3139]" />
                                <div className="flex flex-col min-w-0">
                                    <span className="text-white text-[14px] font-medium leading-tight truncate">Demidele Emmanuel</span>
                                    <span className="text-[#8c947b] text-[12px] truncate">demide@gmail.com</span>
                                </div>
                            </div>
                            <span className="material-symbols-outlined text-[#8c947b] group-hover:text-white transition-colors">expand_more</span>
                        </div>
                    ) : (
                        <div className="flex justify-center px-3 cursor-pointer">
                            <img src="https://i.pravatar.cc/150?img=11" alt="User avatar" className="w-9 h-9 rounded-full object-cover border border-[#2D3139]" />
                        </div>
                    )}
                </div>
            </aside>

            {showCreateModal && (
                <CreateProjectModal
                    onClose={() => setShowCreateModal(false)}
                    onProjectCreated={(newProject) => setProjects((prev) => [...prev, newProject])}
                />
            )}
        </>
    )
}
