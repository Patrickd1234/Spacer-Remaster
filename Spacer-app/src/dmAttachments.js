import { supabase } from "./supabase";
import { createSignedLinks } from "./storageLinks";

// Storage calls for direct-message attachments; see dmAttachmentFiles.js for
// the path layout and the pure helpers.

export const DM_ATTACHMENTS_BUCKET = "dm-attachments";

// Returns the upload error, or null
export async function uploadDmAttachment(path, file) {
    const { error } = await supabase.storage
        .from(DM_ATTACHMENTS_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
    return error;
}

export async function removeDmAttachment(path) {
    const { error } = await supabase.storage.from(DM_ATTACHMENTS_BUCKET).remove([path]);
    if (error) console.error("Removing DM attachment failed:", error);
}

// Signed links last an hour (storageLinks.js). The chat re-fetches every few
// seconds, so reuse a link for half that; a new link would reload every image.
const LINK_REUSE_MS = 30 * 60 * 1000;
const linkCache = new Map(); // path -> { url, createdAt }

// Give every stored attachment a signed link (messages use fileAttachment)
export async function withDmAttachmentLinks(messages) {
    const now = Date.now();
    const stale = messages
        .map((m) => m.fileAttachment?.path)
        .filter((path) => path && !(now - (linkCache.get(path)?.createdAt ?? 0) < LINK_REUSE_MS));
    const fresh = await createSignedLinks(DM_ATTACHMENTS_BUCKET, stale);
    fresh.forEach((url, path) => linkCache.set(path, { url, createdAt: now }));

    return messages.map((m) => (m.fileAttachment?.path
        ? { ...m, fileAttachment: { ...m.fileAttachment, url: linkCache.get(m.fileAttachment.path)?.url || null } }
        : m));
}
