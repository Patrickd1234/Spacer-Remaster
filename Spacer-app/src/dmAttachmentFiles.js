import { safeDownloadDataUrl, safeImageDataUrl } from "./safeUrl.js";

// Pure helpers for direct-message attachments (storage calls live in
// dmAttachments.js). Files are stored as "<sender_id>/<message_id>/<file name>"
// (migration 20261030110000); the message row keeps { name, size, type, path }.
// Older messages stored the file itself as a base64 `dataUrl`, still displayed.

export const DM_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

// Must match the dm-attachments bucket's allowed_mime_types
export const DM_ATTACHMENT_TYPES = [
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf", "text/plain", "text/csv", "application/zip",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

// Error message for a file the bucket would refuse, or null if it's fine
export function validateDmAttachment(file) {
    if (!DM_ATTACHMENT_TYPES.includes(file.type)) {
        return `${file.name} can't be sent. Images, PDFs, Office documents, text, CSV and ZIP files are allowed.`;
    }
    if (file.size > DM_ATTACHMENT_MAX_BYTES) {
        return `${file.name} is too large. The limit is 5 MB.`;
    }
    return null;
}

export function formatFileSize(bytes) {
    const mb = bytes / (1024 * 1024);
    return mb >= 0.1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

// Storage keys can't hold every character a file name can; keep it readable.
// Leading dots go too, so the last part is never "." or ".." (or hidden).
export function dmAttachmentPath(senderId, messageId, fileName) {
    const safeName = String(fileName ?? "").replace(/[^\w.-]+/g, "_").slice(-100).replace(/^\.+/, "") || "file";
    return `${senderId}/${messageId}/${safeName}`;
}

export const DM_ATTACHMENT_NAME_MAX = 120;

// Control characters, and the Unicode marks that reorder text (a right-to-left
// override can make "fdp.exe" read as "exe.pdf")
// Built from escaped text so the source holds no invisible characters itself.
// Matching control characters is the point here, so the lint rule is off for it.
// eslint-disable-next-line no-control-regex
const HIDDEN_CHARS = new RegExp("[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]", "g");

// The file name shown in the chat and offered when downloading (X-03/X-08):
// what the sender's file was called, minus anything that hides or spoofs part
// of it, with no folders, and short enough to fit.
export function dmAttachmentName(fileName) {
    const parts = String(fileName ?? "").replace(HIDDEN_CHARS, "").split(/[\\/]+/);
    const name = parts.filter((p) => p && !/^\.+$/.test(p)).join("_").trim() || "file";
    if (name.length <= DM_ATTACHMENT_NAME_MAX) return name;
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : "";
    return `${name.slice(0, DM_ATTACHMENT_NAME_MAX - ext.length - 1)}…${ext}`;
}

// What to show for an attachment: an image source, a download link, or neither.
// `url` is a signed link set by withDmAttachmentLinks; `dataUrl` is the old format.
export function attachmentDisplay(attachment) {
    if (!attachment) return { imageSrc: null, downloadHref: null };
    if (attachment.path) {
        const url = attachment.url || null;
        const isImage = Boolean(attachment.type?.startsWith("image/"));
        return { imageSrc: isImage ? url : null, downloadHref: url };
    }
    return {
        imageSrc: safeImageDataUrl(attachment.dataUrl),
        downloadHref: safeDownloadDataUrl(attachment.dataUrl),
    };
}
