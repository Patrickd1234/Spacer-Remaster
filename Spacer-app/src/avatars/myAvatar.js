import { useSyncExternalStore } from "react"
import { supabase, getSessionUser } from "../supabase"
import { createSignedLinks } from "../storageLinks"
import { AVATAR_CHANGED_EVENT } from "../appEvents"
import { GENERAL_MEDIA_BUCKET } from "../general/generalData"
import { EMPTY_AVATAR, applyAvatarChange, canRetryAfterError, shouldResign } from "./avatarState"

// The signed-in user's photo, shared by every place that shows it (sidebar,
// Settings, Profile). Loaded once, updated when AVATAR_CHANGED_EVENT fires
// (generalData.updateMyAvatar / removeMyAvatar), and re-signed before the
// private bucket's link expires.

const RESIGN_CHECK_MS = 60 * 1000
// Auth events after which the profile row may read differently: a new
// account, or a session that just passed two-factor (the users table needs it)
const RELOAD_EVENTS = new Set(["SIGNED_IN", "MFA_CHALLENGE_VERIFIED", "USER_UPDATED"])

let state = EMPTY_AVATAR
let loading = null
const listeners = new Set()
let detach = null

function setState(next) {
    state = next
    listeners.forEach((listener) => listener())
}

async function signedLink(path) {
    if (!path) return null
    const links = await createSignedLinks(GENERAL_MEDIA_BUCKET, [path])
    return links.get(path) ?? null
}

async function load() {
    const user = await getSessionUser()
    if (!user?.id) {
        setState(EMPTY_AVATAR)
        return
    }
    setState({ ...state, status: "loading" })
    const { data, error } = await supabase.from("users").select("avatar_path").eq("id", user.id).maybeSingle()
    if (error) {
        console.error("Loading your photo failed:", error)
        setState({ ...EMPTY_AVATAR, userId: user.id, status: "error" })
        return
    }
    const path = data?.avatar_path ?? null
    const url = await signedLink(path)
    setState({ userId: user.id, path, url, signedAt: Date.now(), status: "ready" })
}

function loadMyAvatar() {
    if (!loading) loading = load().finally(() => { loading = null })
    return loading
}

// Signs the current path again; drops the answer if the photo changed meanwhile
async function resign() {
    const path = state.path
    const url = await signedLink(path)
    if (url && state.path === path) setState({ ...state, url, signedAt: Date.now() })
}

function handleAvatarChanged(event) {
    const next = applyAvatarChange(state, event.detail)
    if (next === state) return
    setState(next)
    resign()
}

function attach() {
    window.addEventListener(AVATAR_CHANGED_EVENT, handleAvatarChanged)
    const timer = setInterval(() => {
        if (shouldResign(state, Date.now())) resign()
    }, RESIGN_CHECK_MS)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (!session?.user) {
            setState(EMPTY_AVATAR)
            return
        }
        // Deferred: calling Supabase inside this callback can deadlock (App.jsx)
        if (RELOAD_EVENTS.has(event) || session.user.id !== state.userId) setTimeout(loadMyAvatar, 0)
    })
    if (state.status === "idle") loadMyAvatar()
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

const getSnapshot = () => state

// An <img onError> handler: the link may have expired while the tab slept
function handleImageError() {
    if (canRetryAfterError(state, Date.now())) resign()
}

// { userId, path, url, isLoading, handleImageError }. url is null when there
// is no photo (or it couldn't be loaded): show initials then.
export function useMyAvatar() {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    return {
        userId: snapshot.userId,
        path: snapshot.path,
        url: snapshot.url,
        isLoading: snapshot.status === "idle" || snapshot.status === "loading",
        handleImageError,
    }
}
