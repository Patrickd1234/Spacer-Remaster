import { useEffect, useId, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { searchWorkspace } from "./paletteData"
import { matchCommands, taskPath, flattenSections } from "./paletteSearch"
import { matchesShortcut, SHORTCUT_GROUPS } from "../shortcuts"
import { useTaskKeyPrefixes } from "../tasks/taskKeyPrefixes"
import { TaskKeyText } from "../tasks/TaskKeyBar"
import { requestCreate, OPEN_PALETTE_EVENT } from "../appEvents"
import PersonPhoto from "../avatars/PersonPhoto"
import { TASK_STATUSES } from "../taskStatuses"

// Search and jump to anything, like Ctrl+K in ClickUp, Jira or Linear: tasks
// (by title, words in the description, or key), projects, people, pages and
// "create" actions. Opens with Ctrl+K (Cmd+K on a Mac), "/" or the header's
// search button; "?" shows every shortcut; "C" creates a task from anywhere.

const SEARCH_DELAY_MS = 150
const STATUS_NAMES = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, s.boardName]))

const PAGES = [
    { id: "page-home", icon: "home", label: "Home", keywords: "my space organization overview dashboard", path: "/" },
    { id: "page-tasks", icon: "checklist", label: "All Tasks", keywords: "my work assigned", path: "/tasks" },
    { id: "page-calendar", icon: "calendar_today", label: "Calendar", keywords: "schedule deadlines", path: "/calendar" },
    { id: "page-reports", icon: "bar_chart", label: "Reports", keywords: "analytics scorecard charts", path: "/reports" },
    { id: "page-general", icon: "corporate_fare", label: "General overview", keywords: "company", path: "/general" },
    { id: "page-announcements", icon: "campaign", label: "Announcements", keywords: "news", path: "/general/announcements" },
    { id: "page-company-calendar", icon: "event", label: "Company Calendar", keywords: "holidays meetings", path: "/general/calendar" },
    { id: "page-directory", icon: "groups", label: "Directory", keywords: "people team staff", path: "/general/directory" },
    { id: "page-departments", icon: "domain", label: "Departments", keywords: "teams members invite", path: "/department" },
    { id: "page-profile", icon: "account_circle", label: "Your profile", keywords: "photo me", path: "/profile" },
    { id: "page-settings", icon: "settings", label: "Settings", keywords: "preferences theme two-factor password", path: "/settings" },
]

function Kbd({ children }) {
    return <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-md border border-line bg-raised text-[11px] font-semibold text-soft font-sans">{children}</kbd>
}

