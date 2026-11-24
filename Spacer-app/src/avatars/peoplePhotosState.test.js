import { test } from "node:test"
import assert from "node:assert/strict"
import {
    EMPTY_PHOTOS, RELOAD_AFTER_MS, RETRY_AFTER_MS,
    applyPhotoChange, buildPhotos, canRetryAfterError, photoUrlOf, shouldReload, withSignedUrl,
} from "./peoplePhotosState.js"

const links = new Map([["avatars/a/1.png", "https://signed/a1"]])
const ready = buildPhotos(
    [{ id: "a", avatar_path: "avatars/a/1.png" }, { id: "b", avatar_path: "avatars/b/1.png" }, { id: "c", avatar_path: null }],
    links,
    1000,
)

test("builds a photo per person who has one, with the signed link when there is one", () => {
    assert.equal(ready.status, "ready")
    assert.equal(photoUrlOf(ready, "a"), "https://signed/a1")
    assert.equal(photoUrlOf(ready, "b"), null, "a path that couldn't be signed shows initials")
    assert.equal(ready.byUser.has("c"), false)
    assert.equal(photoUrlOf(ready, null), null)
    assert.equal(photoUrlOf(EMPTY_PHOTOS, "a"), null)
})

test("loads again once the links are 50 minutes old, and only when loaded", () => {
    assert.equal(shouldReload(ready, 1000 + RELOAD_AFTER_MS - 1), false)
    assert.equal(shouldReload(ready, 1000 + RELOAD_AFTER_MS), true)
    assert.equal(shouldReload(EMPTY_PHOTOS, RELOAD_AFTER_MS * 2), false)
})

test("retries after a broken image only after the wait, and not while loading", () => {
    assert.equal(canRetryAfterError(ready, 1000 + RETRY_AFTER_MS - 1), false)
    assert.equal(canRetryAfterError(ready, 1000 + RETRY_AFTER_MS), true)
    assert.equal(canRetryAfterError({ ...ready, status: "loading" }, 1000 + RETRY_AFTER_MS), false)
})

test("a changed photo replaces the path until its link is signed, without changing the old state", () => {
    const changed = applyPhotoChange(ready, { userId: "a", path: "avatars/a/2.png" })
    assert.deepEqual(changed.byUser.get("a"), { path: "avatars/a/2.png", url: null })
    assert.equal(photoUrlOf(ready, "a"), "https://signed/a1")
    const signed = withSignedUrl(changed, "a", "avatars/a/2.png", "https://signed/a2")
    assert.equal(photoUrlOf(signed, "a"), "https://signed/a2")
})

test("a first photo and a removed photo", () => {
    assert.deepEqual(applyPhotoChange(ready, { userId: "c", path: "avatars/c/1.png" }).byUser.get("c"), { path: "avatars/c/1.png", url: null })
    assert.equal(applyPhotoChange(ready, { userId: "a", path: null }).byUser.has("a"), false)
})

test("ignores changes that change nothing, and changes before the list is loaded", () => {
    assert.equal(applyPhotoChange(ready, { userId: "a", path: "avatars/a/1.png" }), ready)
    assert.equal(applyPhotoChange(ready, { userId: "c", path: null }), ready)
    assert.equal(applyPhotoChange(ready, null), ready)
    assert.equal(applyPhotoChange(EMPTY_PHOTOS, { userId: "a", path: "x" }), EMPTY_PHOTOS)
})

test("drops a signed link for a photo that changed meanwhile", () => {
    const changed = applyPhotoChange(ready, { userId: "a", path: "avatars/a/3.png" })
    assert.equal(withSignedUrl(changed, "a", "avatars/a/2.png", "https://signed/old"), changed)
    assert.equal(withSignedUrl(changed, "a", "avatars/a/3.png", null), changed)
})
