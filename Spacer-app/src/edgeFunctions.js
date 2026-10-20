import { supabase } from "./supabase";

// Call an edge function and turn failures into a message fit to show the user.
// Returns { data, error: string | null, status }.
export async function callEdgeFunction(name, body) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (!error) return { data, error: null, status: 200 };

    let message = error.message || "Something went wrong.";
    let status = error.context?.status;
    try {
        const payload = await error.context?.json();
        if (payload?.error) message = payload.error;
    } catch {
        // Response had no JSON body; keep the generic message
    }
    console.error(`${name} failed:`, error);
    return { data: null, error: message, status };
}
