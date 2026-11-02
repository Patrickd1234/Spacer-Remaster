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

// Storage keys can't hold every character a file name can; keep it readable
export function dmAttachmentPath(senderId, messageId, fileName) {
    const safeName = String(fileName).replace(/[^\w.-]+/g, "_").slice(-100) || "file";
    return `${senderId}/${messageId}/${safeName}`;
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
