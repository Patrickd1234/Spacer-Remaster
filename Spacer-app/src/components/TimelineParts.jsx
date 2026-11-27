// The cards under the Timeline (design screen 7): key dates and insights.
// They only render; ProjectTimeline works out what goes in them.

const longDay = (date) => (date ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—")

const INSIGHT_TONES = {
    warning: { icon: "schedule", tile: "bg-amber-500/10 border-amber-400/30 text-amber-400" },
    info: { icon: "info", tile: "bg-surface2 border-line text-soft" },
    ok: { icon: "check", tile: "bg-accent/10 border-accent-ink/30 text-accent-ink" },
}

function Card({ icon, title, children }) {
    return (
        <section aria-label={title} className="rounded-xl border border-line bg-panel p-md">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white mb-3">
                <span className="material-symbols-outlined text-[18px] text-muted" aria-hidden="true">{icon}</span>
                {title}
            </h3>
            {children}
        </section>
    )
}

export function KeyDatesCard({ dates }) {
    const rows = [
        ["Project start", longDay(dates.start)],
        ["Project deadline", dates.deadline ? longDay(dates.deadline) : "No deadline"],
        ["Next milestone", dates.milestone ? `${dates.milestone.label} · ${longDay(dates.milestone.date)}` : "Nothing due ahead"],
    ]
    return (
        <Card icon="calendar_today" title="Key dates">
            <dl className="divide-y divide-line/60">
                {rows.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-md py-2 text-[12px]">
                        <dt className="text-muted">{label}</dt>
                        <dd className="text-white text-right">{value}</dd>
                    </div>
                ))}
            </dl>
        </Card>
    )
}

export function InsightsCard({ insights }) {
    return (
        <Card icon="monitoring" title="Insights">
            <ul className="space-y-2.5">
                {insights.map((insight) => {
                    const tone = INSIGHT_TONES[insight.tone] || INSIGHT_TONES.info
                    return (
                        <li key={insight.title} className="flex items-start gap-2.5">
                            <span className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${tone.tile}`}>
                                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{tone.icon}</span>
                            </span>
                            <div className="min-w-0">
                                <p className="text-[12px] font-semibold text-white">{insight.title}</p>
                                <p className="text-[11px] text-muted">{insight.detail}</p>
                            </div>
                        </li>
                    )
                })}
            </ul>
        </Card>
    )
}
