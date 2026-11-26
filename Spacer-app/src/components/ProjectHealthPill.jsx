import { TONES } from "./statusTones"

// The project header's one-line status for a Collab project, e.g.
// "At risk · Development is holding this up". Shown on every tab; opens the
// Departments tab. `health` comes from projectHealth() in crossDepartment.js.
export default function ProjectHealthPill({ health, onOpen }) {
    const tone = TONES[health.tone]
    return (
        <button
            type="button"
            onClick={onOpen}
            title="See each department's progress and who is waiting on whom"
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold cursor-pointer hover:brightness-125 transition ${tone.pill}`}
        >
            <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
            {health.text}
        </button>
    )
}
