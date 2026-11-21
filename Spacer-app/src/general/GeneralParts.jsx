import { useEffect, useState } from "react"
import Sidebar from "../partials/SidebarRouter"
import Header from "../partials/header"
import { TONE_CLASSES, categoryOf, initials, eventStart } from "./generalFormat"

// Building blocks shared by the General Space pages

// Sidebar + header + centered content, like the other app pages.
// The breadcrumb reads "General Space › page"; pass section={null} for a top-level page.
export function GeneralShell({ page, section = "General Space", icon = "workspaces", children }) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const inset = sidebarCollapsed ? 72 : 260
    return (
        <div className="bg-canvas min-h-screen text-white font-sans antialiased flex">
            <Sidebar onCollapsedChange={setSidebarCollapsed} />
            <div className="flex-1 flex flex-col min-w-0">
                <Header breadcrumb={{ icon, label: section ? `${section} › ${page}` : page }} insetLeft={inset} />
                <main className="flex-1 flex flex-col transition-all duration-300 ease-out" style={{ marginLeft: inset }}>
                    <div className="p-8 space-y-6 max-w-[1400px] w-full mx-auto">{children}</div>
                </main>
            </div>
        </div>
    )
}

export function PageHeading({ title, subtitle, actions = null }) {
    return (
        <section className="flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1 className="text-2xl font-semibold text-white">{title}</h1>
                {subtitle && <p className="text-muted text-sm mt-1">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </section>
    )
}

export function PrimaryButton({ icon, children, ...props }) {
    return (
        <button type="button" {...props} className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-on-accent font-semibold text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50">
            {icon && <span className="material-symbols-outlined text-[18px]">{icon}</span>}
            {children}
        </button>
    )
}

export function SecondaryButton({ icon, children, ...props }) {
    return (
        <button type="button" {...props} className="flex items-center gap-2 border border-line hover:border-line-strong text-white text-sm px-3 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50">
            {icon && <span className="material-symbols-outlined text-[18px]">{icon}</span>}
            {children}
        </button>
    )
}

// Filter chip; aria-pressed tells screen readers which one is on
export function Chip({ isActive, onClick, children }) {
    return (
        <button
            type="button"
            aria-pressed={isActive}
            onClick={onClick}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${isActive ? "bg-accent text-on-accent border-accent-ink" : "border-line text-soft hover:text-white hover:border-line-strong"}`}
        >
            {children}
        </button>
    )
}

export function CategoryTag({ categories, value }) {
    const category = categoryOf(categories, value)
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium whitespace-nowrap ${TONE_CLASSES[category.tone]}`}>
            {category.label}
        </span>
    )
}

export function PinnedTag() {
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/10 text-accent-ink border border-accent-ink/30 text-[11px] font-medium">
            <span className="material-symbols-outlined text-[12px]">push_pin</span>
            Pinned
        </span>
    )
}

const AVATAR_SIZES = { xs: "w-5 h-5 text-[8px]", sm:"w-7 h-7 text-[10px]", md: "w-10 h-10 text-xs", lg: "w-16 h-16 text-lg" }

export function Avatar({ name, url, size = "md" }) {
    const classes = `${AVATAR_SIZES[size]} rounded-full shrink-0 overflow-hidden bg-line flex items-center justify-center font-semibold text-soft`
    if (url) return <img src={url} alt="" className={`${classes} object-cover`} />
    return <span className={classes} aria-hidden="true">{initials(name)}</span>
}

// "OCT / 30" block used in event lists
export function DateBadge({ event }) {
    const start = eventStart(event)
    return (
        <div className="w-12 shrink-0 rounded-lg border border-line bg-raised py-1 text-center">
            <p className="text-[10px] font-semibold uppercase text-accent-ink">{start.toLocaleDateString([], { month: "short" })}</p>
            <p className="text-lg font-semibold text-white leading-tight">{start.getDate()}</p>
        </div>
    )
}

export function ErrorNote({ children, onRetry = null }) {
    return (
        <p role="alert" className="text-red-400 text-xs flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px]">error</span>
            {children}
            {onRetry && <button type="button" onClick={onRetry} className="underline hover:no-underline cursor-pointer">Try again</button>}
        </p>
    )
}

// Centered dialog; Escape or the backdrop closes it
export function Modal({ title, onClose, children, wide = false }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose() }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onClose])

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
                className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[90vh] overflow-y-auto bg-panel border border-line rounded-xl p-6`}
            >
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold text-white">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-white cursor-pointer">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                {children}
            </div>
        </div>
    )
}

export const INPUT_CLASS = "w-full bg-field border border-line focus:border-accent-ink rounded-lg px-3 py-2 text-white text-sm placeholder-muted focus:outline-none transition-colors"
// Toolbar select that sizes to its content (INPUT_CLASS's w-full beats an added w-auto)
export const COMPACT_SELECT_CLASS = "bg-field border border-line hover:border-line-strong focus:border-accent-ink rounded-lg px-3 py-2 text-white text-sm focus:outline-none transition-colors cursor-pointer"

export function Field({ label, children, hint = null }) {
    return (
        <label className="block space-y-1.5">
            <span className="text-xs font-medium text-soft">{label}</span>
            {children}
            {hint && <span className="block text-[11px] text-muted">{hint}</span>}
        </label>
    )
}
