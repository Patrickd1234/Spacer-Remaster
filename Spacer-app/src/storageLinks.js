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
