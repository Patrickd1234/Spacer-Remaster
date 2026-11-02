// Shown on the sender's side while their attachments upload (group chat and DMs).
// Supabase storage uploads don't report progress, so the bar is indeterminate.
// files: [{ name, type }]
export default function UploadingBubble({ files, compact = false }) {
    if (files.length === 0) return null
    return (
        <div className="flex justify-end" role="status" aria-live="polite">
            <div className={`chat-bubble-mine rounded-2xl rounded-tr-none ${compact ? "px-3 py-2 max-w-[85%]" : "px-4 py-2.5 max-w-[70%]"} space-y-2`}>
                {files.map((file, i) => (
                    <div key={`${file.name}-${i}`} className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-[16px] opacity-80 shrink-0">
                            {file.type?.startsWith("image/") ? "image" : "description"}
                        </span>
                        <span className={`truncate ${compact ? "text-[11px]" : "text-sm"}`}>{file.name}</span>
                    </div>
                ))}
                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full w-1/3 rounded-full bg-[var(--primary-color)] animate-[upload-slide_1.2s_ease-in-out_infinite]" />
                </div>
                <p className={`flex items-center gap-1.5 opacity-80 ${compact ? "text-[10px]" : "text-xs"}`}>
                    <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                    Uploading {files.length === 1 ? "file" : `${files.length} files`}…
                </p>
            </div>
        </div>
    )
}
