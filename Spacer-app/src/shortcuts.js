// Keyboard shortcuts: which key presses count, and the list shown by "?".
// Single-letter shortcuts never fire while typing in a field, and never with
// Ctrl, Alt or Cmd held (those belong to the browser), except the ones that
// say so. No imports, so `npm test` can load it.

/** Whether the key press happened while typing somewhere. */
export function isTypingTarget(target) {
    if (!target) return false
    const tag = String(target.tagName || "").toUpperCase()
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
    return Boolean(target.isContentEditable)
}

/**
 * Whether a keydown event is the shortcut. `shortcut` is "c", "?", "/",
 * "mod+k" (Ctrl on Windows, Cmd on a Mac) and so on.
 */
export function matchesShortcut(event, shortcut) {
    const parts = shortcut.toLowerCase().split("+")
    const key = parts[parts.length - 1]
    const wantsMod = parts.includes("mod")
    const hasMod = Boolean(event.ctrlKey || event.metaKey)
    if (wantsMod !== hasMod || event.altKey) return false
    if (!wantsMod && isTypingTarget(event.target)) return false
    return String(event.key || "").toLowerCase() === key
}

/** Every shortcut, for the help dialog (and nowhere else). */
export const SHORTCUT_GROUPS = [
    {
        title: "Anywhere",
        items: [
            { keys: ["Ctrl", "K"], label: "Search and jump to anything" },
            { keys: ["/"], label: "Search and jump to anything" },
            { keys: ["C"], label: "Create a task" },
            { keys: ["?"], label: "Show these shortcuts" },
        ],
    },
    {
        title: "On a project's Tasks tab",
        items: [
            { keys: ["B"], label: "Show the board" },
            { keys: ["L"], label: "Show the list" },
            { keys: ["F"], label: "Filter the tasks" },
        ],
    },
    {
        title: "In a task",
        items: [
            { keys: ["J"], label: "Next task" },
            { keys: ["K"], label: "Previous task" },
            { keys: ["E"], label: "Edit the title" },
            { keys: ["Esc"], label: "Close" },
        ],
    },
]
