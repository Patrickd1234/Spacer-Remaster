// Pure rules for the signed-in user's photo (myAvatar.js holds the state).
// The photo lives in a private bucket, so it is shown through a signed link
// that stops working after an hour (storageLinks.js).

// Sign again well before the hour is up
export const RESIGN_AFTER_MS = 50 * 60 * 1000
// After a failed image load, wait this long before signing again, so a
// broken file can't cause a loop of requests
export const RETRY_AFTER_MS = 30 * 1000

export const EMPTY_AVATAR = Object.freeze({ userId: null, path: null, url: null, signedAt: 0, status: "idle" })

export function shouldResign(state, now) {
    return Boolean(state.path) && now - state.signedAt >= RESIGN_AFTER_MS
}

export function canRetryAfterError(state, now) {
    return Boolean(state.path) && now - state.signedAt >= RETRY_AFTER_MS
}

// detail: { userId, path } from AVATAR_CHANGED_EVENT. Returns the same object
// when nothing changes for the signed-in user, so callers can skip work.
export function applyAvatarChange(state, detail) {
    if (!state.userId || !detail || detail.userId !== state.userId) return state
    const path = detail.path ?? null
    if (path === state.path) return state
    return { ...state, path, url: null, signedAt: 0 }
}
