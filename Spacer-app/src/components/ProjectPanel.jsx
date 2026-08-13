/**
 * ProjectPanel.jsx
 * Slide-in side panel for a project.
 * Features:
 *  - File upload (any type: jpg, png, pdf, docx, xlsx, zip, etc.)
 *  - File list with click-to-preview
 *  - Uses Supabase Storage bucket "project-files"
 *
 * Props:
 *   project  : { id, name } | null
 *   onClose  : () => void
 *   onPreview: (file) => void   — open DocViewer
 */
import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";

const ACCEPTED = [
  "image/*",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/csv",
].join(",");

function fileIcon(type = "") {
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "picture_as_pdf";
  if (type.includes("word") || type === "application/msword") return "description";
  if (type.includes("sheet") || type === "application/vnd.ms-excel") return "table";
  if (type.includes("zip")) return "folder_zip";
  if (type.startsWith("text/")) return "article";
  return "insert_drive_file";
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function ProjectPanel({ project, onClose, onPreview }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const inputRef = useRef();

  // Fetch existing files for this project
  useEffect(() => {
    if (!project) return;
    fetchFiles();
  }, [project]);

  async function fetchFiles() {
    const { data, error } = await supabase
      .from("project_files")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching files:", error);
    } else {
      setFiles(data || []);
    }
  }

  async function uploadFile(file) {
    if (!file) return;
    setUploading(true);
    setUploadError("");

    const path = `${project.id}/${Date.now()}-${file.name}`;

    // Upload to Supabase Storage
    const { error: storageError } = await supabase.storage
      .from("project-files")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (storageError) {
      setUploadError("Upload failed: " + storageError.message);
      setUploading(false);
      return;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("project-files")
      .getPublicUrl(path);

    const publicUrl = urlData?.publicUrl || "";

    // Save metadata to project_files table
    const { data: fileData, error: dbError } = await supabase.from("project_files").insert({
      project_id: project.id,
      name: file.name,
      type: file.type,
      size: file.size,
      path,
      url: publicUrl,
    }).select().single();

    if (dbError) {
      setUploadError("Could not save file record: " + dbError.message);
    } else if (fileData) {
      const { data: userData } = await supabase.auth.getUser();
      const logEntry = {
        entity_type: "file",
        entity_id: fileData.id,
        actor_id: userData?.user?.id,
        action: "file_added",
        new_state: { project_id: project.id, name: file.name }
      };
      await supabase.from("activity_log").insert(logEntry);
    }

    setUploading(false);
    fetchFiles();
  }

  async function deleteFile(f) {
    if (!window.confirm(`Delete "${f.name}"?`)) return;
    await supabase.storage.from("project-files").remove([f.path]);
    const { error } = await supabase.from("project_files").delete().eq("id", f.id);
    if (!error) {
      const { data: userData } = await supabase.auth.getUser();
      const logEntry = {
        entity_type: "file",
        entity_id: f.id,
        actor_id: userData?.user?.id,
        action: "file_removed",
        new_state: { project_id: project.id, name: f.name }
      };
      await supabase.from("activity_log").insert(logEntry);
    }
    fetchFiles();
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) uploadFile(dropped);
  }

  if (!project) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className="fixed right-0 top-0 h-full z-[100] flex flex-col bg-surface-container shadow-2xl border-l border-outline-variant"
        style={{ width: "min(480px, 100vw)", animation: "slideIn .25s ease" }}
      >
        <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

        {/* Panel header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant bg-surface-container-low shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-on-primary-container text-base" style={{ fontVariationSettings: "'FILL' 1" }}>folder</span>
          </div>
          <h2 className="font-semibold text-on-surface flex-1 truncate">{project.name}</h2>
          <button onClick={onClose} className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-colors">close</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* ── File upload zone ── */}
          <section>
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
              Add files
            </p>

            <div
              className={`rounded-xl border-2 border-dashed p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors
                ${dragOver
                  ? "border-primary-fixed bg-primary-fixed/10"
                  : "border-outline-variant hover:border-outline hover:bg-surface-container-high/50"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={(e) => uploadFile(e.target.files[0])}
              />
              {uploading ? (
                <>
                  <span className="material-symbols-outlined text-primary-fixed text-4xl animate-spin">progress_activity</span>
                  <p className="text-sm text-on-surface-variant">Uploading…</p>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-on-surface-variant text-4xl">upload_file</span>
                  <p className="text-sm text-on-surface font-medium">Drop a file or click to browse</p>
                  <p className="text-xs text-on-surface-variant text-center">
                    JPG, PNG, PDF, DOCX, XLSX, ZIP and more
                  </p>
                </>
              )}
            </div>

            {uploadError && (
              <p className="mt-2 text-xs text-error">{uploadError}</p>
            )}
          </section>

          {/* ── Files list ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                Project files
              </p>
              <span className="text-xs text-on-surface-variant">{files.length} file{files.length !== 1 ? "s" : ""}</span>
            </div>

            {files.length === 0 ? (
              <div className="rounded-xl bg-surface-container-high/40 p-6 flex flex-col items-center gap-2 text-center">
                <span className="material-symbols-outlined text-on-surface-variant text-3xl">folder_open</span>
                <p className="text-sm text-on-surface-variant">No files yet. Upload the first one above.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="group flex items-center gap-3 p-3 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high transition-colors"
                  >
                    {/* Icon / thumbnail */}
                    {f.type?.startsWith("image/") ? (
                      <img
                        src={f.url}
                        alt={f.name}
                        className="w-10 h-10 rounded-lg object-cover shrink-0 cursor-pointer"
                        onClick={() => onPreview(f)}
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center shrink-0 cursor-pointer"
                        onClick={() => onPreview(f)}
                      >
                        <span
                          className="material-symbols-outlined text-primary-fixed"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          {fileIcon(f.type)}
                        </span>
                      </div>
                    )}

                    {/* Name + meta */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => onPreview(f)}
                    >
                      <p className="text-sm font-medium text-on-surface truncate">{f.name}</p>
                      <p className="text-xs text-on-surface-variant">
                        {formatBytes(f.size)} · {new Date(f.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        title="Preview"
                        onClick={() => onPreview(f)}
                        className="material-symbols-outlined text-on-surface-variant hover:text-on-surface p-1 rounded"
                      >
                        visibility
                      </button>
                      <a
                        href={f.url}
                        download={f.name}
                        target="_blank"
                        rel="noreferrer"
                        title="Download"
                        className="material-symbols-outlined text-on-surface-variant hover:text-on-surface p-1 rounded"
                      >
                        download
                      </a>
                      <button
                        title="Delete"
                        onClick={() => deleteFile(f)}
                        className="material-symbols-outlined text-error hover:text-error/80 p-1 rounded"
                      >
                        delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
