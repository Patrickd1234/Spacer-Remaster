import { useRef } from "react"
import PanelSection from "./PanelSection"
import PlanetLoader from "../../components/PlanetLoader"
import { ACCEPTED, MAX_FILE_SIZE_MB, getFileStyle, formatBytes } from "../../fileUploads"

// Files attached to the task (project_files with its task_id). Uploading and
// deleting go through the project page, which checks each file first.
export default function TaskAttachments({ files, canEdit, isUploading, uploadError, onUpload, onPreview, onDelete }) {
    const inputRef = useRef(null)
    if (files.length === 0 && !canEdit) return null

    const attachButton = canEdit && (
        <>
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ""
                    if (file) onUpload(file)
                }}
            />
            <button
                type="button"
                disabled={isUploading}
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-1 text-xs font-semibold text-accent-ink hover:underline cursor-pointer disabled:opacity-60"
            >
                {isUploading
                    ? <><PlanetLoader className="text-[14px]" />Uploading…</>
                    : <><span className="material-symbols-outlined text-[15px]" aria-hidden="true">attach_file</span>Attach</>}
            </button>
        </>
    )

    return (
        <PanelSection id="task-attachments" icon="attach_file" title="Attachments" count={files.length > 0 ? String(files.length) : null} action={attachButton}>
            {uploadError && <p role="alert" className="text-xs text-red-400">{uploadError}</p>}
            {files.length > 0 ? (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {files.map((f) => {
                        const { icon, color, bg } = getFileStyle(f.type)
                        return (
                            <li key={f.id} className="group/file flex items-center gap-2.5 rounded-lg border border-line/60 bg-raised/60 p-2 hover:border-line-strong transition-colors">
                                <button type="button" onClick={() => onPreview(f)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer">
                                    <span className={`w-8 h-8 ${bg} rounded-md flex items-center justify-center shrink-0`}>
                                        <span className={`material-symbols-outlined text-[18px] ${color}`} style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">{icon}</span>
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-[13px] font-medium text-white truncate" title={f.name}>{f.name}</span>
                                        <span className="block text-[11px] text-muted truncate">{formatBytes(f.size)}{f.uploaded_by ? ` · ${f.uploaded_by}` : ""}</span>
                                    </span>
                                </button>
                                <a href={f.url} download={f.name} target="_blank" rel="noopener noreferrer" aria-label={`Download ${f.name}`} className="material-symbols-outlined text-[17px] text-muted hover:text-white opacity-0 group-hover/file:opacity-100 focus:opacity-100 transition-opacity">
                                    download
                                </a>
                                {canEdit && (
                                    <button type="button" onClick={() => onDelete(f)} aria-label={`Delete ${f.name}`} className="material-symbols-outlined text-[17px] text-muted hover:text-red-400 opacity-0 group-hover/file:opacity-100 focus:opacity-100 transition-opacity cursor-pointer">
                                        delete
                                    </button>
                                )}
                            </li>
                        )
                    })}
                </ul>
            ) : (
                <p className="text-xs text-muted">Nothing attached yet. Up to {MAX_FILE_SIZE_MB} MB a file; executables and disguised files are refused.</p>
            )}
        </PanelSection>
    )
}
