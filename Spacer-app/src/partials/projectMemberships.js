import { supabase } from "../supabase";

// Projects the user was added to directly (project_members), regardless of department
export async function fetchDirectProjects(userId) {
    if (!userId) return [];
    const { data, error } = await supabase
        .from("project_members")
        .select("project:project_spaces(*)")
        .eq("user_id", userId);
    if (error) {
        console.error("Error fetching project memberships:", error);
        return [];
    }
    return (data || []).map(row => row.project).filter(Boolean);
}

// Combine project lists without duplicates, keeping the first occurrence
export function mergeProjects(...lists) {
    const byId = new Map();
    lists.flat().forEach(project => {
        if (project?.id && !byId.has(project.id)) byId.set(project.id, project);
    });
    return [...byId.values()];
}
