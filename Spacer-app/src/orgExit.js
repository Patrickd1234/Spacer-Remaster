import { supabase } from "./supabase";
import { saveOrgName } from "./orgNameCache";
import { exitErrorMessage } from "./orgExitRules";

// Both go through the remove_from_organization() database function, which
// checks who is asking and strips every kind of access in one transaction.
// Each returns { error: string | null }.

/**
 * An organization admin takes someone out of the organization for good.
 * @param {string} userId
 * @returns {Promise<{ error: string | null }>}
 */
export async function removeFromOrganization(userId) {
    const { error } = await supabase.rpc("remove_from_organization", { p_user_id: userId });
    if (error) console.error("Removing from the organization failed:", error);
    return { error: exitErrorMessage(error, "Couldn't remove them. Please try again.") };
}

/**
 * The signed-in user leaves their organization for good.
 * @returns {Promise<{ error: string | null }>}
 */
export async function leaveOrganization() {
    const { error } = await supabase.rpc("remove_from_organization", { p_user_id: null });
    if (error) {
        console.error("Leaving the organization failed:", error);
        return { error: exitErrorMessage(error, "Couldn't leave the organization. Please try again.") };
    }
    // The remembered name would otherwise flash in the next organization's sidebar
    saveOrgName("");
    return { error: null };
}

/**
 * The name of the signed-in user's organization (typed to confirm leaving or removing).
 * @returns {Promise<{ data: string | null, error: string | null }>}
 */
export async function fetchMyOrganizationName() {
    const failed = { data: null, error: "Couldn't load your organization." };
    const { data: orgId, error: orgError } = await supabase.rpc("current_org_id");
    if (orgError) console.error("Loading your organization failed:", orgError);
    if (orgError || !orgId) return failed;
    const { data, error } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
    if (error) console.error("Loading the organization name failed:", error);
    if (error || !data?.name) return failed;
    return { data: data.name, error: null };
}
