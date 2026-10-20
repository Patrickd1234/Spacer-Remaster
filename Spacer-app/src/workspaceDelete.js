import { callEdgeFunction } from "./edgeFunctions";

// Delete a project or department through the delete-workspace-item edge
// function, which also removes stored files and chat channels.
// Returns { error: string | null } with a message fit to show the user.
export async function deleteWorkspaceItem(type, id) {
    const { error, status } = await callEdgeFunction("delete-workspace-item", { type, id });
    if (!error) return { error: null };
    if (status === 404) return { error: `You don't have permission to delete this ${type}.` };
    return { error };
}
