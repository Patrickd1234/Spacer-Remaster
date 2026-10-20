// "Remember this device for 7 days" for two-factor authentication.
// After a code is entered, the server issues a random device token (it stores
// only a hash). We keep it in this browser and send it as the x-mfa-device
// header on every Supabase request; the database's mfa_satisfied() accepts a
// valid one in place of a fresh code. Signing out keeps it, so the next
// sign-in on this device within 7 days skips the code prompt.

const STORAGE_KEY = "spacer_mfa_device";
export const TRUSTED_DEVICE_HEADER = "x-mfa-device";
export const TRUSTED_DEVICE_DAYS = 7;

function readStored() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (!parsed?.token || !parsed?.userId || !parsed?.expiresAt) return null;
        if (new Date(parsed.expiresAt) <= new Date()) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

// Token to send with requests (any user; the server only honours it for its owner)
export function getTrustedDeviceToken() {
    return readStored()?.token || null;
}

export function hasTrustedDeviceFor(userId) {
    return Boolean(userId) && readStored()?.userId === userId;
}

export function saveTrustedDevice(userId, token) {
    const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, token, expiresAt }));
    } catch {
        // Storage unavailable (private mode): the device simply isn't remembered
    }
}

export function clearTrustedDevice() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // nothing to clear
    }
}

// fetch wrapper for the Supabase client: adds the device token header when present
export function fetchWithTrustedDevice(input, init = {}) {
    const token = getTrustedDeviceToken();
    if (!token) return fetch(input, init);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set(TRUSTED_DEVICE_HEADER, token);
    return fetch(input, { ...init, headers });
}
