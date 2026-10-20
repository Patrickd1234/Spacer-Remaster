// Guards for URLs that come from stored data before they go into href / src /
// iframe src. A stored "javascript:" or "data:text/html" URL would otherwise
// run code in the app when clicked or embedded.

// https links only (plus http on localhost for development); anything else -> null
export function safeHttpsUrl(value) {
    if (!value) return null;
    try {
        const url = new URL(String(value));
        const isLocalDev = url.protocol === "http:" && url.hostname === "localhost";
        return url.protocol === "https:" || isLocalDev ? url.href : null;
    } catch {
        return null;
    }
}

const SAFE_IMAGE_DATA_URL = /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i;

// Types that browsers render as active content (scripts, HTML, SVG, XML)
const ACTIVE_CONTENT_TYPES = /^data:(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/javascript|application\/javascript|text\/xml|application\/xml)[;,]/i;

// Inline base64 image for <img src>; anything else -> null
export function safeImageDataUrl(value) {
    return typeof value === "string" && SAFE_IMAGE_DATA_URL.test(value) ? value : null;
}

// Inline base64 file for a download link; active content types -> null
export function safeDownloadDataUrl(value) {
    if (typeof value !== "string" || !value.startsWith("data:") || !value.includes(";base64,")) return null;
    return ACTIVE_CONTENT_TYPES.test(value) ? null : value;
}
