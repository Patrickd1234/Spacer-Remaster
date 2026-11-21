// Short task keys ("DEVNGT-12"): the task's project prefix (department part +
// project part), or the organization's for tasks without a project, plus its
// number there (migration 20261119100000_task_keys). No imports, so `npm test` can load it.

const BRANCH_MAX = 60

// null until both the prefix and the number are known (or before the migration)
export function formatTaskKey(prefix, number) {
    if (!prefix || number == null) return null
    return `${prefix}-${number}`
}

// "spa-42-fix-the-login-bug": the key first, so GitHub automation finds it,
// then whole words of the title while the name stays under BRANCH_MAX
export function branchName(prefix, number, title) {
    const key = formatTaskKey(prefix, number).toLowerCase()
    const words = (title || "")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
    let name = key
    for (const word of words) {
        if (name.length + 1 + word.length > BRANCH_MAX) break
        name = `${name}-${word}`
    }
    return name
}
