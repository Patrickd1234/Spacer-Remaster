import { callEdgeFunction } from "./edgeFunctions";

export const MIN_PASSWORD_LENGTH = 8;

// Change the password through the change-password edge function, which checks
// the current password first and signs out the user's other sessions.
// Returns { error: string | null }.
export async function changePassword(currentPassword, newPassword) {
    const { error } = await callEdgeFunction("change-password", {
        current_password: currentPassword,
        new_password: newPassword,
    });
    return { error };
}
