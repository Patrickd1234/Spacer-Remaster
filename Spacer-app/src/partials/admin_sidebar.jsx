import { Link, useNavigate, useLocation } from "react-router-dom"
import { supabase, getSessionUser } from "../supabase";
import { useState, useEffect, useRef } from "react";
import CreateProjectModal from "./CreateProjectModal";

export default function AdminSidebar({ searchQuery = "", userEmail = "", userData = null, onCollapsedChange }) {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [projects, setProjects] = useState([]);
    const [collapsed, setCollapsed] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
    const [dbUser, setDbUser] = useState(null);
    const dropdownRef = useRef(null);
    const expanded = !collapsed || hovered;

    const navigate = useNavigate();
    const location = useLocation();

    const navClass = (path, exact = true) => {
        const active = exact
            ? location.pathname === path
            : location.pathname.startsWith(path);
        return `rounded-lg flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
            active
                ? "nav-item-active"
                : "text-[#8c947b] hover:text-white hover:bg-[#2D3139]"
        }`;
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setProfileDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

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

    const handleSidebarClick = () => {
        if (collapsed && hovered) {
            setCollapsed(false);
            setHovered(false);
            onCollapsedChange?.(false);
        }
    };

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
            if (!userId) return;

            // Fetch all memberships for this user with their roles
            const { data: memberData, error: memberError } = await supabase
                .from("memberships")
                .select("team_space_id, role")
                .eq("user_id", userId);

            if (memberError || !memberData || memberData.length === 0) {
                // No memberships found — show nothing, not everything
                setProjects([]);
                return;
            }

            // Pick the team space where this user is admin.
            // If they somehow belong to multiple departments, prioritise
            // the one where their role is explicitly "admin".
            const adminMembership =
                memberData.find(m => m.role === "admin") ||
                memberData.find(m => m.role === "super_admin") ||
                memberData[0];

            const teamSpaceId = adminMembership?.team_space_id;
            if (!teamSpaceId) { setProjects([]); return; }

            // Show only projects inside that one department
            const { data, error } = await supabase
                .from("project_spaces")
                .select("id, name")
                .eq("team_space_id", teamSpaceId);

            if (!error) setProjects(data || []);
        };
        fetchProjects();

        const fetchDbUser = async () => {
            const authData = { user: await getSessionUser() };
            if (authData?.user) {
                const { data } = await supabase.from("users").select("name, email").eq("id", authData.user.id).single();
                if (data) setDbUser(data);
            }
        };
        fetchDbUser();

    }, []);

    const displayName = dbUser?.name || userData?.full_name || localStorage.getItem("userEmail")?.split("@")[0] || userEmail?.split("@")[0] || "User";
    const displayEmail = dbUser?.email || userData?.email || localStorage.getItem("userEmail") || userEmail || "user@spacers.com";

    return (
        <>
            <aside
                className={`fixed left-0 top-0 h-full ${expanded ? "w-[260px]" : "w-[72px]"} border-r border-[#2D3139] bg-[#1C1F26] flex flex-col py-6 z-50 transition-all duration-300 ease-out overflow-hidden`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={handleSidebarClick}
            >
                {/* BRAND HEADER & TOGGLE */}
                <div className="px-5 mb-6">
                    <div className={`flex items-center ${expanded ? "justify-between mb-4" : "justify-center"}`}>
                        {expanded && (
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary-accent font-bold text-[20px]">token</span>
                                <h1 className="font-bold text-[14px] text-white tracking-wider uppercase truncate max-w-[150px]">Spacers</h1>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleToggle(); }}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2D3139] text-[#8c947b] hover:text-white transition-colors"
                            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        >
                            <span className="material-symbols-outlined text-[18px]">{collapsed ? "chevron_right" : "chevron_left"}</span>
                        </button>
                    </div>

                </div>

                {/* NAVIGATION ITEMS */}
                <nav className="flex-1 overflow-y-auto px-3 space-y-6 scrollbar-thin">
                    <div className="space-y-1">
                        {matchesSearch("Home") && (
                            <Link to="/" className={navClass("/")}>
                                <span className="material-symbols-outlined text-[20px]">home</span>
                                {expanded && <span className="font-medium text-[14px]">Home</span>}
                            </Link>
                        )}
                        {matchesSearch("Department") && (
                            <Link to="/department" className={navClass("/department")}>
                                <span className="material-symbols-outlined text-[20px]">groups</span>
                                {expanded && <span className="font-medium text-[14px]">Department</span>}
                            </Link>
                        )}
                        {matchesSearch("Calendar") && (
                            <Link to="/calendar" className={navClass("/calendar")}>
                                <span className="material-symbols-outlined text-[20px]">calendar_today</span>
                                {expanded && <span className="font-medium text-[14px]">Calendar</span>}
                            </Link>
                        )}
                        {matchesSearch("My Tasks") && (
                            <Link to="/tasks" className={navClass("/tasks")}>
                                <span className="material-symbols-outlined text-[20px]">task</span>
                                {expanded && <span className="font-medium text-[14px]">My Tasks</span>}
                            </Link>
                        )}
                        {matchesSearch("Reports") && (
                            <Link to="/reports" className={navClass("/reports")}>
                                <span className="material-symbols-outlined text-[20px]">bar_chart</span>
                                {expanded && <span className="font-medium text-[14px]">Reports</span>}
                            </Link>
                        )}
                    </div>

                    {/* PROJECTS SECTION */}
                    <div>
                        {expanded && (
                            <div className="flex items-center justify-between px-3 mb-2">
                                <span className="text-[11px] font-bold tracking-wider text-[#8c947b] uppercase">Projects</span>
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(true)}
                                    title="New project"
                                    aria-label="Create new project"
                                    className="material-symbols-outlined text-[#8c947b] text-[18px] leading-none rounded-md p-0.5 cursor-pointer hover:text-white hover:bg-white/5 transition-colors"
                                >
                                    add
                                </button>
                            </div>
                        )}
                        <div className="space-y-1">
                            {visibleProjects.length > 0 ? (
                                visibleProjects.map((project, idx) => {
                                    const colors = ["text-green-500", "text-pink-500", "text-red-500", "text-blue-500", "text-amber-500"];
                                    const iconColor = colors[idx % colors.length];
                                    const projectActive = location.pathname === `/project_page/${project.id}`;
                                    return (
                                        <Link
                                            key={project.id}
                                            to={`/project_page/${project.id}`}
                                            className={`rounded-lg flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors group ${
                                                projectActive
                                                    ? "nav-item-active"
                                                    : "text-[#8c947b] hover:text-white hover:bg-[#2D3139]"
                                            }`}
                                        >
                                            {expanded && (
                                                <>
                                                    <span className={`material-symbols-outlined text-[20px] ${projectActive ? "text-primary-accent" : iconColor}`}>book</span>
                                                    <span className="font-medium text-[14px] whitespace-nowrap overflow-hidden text-ellipsis flex-1">{project.name}</span>
                                                    <span className="material-symbols-outlined text-[18px] opacity-0 group-hover:opacity-100 transition-opacity">chevron_right</span>
                                                </>
                                            )}
                                        </Link>
                                    );
                                })
                            ) : (
                                expanded && (
                                    <div className="text-[#8c947b] text-[13px] px-3 py-1 italic">No projects found</div>
                                )
                            )}
                        </div>
                    </div>
                </nav>

                {/* USER PROFILE & LOGOUT FOOTER */}
                <div className="mt-auto px-4 border-t border-[#2D3139] pt-4 pb-2 relative" ref={dropdownRef}>
                    <div onClick={() => setProfileDropdownOpen(!profileDropdownOpen)} className="block w-full">
                        {expanded ? (
                            <div className="flex items-center justify-between px-3 py-1 cursor-pointer group rounded-lg hover:bg-[#2D3139] transition-colors">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-full bg-[#3d424d] text-white flex items-center justify-center font-bold text-[14px] border border-[#2D3139] shrink-0">
                                        {displayName.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-white text-[14px] font-medium leading-tight truncate">{displayName}</span>
                                        <span className="text-[#8c947b] text-[12px] truncate">{displayEmail}</span>
                                    </div>
                                </div>
                                <span className={`material-symbols-outlined text-[#8c947b] group-hover:text-white transition-all duration-200 ${profileDropdownOpen ? 'rotate-180' : ''}`}>expand_more</span>
                            </div>
                        ) : (
                            <div className="flex justify-center px-3 py-1 cursor-pointer rounded-lg hover:bg-[#2D3139] transition-colors" title={displayName}>
                                <div className="w-9 h-9 rounded-full bg-[#3d424d] text-white flex items-center justify-center font-bold text-[14px] border border-[#2D3139]">
                                    {displayName.charAt(0).toUpperCase()}
                                </div>
                            </div>
                        )}
                    </div>

                    {profileDropdownOpen && (
                        <div className={`absolute ${collapsed && !hovered ? 'left-16 w-48' : 'left-4 right-4'} bottom-full mb-2 bg-[#1C1F26] border border-[#2D3139] rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-200`}>
                            <Link to="/profile" onClick={() => setProfileDropdownOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[#8c947b] hover:text-white hover:bg-[#2D3139] transition-colors">
                                <span className="material-symbols-outlined text-[20px]">person</span>
                                <span className="text-sm font-medium">Your Profile</span>
                            </Link>
                            <Link to="/settings" onClick={() => setProfileDropdownOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[#8c947b] hover:text-white hover:bg-[#2D3139] transition-colors">
                                <span className="material-symbols-outlined text-[20px]">settings</span>
                                <span className="text-sm font-medium">Settings</span>
                            </Link>
                            <div className="h-[1px] bg-[#2D3139] mx-2"></div>
                            <button onClick={() => { setProfileDropdownOpen(false); handleLogout(); }} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-950/20 transition-colors">
                                <span className="material-symbols-outlined text-[20px]">logout</span>
                                <span className="text-sm font-medium">Log out</span>
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {showCreateModal && (
                <CreateProjectModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={(newProject) => setProjects((prev) => [...prev, newProject])}
                />
            )}
        </>
    )
}
