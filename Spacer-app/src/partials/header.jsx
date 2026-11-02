import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, getSessionUser } from "../supabase";
import {
    fetchNotificationActivities,
    fetchOpenAssignedTasks,
    fetchPersonalNotifications,
    personalNotificationPath,
    loadReadState,
    isActivityRead,
    markActivityRead,
    markAllActivitiesRead,
} from "../notifications";
import { buildTaskReminders } from "../taskReminders";
import { usePreferences } from "../PreferencesContext";
import { useRole } from "../RoleContext";
import CreateMenu from "./CreateMenu";

// `breadcrumb` ({ icon, label }) is optional; pages that show their own keep it off.
// The header sits under the fixed sidebar, so `insetLeft` (px) moves the breadcrumb clear of it.
// Second line and icon for notifications the database wrote for this user
const PERSONAL_MESSAGES = {
    assignment: "A task was assigned to you.",
    project_added: "You can now see this project's tasks and files.",
    status_change: "A task you created changed status.",
    mention: "You were mentioned.",
}
const PERSONAL_ICONS = { assignment: "assignment_ind", project_added: "group_add", status_change: "sync", mention: "alternate_email" }

function Header({ onSearch = () => {}, breadcrumb = null, insetLeft = 0 }) {
    const { isSuperAdmin, isAdmin, roleLoading } = useRole();
    const navigate = useNavigate();
    const [showNotifications, setShowNotifications] = useState(() => {
        if (typeof window === "undefined") return false;
        const autoOpen = localStorage.getItem("autoOpenNotificationsAfterLogin");
        if (autoOpen === "true") {
            localStorage.removeItem("autoOpenNotificationsAfterLogin");
            return true;
        }
        return false;
    });
    const [searchQuery, setSearchQuery] = useState("");
    const [searchIndex, setSearchIndex] = useState(-1);
    const [activities, setActivities] = useState([]);
    const [reminders, setReminders] = useState([]);
    const [personal, setPersonal] = useState([]);
    const [notifyUserId, setNotifyUserId] = useState(null);
    const [readState, setReadState] = useState({ lastReadAt: null, ids: [] });
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    
    // Search dropdown state
    const [searchResults, setSearchResults] = useState({ tasks: [], projects: [], users: [] });
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const searchRef = useRef(null);
    const notificationRef = useRef(null);
    const { preferences } = usePreferences();

    const searchItems = [
        ...searchResults.projects.map((project) => ({
            type: "project",
            id: `project-${project.id}`,
            label: project.name,
            path: `/project_page/${project.id}`,
        })),
        ...searchResults.tasks.map((task) => ({
            type: "task",
            id: `task-${task.id}`,
            label: task.title,
            path: "/tasks",
        })),
        ...searchResults.users.map((user) => ({
            type: "user",
            id: `user-${user.id}`,
            label: user.name,
            path: null,
        })),
    ];

    const handleSearchResultSelect = (item) => {
        if (!item) return;

        setSearchQuery(item.label);
        setShowDropdown(false);
        setSearchIndex(-1);

        if (item.path) {
            navigate(item.path);
        }
    };

    const handleSearchInputKeyDown = (event) => {
        if (!showDropdown || searchItems.length === 0) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setSearchIndex((prevIndex) => Math.min(prevIndex + 1, searchItems.length - 1));
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            setSearchIndex((prevIndex) => Math.max(prevIndex - 1, 0));
            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();
            const selectedItem = searchItems[searchIndex >= 0 ? searchIndex : 0];
            handleSearchResultSelect(selectedItem);
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            setShowDropdown(false);
        }
    };

    const formatTime = (value) => {
        if (!value) return "Just now";
        const diffInSeconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
        if (diffInSeconds < 60) return "Just now";
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return `${Math.floor(diffInSeconds / 86400)}d ago`;
    };

    // Handle outside click for search and notification dropdowns
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
            if (notificationRef.current && !notificationRef.current.contains(event.target)) {
                setShowNotifications(false);
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
                setSearchIndex(-1);
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

    const formatActivityTitle = (activity) => {
        const actorName = activity.actor?.name || "Someone";
        const subject = activity.new_state?.title || activity.new_state?.project_name || "an item";

        switch (activity.action) {
            case "login":
                return `${actorName} just logged in`;
            case "signup":
                return `${actorName} just signed up`;
            case "created":
                return `${actorName} created ${subject}`;
            case "deleted":
                return `${actorName} removed ${subject}`;
            case "status_changed":
                return `${actorName} updated ${subject}`;
            case "commented":
                return `${actorName} commented on ${subject}`;
            case "invited":
                return `${actorName} added ${activity.new_state?.email || "someone"} to ${activity.new_state?.team_name || "a department"}`;
            default:
                return `${actorName} performed an action`;
        }
    };

    const inAppEnabled = preferences?.notifications?.inApp !== false;
    // Settings → "Task Assignments & Due Dates" also turns the daily/deadline reminders off
    const remindersEnabled = preferences?.notifications?.taskAssigned !== false;

    // Activity scoped to this user: members see what concerns them, admins also
    // see their departments, super admins see everything (see notifications.js).
    // Loads once the role is known, and refreshes whenever the panel opens.
    const hasLoadedNotificationsRef = useRef(false);
    useEffect(() => {
        if (!inAppEnabled || roleLoading) return;
        if (hasLoadedNotificationsRef.current && !showNotifications) return;
        hasLoadedNotificationsRef.current = true;

        let cancelled = false;
        const loadNotifications = async () => {
            const sessionUser = await getSessionUser();
            if (cancelled) return;
            if (!sessionUser) {
                setActivities([]);
                setReminders([]);
                setPersonal([]);
                return;
            }
            setNotificationsLoading(true);
            setNotifyUserId(sessionUser.id);
            setReadState(loadReadState(sessionUser.id));
            try {
                const [{ data, error }, assigned, mine] = await Promise.all([
                    fetchNotificationActivities({
                        userId: sessionUser.id,
                        email: sessionUser.email,
                        isSuperAdmin,
                        isAdmin,
                    }),
                    remindersEnabled ? fetchOpenAssignedTasks(sessionUser.id) : Promise.resolve({ data: [], error: null }),
                    fetchPersonalNotifications(sessionUser.id),
                ]);
                if (cancelled) return;
                if (mine.error) console.warn("Unable to load your notifications", mine.error);
                setPersonal(mine.data.map((row) => ({ ...row, timeLabel: formatTime(row.created_at) })));
                if (assigned.error) console.warn("Unable to load task reminders", assigned.error);
                setReminders(buildTaskReminders(assigned.data));
                if (error) {
                    console.warn("Unable to load activity notifications", error);
                    return;
                }
                // Relative times ("5m ago") are computed at load, not during render
                setActivities(data.map((activity) => ({ ...activity, timeLabel: formatTime(activity.created_at) })));
            } finally {
                if (!cancelled) setNotificationsLoading(false);
            }
        };
        loadNotifications();
        return () => { cancelled = true; };
    }, [showNotifications, inAppEnabled, remindersEnabled, roleLoading, isSuperAdmin, isAdmin]);

    // Today's task reminders, then what happened to you, then the activity feed
    const notifications = useMemo(() => [
        ...reminders.map((reminder) => ({
            id: reminder.id,
            title: reminder.title,
            message: reminder.message,
            time: "Today",
            type: reminder.kind === "due" ? "deadline" : "reminder",
            unread: !isActivityRead(readState, reminder),
        })),
        ...personal.map((row) => ({
            id: row.id,
            title: row.body,
            message: PERSONAL_MESSAGES[row.type] || "Open it to see the details.",
            time: row.timeLabel,
            type: "personal",
            icon: PERSONAL_ICONS[row.type],
            source: row,
            unread: !isActivityRead(readState, row),
        })),
        ...activities.map((activity) => ({
            id: activity.id,
            title: formatActivityTitle(activity),
            message: activity.new_state?.title || activity.new_state?.project_name || activity.new_state?.description || "Review the latest details in your workspace.",
            time: activity.timeLabel,
            type: activity.action === "deleted" ? "error" : activity.action === "created" ? "success" : "info",
            unread: !isActivityRead(readState, activity),
        })),
    ], [reminders, personal, activities, readState]);

    const handleMarkAllRead = () => {
        if (!notifyUserId) return;
        // Timestamps come in different formats, so compare them as dates
        const newest = [activities[0]?.created_at, reminders[0]?.created_at, personal[0]?.created_at]
            .filter(Boolean)
            .reduce((a, b) => (!a || new Date(b) > new Date(a) ? b : a), null);
        setReadState(markAllActivitiesRead(notifyUserId, newest));
    };

    const handleNotificationClick = async (notification) => {
        if (!notifyUserId) return;
        setReadState((prev) => markActivityRead(notifyUserId, prev, notification.id));
        if (!notification.source) return;
        const path = await personalNotificationPath(notification.source);
        if (path) {
            setShowNotifications(false);
            navigate(path);
        }
    };

    const hasResults = searchResults.tasks.length > 0 || searchResults.projects.length > 0 || searchResults.users.length > 0;
    const unreadCount = notifications.filter((notification) => notification.unread).length;

    return (
        <>
            {/* HEADER */}
            <header className="h-16 flex items-center justify-between gap-3 px-3 sm:px-lg w-full border-b border-line bg-canvas sticky top-0 z-40">
                {breadcrumb && (
                    <div className="flex items-center gap-2 text-sm text-white font-medium transition-[margin] duration-300" style={{ marginLeft: insetLeft }}>
                        <span className="material-symbols-outlined text-[18px] text-muted">{breadcrumb.icon}</span>
                        {breadcrumb.label}
                    </div>
                )}
                <div className="ml-auto flex items-center gap-2 sm:gap-3">
                    {!roleLoading && <CreateMenu isSuperAdmin={isSuperAdmin} />}

                    
                    {/* SEARCH BAR CONTAINER */}
                    <div className="relative w-full max-w-[220px] sm:max-w-[260px]" ref={searchRef}>
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted">search</span>
                        <input
                            className="w-full bg-raised border border-line rounded-lg pl-10 pr-4 py-2 text-white text-xs focus:ring-1 focus:ring-accent-ink focus:outline-none transition-colors"
                            placeholder="Search workspace..."
                            type="text"
                            value={searchQuery}
                            onFocus={() => { if (searchQuery) setShowDropdown(true); }}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setSearchIndex(-1);
                                onSearch(e.target.value); // Keep passing up if Home needs it
                            }}
                            onKeyDown={handleSearchInputKeyDown}
                        />

                        {/* SEARCH DROPDOWN */}
                        {showDropdown && searchQuery.trim().length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-surface1 border border-line rounded-xl shadow-xl overflow-hidden z-50">
                                {isSearching ? (
                                    <div className="p-4 text-center text-sm text-muted flex items-center justify-center gap-2">
                                        <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                        Searching...
                                    </div>
                                ) : !hasResults ? (
                                    <div className="p-4 text-center text-sm text-muted">
                                        No results found for "{searchQuery}"
                                    </div>
                                ) : (
                                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                        {searchResults.projects.length > 0 && (
                                            <div className="py-2">
                                                <div className="px-3 py-1 text-xs font-bold text-muted uppercase tracking-wider">Projects</div>
                                                {searchResults.projects.map((p) => {
                                                    const itemIndex = searchItems.findIndex((item) => item.id === `project-${p.id}`);
                                                    return (
                                                        <div
                                                            key={p.id}
                                                            className={`px-4 py-2 cursor-pointer flex items-center gap-2 text-sm transition-colors ${searchIndex === itemIndex ? "bg-line" : "hover:bg-line"}`}
                                                            onMouseEnter={() => setSearchIndex(itemIndex)}
                                                            onMouseDown={() => handleSearchResultSelect(searchItems[itemIndex])}
                                                        >
                                                            <span className="material-symbols-outlined text-[16px] text-pink-400">book</span>
                                                            <span className="truncate">{p.name}</span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                        {searchResults.tasks.length > 0 && (
                                            <div className="py-2 border-t border-line/50">
                                                <div className="px-3 py-1 text-xs font-bold text-muted uppercase tracking-wider">Tasks</div>
                                                {searchResults.tasks.map((t) => {
                                                    const itemIndex = searchItems.findIndex((item) => item.id === `task-${t.id}`);
                                                    return (
                                                        <div
                                                            key={t.id}
                                                            className={`px-4 py-2 cursor-pointer flex items-center gap-2 text-sm transition-colors ${searchIndex === itemIndex ? "bg-line" : "hover:bg-line"}`}
                                                            onMouseEnter={() => setSearchIndex(itemIndex)}
                                                            onMouseDown={() => handleSearchResultSelect(searchItems[itemIndex])}
                                                        >
                                                            <span className="material-symbols-outlined text-[16px] text-primary-accent">task_alt</span>
                                                            <span className="truncate">{t.title}</span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                        {searchResults.users.length > 0 && (
                                            <div className="py-2 border-t border-line/50">
                                                <div className="px-3 py-1 text-xs font-bold text-muted uppercase tracking-wider">People</div>
                                                {searchResults.users.map((u) => {
                                                    const itemIndex = searchItems.findIndex((item) => item.id === `user-${u.id}`);
                                                    return (
                                                        <div
                                                            key={u.id}
                                                            className={`px-4 py-2 cursor-pointer flex items-center gap-2 text-sm transition-colors ${searchIndex === itemIndex ? "bg-line" : "hover:bg-line"}`}
                                                            onMouseEnter={() => setSearchIndex(itemIndex)}
                                                            onMouseDown={() => handleSearchResultSelect(searchItems[itemIndex])}
                                                        >
                                                            <div className="w-5 h-5 rounded-full bg-line-strong flex items-center justify-center text-[10px] font-bold">
                                                                {u.name.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className="flex flex-col truncate">
                                                                <span>{u.name}</span>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="relative" ref={notificationRef}>
                        <button
                            className="p-2 text-muted hover:text-white hover:bg-line rounded-full transition-colors relative"
                            onClick={() => setShowNotifications((prev) => !prev)}
                            aria-label="Notifications"
                        >
                            <span className="material-symbols-outlined">notifications</span>
                            {unreadCount > 0 && (
                                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[10px] font-bold text-[#ffffff] flex items-center justify-center border border-canvas">
                                    {unreadCount > 9 ? "9+" : unreadCount}
                                </span>
                            )}
                        </button>
                        {showNotifications && (
                            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-line bg-raised shadow-xl p-3 z-50">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <p className="text-sm font-bold text-white">In-app notifications</p>
                                        <p className="text-xs text-muted">{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {unreadCount > 0 && (
                                            <button
                                                className="text-xs text-accent-ink hover:underline"
                                                onClick={handleMarkAllRead}
                                            >
                                                Mark all read
                                            </button>
                                        )}
                                        <button className="text-xs text-muted hover:underline" onClick={() => setShowNotifications(false)}>Close</button>
                                    </div>
                                </div>
                                {notificationsLoading ? (
                                    <div className="flex items-center justify-center py-6 text-sm text-muted">
                                        <span className="material-symbols-outlined animate-spin text-[16px] mr-2">progress_activity</span>
                                        Loading notifications...
                                    </div>
                                ) : notifications.length === 0 ? (
                                    <div className="rounded-lg bg-surface2 p-3 border border-line text-sm text-muted">
                                        No notifications right now.
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                                        {notifications.map((notification) => (
                                            <button
                                                type="button"
                                                key={notification.id}
                                                onClick={() => handleNotificationClick(notification)}
                                                aria-label={notification.unread ? `Mark as read: ${notification.title}` : notification.title}
                                                className={`w-full text-left rounded-lg p-3 border flex gap-2 transition-colors cursor-pointer ${notification.unread ? "bg-surface2 border-line hover:border-line-strong" : "bg-surface1 border-line/60 opacity-75 hover:opacity-100"}`}
                                            >
                                                <span className={`material-symbols-outlined mt-0.5 text-sm ${notification.type === "success" || notification.type === "personal" ? "text-accent-ink" : notification.type === "deadline" ? "text-amber-400" : "text-muted"}`}>
                                                    {notification.icon || (notification.type === "success" ? "check_circle" : notification.type === "deadline" ? "schedule" : notification.type === "reminder" ? "assignment" : "notifications_active")}
                                                </span>
                                                <div className="flex-1">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className="text-sm text-white">{notification.title}</p>
                                                        {notification.unread && <span className="w-2 h-2 rounded-full bg-[var(--primary-color)] mt-1.5 flex-shrink-0" />}
                                                    </div>
                                                    <p className="text-xs text-muted mt-1">{notification.message}</p>
                                                    <p className="text-[11px] text-muted mt-2">{notification.time}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </header>
        </>
    )
}

export default Header