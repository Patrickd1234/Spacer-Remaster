// Cards and panel states shared by the organization overview and My Space

const ACCENTS = {
    orange: "border-l-2 border-l-orange-500",
    red: "border-l-2 border-l-red-500",
}

export function StatCard({ value, label, sub, subIcon, accent = null, onRetry = null }) {
    return (
        <div className={`bg-raised border border-line ${ACCENTS[accent] || ""} rounded-xl px-5 pt-5 pb-3 flex flex-col cursor-default hover:border-line-strong transition-colors`}>
            <p className="text-3xl font-semibold text-white tracking-tight">{value}</p>
            <p className="text-white text-[13px] mt-1">{label}</p>
            {sub && (
                <p className="flex items-center gap-1 text-[11px] text-muted mt-4 pt-3 border-t border-line">
                    {subIcon && <span className="material-symbols-outlined text-[13px]">{subIcon}</span>}
                    <span className="truncate">{sub}</span>
                    {onRetry && (
                        <button type="button" onClick={onRetry} className="text-primary-fixed underline hover:no-underline cursor-pointer">retry</button>
                    )}
                </p>
            )}
        </div>
    )
}

export function StatCardSkeleton() {
    return (
        <div className="bg-raised border border-line rounded-xl px-5 pt-5 pb-3 animate-pulse" aria-hidden="true">
            <SkeletonLine className="w-16 h-3" />
            <SkeletonLine className="w-24 h-3 mt-2" />
            <div className="mt-6 pt-3 border-t border-line"><SkeletonLine className="w-28 h-2.5" /></div>
        </div>
    )
}

export function SkeletonLine({ className = "" }) {
    return <div className={`rounded bg-surface2 ${className}`} />
}

// Bordered section with a title row
export function Panel({ title, action, children, className = "" }) {
    return (
        <section className={`bg-panel border border-line rounded-xl p-4 flex flex-col gap-4 ${className}`}>
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-white">{title}</h2>
                {action}
            </div>
            {children}
        </section>
    )
}

export function PanelLink({ onClick, children }) {
    return (
        <button type="button" onClick={onClick} className="text-xs text-muted underline hover:text-white cursor-pointer">{children}</button>
    )
}

// Centered empty or error message inside a panel
export function PanelMessage({ icon, title, text, onRetry = null }) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5 py-10 px-4" role={onRetry ? "alert" : undefined}>
            <span className="material-symbols-outlined text-[28px] text-muted mb-1">{icon}</span>
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="text-xs text-muted max-w-xs">{text}</p>
            {onRetry && (
                <button type="button" onClick={onRetry} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-xs text-muted hover:text-white hover:border-line-strong cursor-pointer">
                    <span className="material-symbols-outlined text-[14px]">refresh</span> Retry
                </button>
            )}
        </div>
    )
}
