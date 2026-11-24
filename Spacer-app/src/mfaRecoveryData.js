import { supabase } from "./supabase";
import { callEdgeFunction } from "./edgeFunctions";

// Server calls for two-factor recovery (20261124110000_mfa_recovery.sql and
// the mfa-recovery edge function). Each returns { data, error } with error a
// message fit to show, or null.

// The database's own wording for refusals it raises on purpose (hint 'rbac')
function messageFor(error, fallback) {
    if (!error) return null;
    console.error(fallback, error);
    return error.hint === "rbac" && error.message ? error.message : fallback;
}

// New codes replacing the old ones. Needs a session that just passed an
// authenticator code (aal2). The only time the codes are readable.
export async function createRecoveryCodes() {
    const { data, error } = await supabase.rpc("create_mfa_recovery_codes");
    if (error) return { data: null, error: messageFor(error, "Couldn't create recovery codes.") };
    return { data: Array.isArray(data) ? data : [], error: null };
}

// Unused codes left; null if it couldn't be checked
export async function fetchRecoveryCodesLeft() {
    const { data, error } = await supabase.rpc("mfa_recovery_codes_left");
    if (error) {
        // Before the migration the function doesn't exist: show nothing
        console.warn("Counting recovery codes failed:", error);
        return null;
    }
    return typeof data === "number" ? data : null;
}

// After turning two-factor off
export async function clearMyRecoveryCodes() {
    const { error } = await supabase.rpc("clear_my_mfa_recovery_codes");
    return { data: null, error: messageFor(error, "Couldn't delete your old recovery codes.") };
}

// On the code screen: a valid code removes the lost authenticator
export async function redeemRecoveryCode(code) {
    return callEdgeFunction("mfa-recovery", { action: "use_code", code });
}

// Directory: an Owner or Organization Admin removes a member's authenticator
export async function resetMemberTwoFactor(userId) {
    return callEdgeFunction("mfa-recovery", { action: "admin_reset", user_id: userId });
}
