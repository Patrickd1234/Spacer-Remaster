// Colours per status tone for Collab project statuses (the light theme remaps
// these text colours to deep inks). Tones come from DEPARTMENT_STATUS and
// PROJECT_STATUS in crossDepartment.js.
export const TONES = {
    green: { pill: "bg-green-500/15 text-green-400", bar: "bg-green-500", text: "text-muted", card: "border-line", dot: "bg-green-500" },
    amber: { pill: "bg-amber-500/15 text-amber-400", bar: "bg-amber-400", text: "text-amber-400", card: "border-line", dot: "bg-amber-400" },
    red: { pill: "bg-red-500/15 text-red-400", bar: "bg-red-400", text: "text-red-400", card: "border-red-400/60", dot: "bg-red-400" },
    muted: { pill: "bg-line text-soft", bar: "bg-line-strong", text: "text-muted", card: "border-line", dot: "bg-line-strong" },
}
