/**
 * DocViewer.jsx
 * Modal that previews a file based on its MIME type:
 *   - Images        → <img>
 *   - PDFs          → <iframe>
 *   - Office docs   → Google Docs viewer iframe
 *   - Everything else → icon + download link
 *
 * Props:
 *   file    : { name, type, url } | null
 *   onClose : () => void
 */

import { safeHttpsUrl } from "../safeUrl";
import { downloadUrl } from "../downloadLinks";

const ICON_MAP = {
  "application/pdf": "picture_as_pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "description",
  "application/msword": "description",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "table",
  "application/vnd.ms-excel": "table",
  "application/zip": "folder_zip",
  "application/x-zip-compressed": "folder_zip",
};

function fileIcon(type = "") {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "movie";
  return ICON_MAP[type] || "insert_drive_file";
}

export default function DocViewer({ file, onClose }) {
  if (!file) return null;

  const name = file.name || "File";
  const type = file.type || "";
  // Only https links are previewed or downloaded; anything else (javascript:, data:) is dropped
  const url = safeHttpsUrl(file.url);
  // Download buttons save the file rather than opening it in a new tab
  const saveUrl = downloadUrl(url, name);
  const isImage = type.startsWith("image/");
  const isPDF = type === "application/pdf";
  const isOffice =
    type.includes("wordprocessingml") ||
    type.includes("spreadsheetml") ||
    type.includes("presentationml") ||
    type === "application/msword" ||
    type === "application/vnd.ms-excel";

  const gdocsUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="relative bg-surface-container rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: "min(90vw, 900px)", height: "min(85vh, 700px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line bg-panel shrink-0">
          <span className="material-symbols-outlined text-muted" style={{ fontVariationSettings: "'FILL' 1" }}>
            {fileIcon(type)}
          </span>
          <p className="text-white font-semibold text-sm flex-1 truncate">{name}</p>
          {url && (
            <a
              href={saveUrl}
              download={name}
              target="_blank"
              rel="noreferrer"
              className="material-symbols-outlined text-muted hover:text-white transition-colors"
              title="Download"
            >
              download
            </a>
          )}
          <button
            onClick={onClose}
            className="material-symbols-outlined text-muted hover:text-white transition-colors"
          >
            close
          </button>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-hidden flex items-center justify-center bg-panelest">
          {!url && (
            <p className="text-muted text-sm p-8 text-center">This file can't be opened right now. Close and reopen the project to refresh its link.</p>
          )}
          {url && isImage && (
            <img
              src={url}
              alt={name}
              className="max-w-full max-h-full object-contain"
            />
          )}
          {url && isPDF && (
            <iframe
              src={url}
              title={name}
              className="w-full h-full border-0"
            />
          )}
          {url && isOffice && (
            <iframe
              src={gdocsUrl}
              title={name}
              className="w-full h-full border-0"
            />
          )}
          {url && !isImage && !isPDF && !isOffice && (
            <div className="flex flex-col items-center gap-4 text-center p-8">
              <span
                className="material-symbols-outlined text-primary-container"
                style={{ fontSize: 72, fontVariationSettings: "'FILL' 1" }}
              >
                {fileIcon(type)}
              </span>
              <p className="text-white font-semibold">{name}</p>
              <p className="text-muted text-sm">Preview not available for this file type.</p>
              <a
                href={saveUrl}
                download={name}
                target="_blank"
                rel="noreferrer"
                className="mt-2 px-5 py-2 rounded-lg bg-primary-container text-on-accent font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                Download file
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
