import { useEffect } from "react"

const TOAST_DURATION_MS = 4500

const STYLES = {
    success: { icon: "check_circle", accent: "text-primary-fixed", border: "border-[#2D3139]" },
    error: { icon: "error", accent: "text-red-400", border: "border-red-500/30" },
}

// Small top-center notice. `toast` is { type: "success" | "error", title, message } or null.
export default function Toast({ toast, onClose }) {
    useEffect(() => {
        if (!toast) return
        const timer = setTimeout(onClose, TOAST_DURATION_MS)
        return () => clearTimeout(timer)
    }, [toast, onClose])

    if (!toast) return null
    const style = STYLES[toast.type] || STYLES.success

    return (
        <div
            role={toast.type === "error" ? "alert" : "status"}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-[70] w-[min(92vw,360px)] bg-[#191c21] border ${style.border} rounded-xl shadow-2xl px-4 py-3 flex items-start gap-3 animate-fadeIn`}
        >
            <span className={`material-symbols-outlined text-[18px] mt-0.5 ${style.accent}`}>{style.icon}</span>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{toast.title}</p>
                {toast.message && <p className="text-xs text-[#8c947b] mt-0.5">{toast.message}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Dismiss" className="text-[#8c947b] hover:text-white cursor-pointer">
                <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
        </div>
    )
}
