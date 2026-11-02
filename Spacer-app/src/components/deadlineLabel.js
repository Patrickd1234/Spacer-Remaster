// Wording for a project's deadline chip (project_spaces.due_date, a plain date)

const DAY_MS = 24 * 60 * 60 * 1000;
const WARN_WITHIN_DAYS = 7;

const shortDate = (y, m, d) =>
    new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Returns { label, tone } with tone "normal" | "warn" | "danger", or null when
// there is no usable deadline. Days are counted on calendar dates (UTC math on
// the date parts), so a deadline doesn't shift with the time of day or DST.
export function describeDeadline(dueDate, today = new Date()) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate || "");
    if (!match) return null;
    const [y, m, d] = match.slice(1).map(Number);

    const dueDay = Date.UTC(y, m - 1, d);
    const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const daysLeft = Math.round((dueDay - todayDay) / DAY_MS);

    if (daysLeft < 0) return { label: `Overdue by ${plural(-daysLeft, "day")} · ${shortDate(y, m, d)}`, tone: "danger" };
    if (daysLeft === 0) return { label: "Due today", tone: "warn" };
    if (daysLeft === 1) return { label: "Due tomorrow", tone: "warn" };
    return {
        label: `Due ${shortDate(y, m, d)} · ${plural(daysLeft, "day")} left`,
        tone: daysLeft <= WARN_WITHIN_DAYS ? "warn" : "normal",
    };
}
