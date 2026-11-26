import { safeHttpsUrl } from "./safeUrl.js";

// Supabase Storage signed links: /storage/v1/object/sign/<bucket>/<path>?token=…
const SIGNED_STORAGE_PATH = "/storage/v1/object/sign/";

// A link that saves the file instead of opening it in a new tab.
// Browsers ignore <a download> for files on another site (the files live on
// Supabase, not the app's own address), so Supabase is asked to send the file
// as a download: its `download` parameter names the saved file.
// Other https links come back unchanged; anything unsafe comes back null.
export function downloadUrl(url, fileName) {
    const safe = safeHttpsUrl(url);
    if (!safe) return null;
    const parsed = new URL(safe);
    if (!parsed.pathname.includes(SIGNED_STORAGE_PATH)) return safe;
    parsed.searchParams.set("download", String(fileName ?? "").trim());
    return parsed.href;
}
