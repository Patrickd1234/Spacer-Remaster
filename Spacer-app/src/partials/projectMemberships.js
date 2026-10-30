// Combine project lists without duplicates, keeping the first occurrence
export function mergeProjects(...lists) {
    const byId = new Map();
    lists.flat().forEach(project => {
        if (project?.id && !byId.has(project.id)) byId.set(project.id, project);
    });
    return [...byId.values()];
}
