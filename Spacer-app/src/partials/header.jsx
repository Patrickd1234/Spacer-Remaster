import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";

function Header({ onSearch = () => {} }) {
    const [showNotifications, setShowNotifications] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    
    // Search dropdown state
    const [searchResults, setSearchResults] = useState({ tasks: [], projects: [], users: [] });
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const searchRef = useRef(null);

    // Handle outside click for search dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Debounced search effect
    useEffect(() => {
        const fetchResults = async () => {
            if (!searchQuery.trim()) {
                setSearchResults({ tasks: [], projects: [], users: [] });
                setIsSearching(false);
                return;
            }

            setIsSearching(true);
            const query = `%${searchQuery.trim()}%`;

            const [tasksRes, projectsRes, usersRes] = await Promise.all([
                supabase.from('tasks').select('id, title').ilike('title', query).limit(3),
                supabase.from('project_spaces').select('id, name').ilike('name', query).limit(3),
                supabase.from('users').select('id, name, email').ilike('name', query).limit(3)
            ]);

            setSearchResults({
                tasks: tasksRes.data || [],
                projects: projectsRes.data || [],
                users: usersRes.data || []
            });
            setIsSearching(false);
            setShowDropdown(true);
        };

        const timer = setTimeout(() => {
            fetchResults();
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const hasResults = searchResults.tasks.length > 0 || searchResults.projects.length > 0 || searchResults.users.length > 0;

    return (
        <>
            {/* HEADER */}
            <header className="h-16 flex items-center justify-between gap-3 px-3 sm:px-lg w-full border-b border-[#2D3139] bg-[#0F1115] sticky top-0 z-40">
                <div className="ml-auto flex items-center gap-2 sm:gap-3">
                    
                    {/* SEARCH BAR CONTAINER */}
                    <div className="relative w-full max-w-[220px] sm:max-w-[260px]" ref={searchRef}>
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#8c947b]">search</span>
                        <input
                            className="w-full bg-[#191c21] border border-[#2D3139] rounded-lg pl-10 pr-4 py-2 text-white font-body-sm focus:ring-1 focus:ring-[#aff82a] focus:outline-none transition-colors"
                            placeholder="Search workspace..."
                            type="text"
                            value={searchQuery}
                            onFocus={() => { if (searchQuery) setShowDropdown(true); }}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                onSearch(e.target.value); // Keep passing up if Home needs it
                            }}
                        />

                        {/* SEARCH DROPDOWN */}
                        {showDropdown && searchQuery.trim().length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-[#1C1F26] border border-[#2D3139] rounded-xl shadow-xl overflow-hidden z-50">
                                {isSearching ? (
                                    <div className="p-4 text-center text-sm text-[#8c947b] flex items-center justify-center gap-2">
                                        <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                        Searching...
                                    </div>
                                ) : !hasResults ? (
                                    <div className="p-4 text-center text-sm text-[#8c947b]">
                                        No results found for "{searchQuery}"
                                    </div>
                                ) : (
                                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                        {searchResults.projects.length > 0 && (
                                            <div className="py-2">
                                                <div className="px-3 py-1 text-xs font-bold text-[#8c947b] uppercase tracking-wider">Projects</div>
                                                {searchResults.projects.map(p => (
                                                    <div key={p.id} className="px-4 py-2 hover:bg-[#2D3139] cursor-pointer flex items-center gap-2 text-white text-sm transition-colors">
                                                        <span className="material-symbols-outlined text-[16px] text-pink-400">book</span>
                                                        <span className="truncate">{p.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {searchResults.tasks.length > 0 && (
                                            <div className="py-2 border-t border-[#2D3139]/50">
                                                <div className="px-3 py-1 text-xs font-bold text-[#8c947b] uppercase tracking-wider">Tasks</div>
                                                {searchResults.tasks.map(t => (
                                                    <div key={t.id} className="px-4 py-2 hover:bg-[#2D3139] cursor-pointer flex items-center gap-2 text-white text-sm transition-colors">
                                                        <span className="material-symbols-outlined text-[16px] text-lime-400">task_alt</span>
                                                        <span className="truncate">{t.title}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {searchResults.users.length > 0 && (
                                            <div className="py-2 border-t border-[#2D3139]/50">
                                                <div className="px-3 py-1 text-xs font-bold text-[#8c947b] uppercase tracking-wider">People</div>
                                                {searchResults.users.map(u => (
                                                    <div key={u.id} className="px-4 py-2 hover:bg-[#2D3139] cursor-pointer flex items-center gap-2 text-white text-sm transition-colors">
                                                        <div className="w-5 h-5 rounded-full bg-[#3d424d] flex items-center justify-center text-[10px] font-bold">
                                                            {u.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="flex flex-col truncate">
                                                            <span>{u.name}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="relative">
                        <button
                            className="p-2 text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-full transition-colors relative"
                            onClick={() => setShowNotifications((prev) => !prev)}
                            aria-label="Notifications"
                        >
                            <span className="material-symbols-outlined">notifications</span>
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-[#0F1115]"></span>
                        </button>
                        {showNotifications && (
                            <div className="absolute right-0 mt-2 w-72 rounded-xl border border-[#2D3139] bg-[#191c21] shadow-xl p-3 z-50">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-sm font-bold text-white">Notifications</p>
                                    <button className="text-xs text-[#aff82a] hover:underline" onClick={() => setShowNotifications(false)}>Close</button>
                                </div>
                                <div className="space-y-2">
                                    <div className="rounded-lg bg-[#252a33] p-3 border border-[#2D3139]">
                                        <p className="text-sm text-white">New project shared with you</p>
                                        <p className="text-xs text-[#8c947b] mt-1">5 min ago</p>
                                    </div>
                                    <div className="rounded-lg bg-[#252a33] p-3 border border-[#2D3139]">
                                        <p className="text-sm text-white">Weekly report is ready</p>
                                        <p className="text-xs text-[#8c947b] mt-1">1 hour ago</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>
        </>
    )
}

export default Header