function ShortcutHelp({ onClose }) {
    return (
        <div className="p-5 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-[15px] font-semibold text-white">Keyboard shortcuts</h2>
                <button type="button" onClick={onClose} aria-label="Close" className="material-symbols-outlined text-[20px] text-muted hover:text-white cursor-pointer">close</button>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
                {SHORTCUT_GROUPS.map((group) => (
                    <section key={group.title}>
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">{group.title}</h3>
                        <ul className="space-y-2">
                            {group.items.map((item) => (
                                <li key={`${group.title}-${item.label}-${item.keys.join("")}`} className="flex items-center justify-between gap-3 text-[13px] text-soft">
                                    {item.label}
                                    <span className="flex items-center gap-1 shrink-0">{item.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    )
}

// The open palette's search, with stale answers dropped
function useSearch(query, prefixes) {
    const [state, setState] = useState({ query: "", results: null, error: null })
    const latest = useRef(0)
    useEffect(() => {
        const text = query.trim()
        if (!text) return undefined
        const ticket = ++latest.current
        const timer = setTimeout(() => {
            searchWorkspace(text, prefixes).then((results) => {
                if (ticket === latest.current) setState({ query: text, results, error: results.error })
            })
        }, SEARCH_DELAY_MS)
        return () => clearTimeout(timer)
    }, [query, prefixes])
    const text = query.trim()
    return { results: text && state.query === text ? state.results : null, isLoading: Boolean(text) && state.query !== text, error: state.query === text ? state.error : null }
}

function ResultIcon({ item }) {
    if (item.personId) {
        return (
            <span className="w-6 h-6 rounded-full overflow-hidden bg-surface2 border border-line flex items-center justify-center text-[10px] font-bold text-muted uppercase shrink-0">
                <PersonPhoto userId={item.personId} fallback={(item.label || "?").charAt(0)} />
            </span>
        )
    }
    return <span className="material-symbols-outlined text-[18px] text-muted w-6 text-center shrink-0" aria-hidden="true">{item.icon}</span>
}

export default function CommandPalette({ canCreateProject = false }) {
    const navigate = useNavigate()
    const prefixes = useTaskKeyPrefixes()
    const [mode, setMode] = useState(null) // null | "search" | "help"
    const [query, setQuery] = useState("")
    const [activeIndex, setActiveIndex] = useState(0)
    const inputRef = useRef(null)
    const listId = useId()
    const { results, isLoading, error } = useSearch(mode === "search" ? query : "", prefixes)

    const close = () => setMode(null)

    // Shortcuts that work on every page with a header
    useEffect(() => {
        const onKey = (e) => {
            const openAs = (next) => { e.preventDefault(); setMode(next); setQuery(""); setActiveIndex(0) }
            if (matchesShortcut(e, "mod+k")) { openAs(mode ? null : "search"); return }
            if (mode || e.defaultPrevented) return
            if (matchesShortcut(e, "/")) openAs("search")
            else if (matchesShortcut(e, "?")) openAs("help")
            else if (matchesShortcut(e, "c") && !document.querySelector("[role='dialog']")) { e.preventDefault(); requestCreate("task") }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [mode])
    // The header's search button
    useEffect(() => {
        const onOpen = () => { setMode("search"); setQuery(""); setActiveIndex(0) }
        window.addEventListener(OPEN_PALETTE_EVENT, onOpen)
        return () => window.removeEventListener(OPEN_PALETTE_EVENT, onOpen)
    }, [])

    if (!mode) return null

    const go = (path) => { close(); navigate(path) }
    const actions = [
        { id: "act-task", icon: "add_task", label: "Create a task", keywords: "new add", run: () => { close(); requestCreate("task") } },
        ...(canCreateProject ? [{ id: "act-project", icon: "create_new_folder", label: "Create a project", keywords: "new add", run: () => { close(); requestCreate("project") } }] : []),
        { id: "act-meeting", icon: "event", label: "Schedule a meeting", keywords: "new add call", run: () => { close(); requestCreate("meeting") } },
        { id: "act-shortcuts", icon: "keyboard", label: "Keyboard shortcuts", keywords: "help keys", run: () => setMode("help") },
    ]
    const pages = PAGES.map((p) => ({ ...p, run: () => go(p.path) }))
    const sections = query.trim()
        ? [
            { key: "tasks", title: "Tasks", items: (results?.tasks || []).map((t) => ({
                id: `task-${t.id}`, icon: "task_alt", label: t.title, task: t,
                meta: [t.project?.name, STATUS_NAMES[t.status] || t.status].filter(Boolean).join(" · "),
                run: () => go(taskPath(t)),
            })) },
            { key: "projects", title: "Projects", items: (results?.projects || []).map((p) => ({ id: `project-${p.id}`, icon: "folder", label: p.name, run: () => go(`/project_page/${p.id}`) })) },
            { key: "people", title: "People", items: (results?.people || []).map((u) => ({ id: `person-${u.id}`, personId: u.id, label: u.name || "Someone", run: () => go(`/general/directory?person=${u.id}`) })) },
            { key: "pages", title: "Pages", items: matchCommands(pages, query) },
            { key: "actions", title: "Actions", items: matchCommands(actions, query) },
        ].filter((s) => s.items.length > 0)
        : [
            { key: "actions", title: "Actions", items: actions },
            { key: "pages", title: "Jump to", items: pages },
        ]
    const flat = flattenSections(sections)
    // Where each section's items start in `flat`, for the arrow keys
    const starts = sections.reduce((acc, section, i) => [...acc, i === 0 ? 0 : acc[i - 1] + sections[i - 1].items.length], [])
    const active = Math.min(activeIndex, Math.max(flat.length - 1, 0))
    const optionId = (i) => `${listId}-${i}`

    const onInputKey = (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => (flat.length ? (Math.min(i, flat.length - 1) + 1) % flat.length : 0)) }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => (flat.length ? (Math.min(i, flat.length - 1) - 1 + flat.length) % flat.length : 0)) }
        else if (e.key === "Enter") { e.preventDefault(); flat[active]?.run() }
        else if (e.key === "Escape") { e.preventDefault(); close() }
    }

    return (
        <div className="fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[10vh]" onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); close() } }}>
            <div className="absolute inset-0 bg-canvas/70 backdrop-blur-[2px]" onClick={close} aria-hidden="true" />
            <div role="dialog" aria-modal="true" aria-label={mode === "help" ? "Keyboard shortcuts" : "Search and jump"} className="relative w-full max-w-[640px] rounded-2xl border border-line-strong bg-panel shadow-2xl overflow-hidden animate-[task-panel-in_140ms_ease-out]">
                {mode === "help" ? <ShortcutHelp onClose={close} /> : (
                    <>
                        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-line">
                            <span className="material-symbols-outlined text-[20px] text-muted" aria-hidden="true">search</span>
                            <input
                                ref={inputRef}
                                autoFocus
                                value={query}
                                maxLength={100}
                                onChange={(e) => { setQuery(e.target.value); setActiveIndex(0) }}
                                onKeyDown={onInputKey}
                                placeholder="Search tasks, projects, people, or type DEV-12"
                                role="combobox"
                                aria-expanded="true"
                                aria-controls={listId}
                                aria-activedescendant={flat.length ? optionId(active) : undefined}
                                aria-label="Search"
                                className="flex-1 min-w-0 bg-transparent border-0 p-0 text-[15px] text-white placeholder-muted focus:outline-none focus:ring-0"
                            />
                            {isLoading && <span className="w-4 h-4 rounded-full border-2 border-line border-t-accent-ink animate-spin" aria-label="Searching" />}
                            <Kbd>Esc</Kbd>
                        </div>
                        <div id={listId} role="listbox" aria-label="Results" className="max-h-[min(60vh,28rem)] overflow-y-auto py-2">
                            {sections.map((section, sectionIndex) => (
                                <div key={section.key} role="group" aria-label={section.title} className="pb-1">
                                    <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{section.title}</p>
                                    {section.items.map((item, itemIndex) => {
                                        const i = starts[sectionIndex] + itemIndex
                                        const isActive = i === active
                                        return (
                                            <div
                                                key={item.id}
                                                id={optionId(i)}
                                                role="option"
                                                aria-selected={isActive}
                                                onMouseMove={() => { if (!isActive) setActiveIndex(i) }}
                                                onClick={item.run}
                                                className={`mx-2 flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer ${isActive ? "bg-surface2" : ""}`}
                                            >
                                                <ResultIcon item={item} />
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-[13px] text-white truncate">{item.label}</span>
                                                    {item.meta && <span className="block text-[11px] text-muted truncate">{item.meta}</span>}
                                                </span>
                                                {item.task && <TaskKeyText task={item.task} className="shrink-0" />}
                                                {isActive && <span className="material-symbols-outlined text-[16px] text-muted" aria-hidden="true">keyboard_return</span>}
                                            </div>
                                        )
                                    })}
                                </div>
                            ))}
                            {query.trim() && !isLoading && flat.length === 0 && (
                                <p className="px-4 py-8 text-center text-[13px] text-muted">Nothing matches “{query.trim()}”.</p>
                            )}
                            {error && <p role="alert" className="px-4 py-2 text-[12px] text-amber-400">{error}</p>}
                        </div>
                        <div className="hidden sm:flex items-center gap-4 px-4 h-10 border-t border-line text-[11px] text-muted">
                            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
                            <span className="flex items-center gap-1"><Kbd>Enter</Kbd> open</span>
                            <span className="flex items-center gap-1"><Kbd>?</Kbd> shortcuts</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
