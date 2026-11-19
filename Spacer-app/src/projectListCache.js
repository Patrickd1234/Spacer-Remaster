// The sidebar's project list, remembered in this browser. Every page mounts its
// own sidebar and the project page is rebuilt per project, so without this the
// list starts empty ("No projects yet") and the project name starts blank on
// each click. The saved copy shows at once and the fresh load replaces it.
// Saved per signed-in user, so another account on this browser never sees it
const PROJECT_LIST_PREFIX = "spacers.projectList."

// Also kept in memory, so it works when storage is blocked (private mode)
let memoryList = null
let memoryOwner = null

const currentUserId = () => {
    try {
        return localStorage.getItem("userId") || null
    } catch {
        return null
    }
}

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

/**
 * Reads a saved list, or null when nothing usable is saved.
 * @param {string | null} raw
 * @returns {{ projects: object[], links: object[], orgTeams: object[] } | null}
 */
export function parseSavedList(raw) {
    if (!raw) return null
    try {
        const data = JSON.parse(raw)
        if (!isRecord(data) || !Array.isArray(data.projects)) return null
        const listOf = (value) => (Array.isArray(value) ? value.filter(isRecord) : [])
        return {
            projects: listOf(data.projects).filter((p) => p.id != null),
            links: listOf(data.links),
            orgTeams: listOf(data.orgTeams),
        }
    } catch {
        return null
    }
}

/**
 * @param {{ projects: object[] } | null} list
 * @param {string | number} projectId
 * @returns {object | null}
 */
export function findProject(list, projectId) {
    return list?.projects?.find((p) => String(p.id) === String(projectId)) || null
}

export function readSavedProjectList() {
    const owner = currentUserId()
    if (!owner) return null
    if (memoryOwner === owner) return memoryList
    memoryOwner = owner
    try {
        memoryList = parseSavedList(localStorage.getItem(PROJECT_LIST_PREFIX + owner))
    } catch {
        memoryList = null
    }
    return memoryList
}

/** Saves the parts given, keeping the rest of what was saved. */
export function saveProjectList(parts) {
    const owner = currentUserId()
    if (!owner) return
    memoryList = { projects: [], links: [], orgTeams: [], ...readSavedProjectList(), ...parts }
    memoryOwner = owner
    try {
        localStorage.setItem(PROJECT_LIST_PREFIX + owner, JSON.stringify(memoryList))
    } catch {
        // Storage blocked or full: the in-memory copy still covers this visit
    }
}

export function findSavedProject(projectId) {
    return findProject(readSavedProjectList(), projectId)
}

/** Forgets every saved list (sign-out, leaving an organization). */
export function clearSavedProjectLists() {
    memoryList = null
    memoryOwner = null
    try {
        Object.keys(localStorage)
            .filter((key) => key.startsWith(PROJECT_LIST_PREFIX))
            .forEach((key) => localStorage.removeItem(key))
    } catch {
        // Storage blocked: nothing was saved there
    }
}
