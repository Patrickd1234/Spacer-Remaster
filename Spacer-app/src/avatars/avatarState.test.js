import { test } from "node:test"
import assert from "node:assert/strict"
import { EMPTY_AVATAR, RESIGN_AFTER_MS, RETRY_AFTER_MS, applyAvatarChange, canRetryAfterError, shouldResign } from "./avatarState.js"

const ready = { userId: "u1", path: "avatars/u1/a.png", url: "https://signed/a", signedAt: 1000, status: "ready" }

test("signs again once the link is 50 minutes old", () => {
    assert.equal(shouldResign(ready, 1000 + RESIGN_AFTER_MS - 1), false)
    assert.equal(shouldResign(ready, 1000 + RESIGN_AFTER_MS), true)
})

test("never signs when there is no photo", () => {
    assert.equal(shouldResign({ ...ready, path: null }, 1000 + RESIGN_AFTER_MS * 2), false)
    assert.equal(canRetryAfterError({ ...ready, path: null }, 1000 + RETRY_AFTER_MS * 2), false)
})

test("retries a failed image only after the retry wait", () => {
    assert.equal(canRetryAfterError(ready, 1000 + RETRY_AFTER_MS - 1), false)
    assert.equal(canRetryAfterError(ready, 1000 + RETRY_AFTER_MS), true)
})

test("a new photo for the signed-in user replaces the path and clears the old link", () => {
    const next = applyAvatarChange(ready, { userId: "u1", path: "avatars/u1/b.png" })
    assert.deepEqual(next, { ...ready, path: "avatars/u1/b.png", url: null, signedAt: 0 })
    assert.equal(ready.path, "avatars/u1/a.png", "the old state is not changed")
})

test("a removed photo clears the path", () => {
    assert.equal(applyAvatarChange(ready, { userId: "u1", path: null }).path, null)
})

test("ignores changes for someone else, the same path, or before the user is known", () => {
    assert.equal(applyAvatarChange(ready, { userId: "u2", path: "x" }), ready)
    assert.equal(applyAvatarChange(ready, { userId: "u1", path: ready.path }), ready)
    assert.equal(applyAvatarChange(EMPTY_AVATAR, { userId: "u1", path: "x" }), EMPTY_AVATAR)
    assert.equal(applyAvatarChange(ready, null), ready)
})
