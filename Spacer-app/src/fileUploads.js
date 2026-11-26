// Uploading project and task files: what's accepted, the checks a file must
// pass before it's sent (a first line of defence for quick feedback; storage
// rules and scanning are the real gate), and how a file is shown.

export const ACCEPTED = [
    "image/*", "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip", "application/x-zip-compressed", "text/plain", "text/csv",
].join(",")

export const MAX_FILE_SIZE_MB = 50
const MAX_FILE_SIZE    = MAX_FILE_SIZE_MB * 1024 * 1024   // 50 MB in bytes

// Extensions that are never allowed regardless of MIME type
const BLOCKED_EXTENSIONS = new Set([
    "exe","bat","cmd","com","pif","scr","vbs","wsf","reg",
    "msi","dll","sys","drv","bin","cpl","ocx",
    "sh","bash","zsh","fish","ps1","psm1","psd1",
    "jar","class","war","ear","jnlp",
    "php","php3","php4","php5","phtml","phar",
    "asp","aspx","ashx","asmx","axd","cshtml",
    "cgi","pl","rb","py","lua","go",
    "js","jsx","ts","tsx","mjs","cjs",
    "html","htm","xhtml",
    "swf","fla",
    "dmg","pkg","deb","rpm","run",
    "iso","img","vmdk",
])

// Allowed MIME types whitelist — kept in sync with ACCEPTED above
const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg","image/png","image/gif","image/webp","image/bmp","image/tiff","image/heic","image/heif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip","application/x-zip-compressed",
    "text/plain","text/csv",
])

// Read the first N bytes of a File (for magic-byte / file-signature verification)
const readFirstBytes = (file, n) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = (e) => resolve(new Uint8Array(e.target.result))
        reader.onerror = reject
        reader.readAsArrayBuffer(file.slice(0, n))
    })

// Full client-side security validation, run before any file is accepted for upload.
// NOTE: this is a first line of defense for UX (fast feedback, blocks obvious junk).
// It is NOT a substitute for server-side / storage-bucket-side scanning — a
// determined attacker can bypass client-side checks entirely, so the same
// extension/MIME/size rules (and ideally real antivirus/malware scanning,
// e.g. via a Supabase storage webhook to a scanning service) should also be
// enforced wherever the file actually lands.
export const validateFile = async (file) => {
    // 1 — Size
    if (file.size > MAX_FILE_SIZE)
        return { valid: false, error: `File too large. Maximum allowed is ${MAX_FILE_SIZE_MB} MB — your file is ${formatBytes(file.size)}.` }

    if (file.size === 0)
        return { valid: false, error: "File appears to be empty and cannot be uploaded." }

    // 2 — Extension blacklist
    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (!ext)
        return { valid: false, error: "File has no extension. Please upload a file with a recognised format." }
    if (BLOCKED_EXTENSIONS.has(ext))
        return { valid: false, error: `Files with the .${ext} extension are blocked for security reasons. Executable and script files cannot be uploaded.` }

    // 3 — MIME type whitelist (browsers don't always supply a type, so only check if present)
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type) && !file.type.startsWith("image/"))
        return { valid: false, error: `File type "${file.type}" is not permitted. Only documents, images, spreadsheets, and archive files are accepted.` }

    // 4 — Magic bytes: verify file content matches its claimed type
    try {
        const bytes = await readFirstBytes(file, 8)
        const is = (sigs) => sigs.every((b, i) => b === null || bytes[i] === b)

        const isJPEG  = is([0xFF, 0xD8, 0xFF])
        const isPNG   = is([0x89, 0x50, 0x4E, 0x47])
        const isGIF   = is([0x47, 0x49, 0x46, 0x38])
        const isPDF   = is([0x25, 0x50, 0x44, 0x46])   // %PDF
        const isZIP   = is([0x50, 0x4B, 0x03, 0x04])   // PK (ZIP, DOCX, XLSX)
        const isZIPe  = is([0x50, 0x4B, 0x05, 0x06])   // PK (empty ZIP)
        const isZIPok = isZIP || isZIPe

        const checks = [
            { mime: "image/jpeg",       ok: isJPEG,  label: "JPEG" },
            { mime: "image/png",        ok: isPNG,   label: "PNG"  },
            { mime: "image/gif",        ok: isGIF,   label: "GIF"  },
            { mime: "application/pdf",  ok: isPDF,   label: "PDF"  },
            { mime: "application/zip",  ok: isZIPok, label: "ZIP"  },
            { mime: "application/x-zip-compressed", ok: isZIPok, label: "ZIP" },
            { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  ok: isZIPok, label: "DOCX" },
            { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",        ok: isZIPok, label: "XLSX" },
        ]

        for (const { mime, ok, label } of checks) {
            if (file.type === mime && !ok)
                return { valid: false, error: `Security check failed: the file's content does not match its declared format (${label}). This file may be disguised or corrupted and cannot be uploaded.` }
        }

        // 5 — Block Windows PE executables even if renamed (MZ header)
        if (bytes[0] === 0x4D && bytes[1] === 0x5A)   // MZ
            return { valid: false, error: "Security check failed: this file appears to be a Windows executable and cannot be uploaded." }

        // 6 — Block ELF binaries (Linux executables)
        if (bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46)   // \x7fELF
            return { valid: false, error: "Security check failed: this file appears to be a Linux executable and cannot be uploaded." }

    } catch {
        // Can't read bytes — allow through on this check, but the earlier
        // extension/MIME/size checks still applied.
    }

    return { valid: true, error: null }
}

export function getFileStyle(type = "") {
    if (type.startsWith("image/")) return { icon: "image", color: "text-primary-fixed-dim", bg: "bg-primary-container/20" }
    if (type === "application/pdf") return { icon: "picture_as_pdf", color: "text-error", bg: "bg-error-container/20" }
    if (type.includes("word") || type === "application/msword")
        return { icon: "description", color: "text-muted", bg: "bg-raised" }
    if (type.includes("sheet") || type === "application/vnd.ms-excel")
        return { icon: "table", color: "text-accent-ink", bg: "bg-[var(--primary-color)]/10" }
    if (type.includes("zip")) return { icon: "folder_zip", color: "text-muted", bg: "bg-raised" }
    if (type.startsWith("text/")) return { icon: "article", color: "text-muted", bg: "bg-raised" }
    return { icon: "insert_drive_file", color: "text-muted", bg: "bg-raised" }
}

export function formatBytes(bytes) {
    if (!bytes) return ""
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
}
