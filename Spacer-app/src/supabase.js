import { createClient } from '@supabase/supabase-js';
import { fetchWithTrustedDevice } from './trustedDevice';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn("supabaseUrl or supabaseKey not found");
}

// The fetch wrapper adds this browser's "remember this device" token, if any,
// to database, storage and edge function requests (see trustedDevice.js)
export const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { fetch: fetchWithTrustedDevice },
});

// Signed-in user from the locally stored session — no network round trip,
// unlike supabase.auth.getUser(). Use it for the user's id/email/metadata in
// the UI; the database still enforces access with the session token (RLS).
export const getSessionUser = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
        console.warn("Unable to read session:", error);
        return null;
    }
    return data?.session?.user ?? null;
};
