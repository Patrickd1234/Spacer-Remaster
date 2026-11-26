import { supabase } from "./supabase";

// Private buckets: files are opened through short-lived signed links, never permanent public URLs
const SIGNED_URL_TTL_SECONDS = 60 * 60;

// Map of storage path -> signed link for every path that could be signed
export async function createSignedLinks(bucket, paths) {
    const uniquePaths = [...new Set(paths.filter(Boolean))];
    if (uniquePaths.length === 0) return new Map();

    const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(uniquePaths, SIGNED_URL_TTL_SECONDS);

    if (error) {
        console.error(`Error creating links for ${bucket}:`, error);
        return new Map();
    }
    return new Map((data || []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
}

// For lists that re-fetch often (chat): reuse a path's link for half its life,
// so images aren't re-downloaded and don't flicker on every re-fetch
const LINK_REUSE_MS = (SIGNED_URL_TTL_SECONDS * 1000) / 2;
const reusedLinks = new Map(); // "bucket/path" -> { url, createdAt }

export async function createReusedSignedLinks(bucket, paths) {
    const now = Date.now();
    const key = (path) => `${bucket}/${path}`;
    const isFresh = (path) => now - (reusedLinks.get(key(path))?.createdAt ?? 0) < LINK_REUSE_MS;
    const fresh = await createSignedLinks(bucket, paths.filter((path) => path && !isFresh(path)));
    fresh.forEach((url, path) => reusedLinks.set(key(path), { url, createdAt: now }));
    return new Map(paths
        .filter((path) => reusedLinks.has(key(path)))
        .map((path) => [path, reusedLinks.get(key(path)).url]));
}
