import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn("supabaseUrl or supabaseKey not found");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

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
