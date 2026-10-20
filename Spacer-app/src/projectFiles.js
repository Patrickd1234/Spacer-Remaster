import { createSignedLinks } from "./storageLinks";

export const PROJECT_FILES_BUCKET = "project-files";

// Replace each file's url with a fresh signed link to its storage path
export async function withSignedUrls(files) {
    const urlByPath = await createSignedLinks(PROJECT_FILES_BUCKET, files.map(f => f.path));
    return files.map(f => ({ ...f, url: urlByPath.get(f.path) || "" }));
}
