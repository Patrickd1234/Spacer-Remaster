import { useSyncExternalStore } from "react"
import { supabase } from "../supabase"
import { createSignedLinks } from "../storageLinks"
import { AVATAR_CHANGED_EVENT } from "../appEvents"
import { GENERAL_MEDIA_BUCKET } from "../general/generalData"
import {
    EMPTY_PHOTOS, applyPhotoChange, buildPhotos, canRetryAfterError, photoUrlOf, shouldReload, withSignedUrl,
} from "./peoplePhotosState"

// Everyone's photo in the organization, for chat, project, department and
// comment avatars. One query (row-level security limits users to the
// caller's organization) and one batch of signed links, shared by every
// avatar on the page, instead of each list asking for photos itself.

// Far above any organization today; keeps the query bounded
const PHOTO_LOOKUP_LIMIT = 1000
const RELOAD_CHECK_MS = 60 * 1000
// Auth events after which the list may read differently: another account,
// or a session that just passed two-factor (the users table needs it)
const RELOAD_EVENTS = new Set(["SIGNED_IN", "MFA_CHALLENGE_VERIFIED"])

let state = EMPTY_PHOTOS
let loading = null
const listeners = new Set()
let detach = null

function setState(next) {
    if (next === state) return
    state = next
    listeners.forEach((listener) => listener())
}

async function load() {
    setState({ ...state, status: "loading" })
    const { data, error } = await supabase
        .from("users")
        .select("id, avatar_path")
        .not("avatar_path", "is", null)
        .limit(PHOTO_LOOKUP_LIMIT)
    if (error) {
        console.error("Loading people's photos failed:", error)
        // Keep any photos already shown; try again at the next check
        setState({ ...state, status: "ready", loadedAt: Date.now() })
        return
    }
    const rows = data || []
    const links = await createSignedLinks(GENERAL_MEDIA_BUCKET, rows.map((row) => row.avatar_path))
    setState(buildPhotos(rows, links, Date.now()))
}

function loadPhotos() {
    if (!loading) loading = load().finally(() => { loading = null })
    return loading
}

async function handleAvatarChanged(event) {
    const detail = event.detail
    setState(applyPhotoChange(state, detail))
    if (!detail?.path) return
    const links = await createSignedLinks(GENERAL_MEDIA_BUCKET, [detail.path])
    setState(withSignedUrl(state, detail.userId, detail.path, links.get(detail.path)))
}

function attach() {
    window.addEventListener(AVATAR_CHANGED_EVENT, handleAvatarChanged)
    const timer = setInterval(() => {
        if (shouldReload(state, Date.now())) loadPhotos()
    }, RELOAD_CHECK_MS)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (!session?.user) {
            setState(EMPTY_PHOTOS)
            return
        }
        // Deferred: calling Supabase inside this callback can deadlock (App.jsx)
        if (RELOAD_EVENTS.has(event)) setTimeout(loadPhotos, 0)
    })
    if (state.status === "idle") loadPhotos()
    return () => {
        window.removeEventListener(AVATAR_CHANGED_EVENT, handleAvatarChanged)
        clearInterval(timer)
        subscription.unsubscribe()
    }
}

function subscribe(listener) {
    listeners.add(listener)
    if (listeners.size === 1) detach = attach()
    return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && detach) {
            detach()
            detach = null
        }
    }
}

// An <img onError> handler: the links may have expired while the tab slept
export function handlePhotoError() {
    if (canRetryAfterError(state, Date.now())) loadPhotos()
}

// The signed link to someone's photo, or null (show initials)
export function usePersonPhoto(userId) {
    const getSnapshot = () => photoUrlOf(state, userId)
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
