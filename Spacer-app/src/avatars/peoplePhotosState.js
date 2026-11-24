// Pure rules for everyone's photos in the organization (peoplePhotos.js
// holds the state). Links to the private bucket last an hour, so the whole
// list is loaded again before then; that also picks up photos other people
// changed in their own browsers.

export const RELOAD_AFTER_MS = 50 * 60 * 1000
// After an image fails to load, wait at least this long since the last load
// before loading again, so a broken file can't cause a loop of requests
export const RETRY_AFTER_MS = 30 * 1000

export const EMPTY_PHOTOS = Object.freeze({ status: "idle", byUser: new Map(), loadedAt: 0 })

// rows: [{ id, avatar_path }]; links: Map path -> signed url
export function buildPhotos(rows, links, now) {
    const byUser = new Map(
        rows
            .filter((row) => row.id && row.avatar_path)
            .map((row) => [row.id, { path: row.avatar_path, url: links.get(row.avatar_path) ?? null }]),
    )
    return { status: "ready", byUser, loadedAt: now }
}

export function photoUrlOf(state, userId) {
    if (!userId) return null
    return state.byUser.get(userId)?.url ?? null
}

export function shouldReload(state, now) {
    return state.status === "ready" && now - state.loadedAt >= RELOAD_AFTER_MS
}

export function canRetryAfterError(state, now) {
    return state.status !== "loading" && now - state.loadedAt >= RETRY_AFTER_MS
}

// detail: { userId, path } from AVATAR_CHANGED_EVENT, path null when removed.
// The new path has no link yet (withSignedUrl adds it). Returns the same
// object when nothing changes.
export function applyPhotoChange(state, detail) {
    if (state.status !== "ready" || !detail?.userId) return state
    const current = state.byUser.get(detail.userId)
    const path = detail.path ?? null
    if ((current?.path ?? null) === path) return state
    const byUser = new Map(state.byUser)
    if (path) byUser.set(detail.userId, { path, url: null })
    else byUser.delete(detail.userId)
    return { ...state, byUser }
}

// Adds a freshly signed link, unless the person's photo changed meanwhile
export function withSignedUrl(state, userId, path, url) {
    const current = state.byUser.get(userId)
    if (!url || current?.path !== path || current.url === url) return state
    const byUser = new Map(state.byUser)
    byUser.set(userId, { path, url })
    return { ...state, byUser }
}
