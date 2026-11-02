import { useState } from "react"
import { ANNOUNCEMENT_CATEGORIES, meetingPlatform, validateAnnouncement } from "./generalFormat"
import { validateImage } from "./generalData"
import { Avatar, CategoryTag, PinnedTag, Modal, Field, INPUT_CLASS, PrimaryButton, ErrorNote } from "./GeneralParts"
import Select from "../components/Select"

const formatDate = (iso) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })

function Cover({ announcement, className }) {
    if (announcement.coverUrl) return <img src={announcement.coverUrl} alt="" className={`${className} object-cover`} />
    return (
        <div className={`${className} bg-surface2 flex items-center justify-center`} aria-hidden="true">
            <span className="material-symbols-outlined text-accent-ink text-[28px]">campaign</span>
        </div>
    )
}

function Byline({ announcement }) {
    return (
        <p className="flex items-center gap-2 text-[11px] text-muted">
            <Avatar name={announcement.author?.name} url={announcement.authorAvatarUrl} size="sm" />
            <span className="truncate">{announcement.author?.name || "Former member"} · {formatDate(announcement.created_at)}</span>
        </p>
    )
}

// Compact card for the Pinned row and the Overview preview
export function AnnouncementCard({ announcement, onOpen }) {
    return (
        <button type="button" onClick={onOpen} className="w-full text-left flex gap-3 p-3 rounded-xl border border-line bg-raised hover:border-line-strong transition-colors cursor-pointer">
            <Cover announcement={announcement} className="w-20 h-20 rounded-lg shrink-0" />
            <div className="min-w-0 flex-1 space-y-1.5">
                {announcement.pinned && <PinnedTag />}
                <p className="text-sm font-semibold text-white truncate">{announcement.title}</p>
                <p className="text-xs text-muted line-clamp-2">{announcement.body}</p>
                <Byline announcement={announcement} />
            </div>
        </button>
    )
}

export function AnnouncementRow({ announcement, isSelected, onSelect }) {
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-current={isSelected ? "true" : undefined}
            className={`w-full text-left flex gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${isSelected ? "border-accent-ink/60 bg-raised" : "border-transparent hover:bg-raised"}`}
        >
            <Cover announcement={announcement} className="w-14 h-14 rounded-lg shrink-0" />
            <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold text-white truncate">{announcement.title}</p>
                <p className="text-xs text-muted line-clamp-2">{announcement.body}</p>
                <Byline announcement={announcement} />
            </div>
            <div className="shrink-0 self-center">
                <CategoryTag categories={ANNOUNCEMENT_CATEGORIES} value={announcement.category} />
            </div>
        </button>
    )
}

function EventDetails({ announcement }) {
    const platform = meetingPlatform(announcement.meeting_url)
    if (!announcement.event_starts_at && !platform) return null
    const start = announcement.event_starts_at ? new Date(announcement.event_starts_at) : null
    const end = announcement.event_ends_at ? new Date(announcement.event_ends_at) : null
    const time = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    return (
        <div className="rounded-lg border border-line p-3 space-y-2 text-sm text-soft">
            {start && (
                <>
                    <p className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">calendar_today</span>{start.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
                    <p className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">schedule</span>{time(start)}{end ? ` – ${time(end)}` : ""}</p>
                </>
            )}
            {platform && (
                <>
                    <p className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">videocam</span>{platform}</p>
                    <a href={announcement.meeting_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-accent-ink hover:underline break-all">
                        <span className="material-symbols-outlined text-[16px]">link</span>{announcement.meeting_url}
                    </a>
                </>
            )}
        </div>
    )
}

// Right-hand panel for the selected announcement
export function AnnouncementDetail({ announcement, canEdit, onTogglePin, onDelete, isBusy }) {
    return (
        <article className="bg-panel border border-line rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    {announcement.pinned && <PinnedTag />}
                    <CategoryTag categories={ANNOUNCEMENT_CATEGORIES} value={announcement.category} />
                </div>
                <span className="text-[11px] text-muted">{formatDate(announcement.created_at)}</span>
            </div>
            <h2 className="text-lg font-semibold text-white">{announcement.title}</h2>
            <div className="flex items-center gap-2">
                <Avatar name={announcement.author?.name} url={announcement.authorAvatarUrl} />
                <div className="min-w-0">
                    <p className="text-sm text-white truncate">{announcement.author?.name || "Former member"}</p>
                    {announcement.author?.job_title && <p className="text-[11px] text-muted truncate">{announcement.author.job_title}</p>}
                </div>
            </div>
            {announcement.coverUrl && <img src={announcement.coverUrl} alt="" className="w-full max-h-56 object-cover rounded-lg" />}
            <p className="text-sm text-soft whitespace-pre-line leading-relaxed">{announcement.body}</p>
            <EventDetails announcement={announcement} />
            {canEdit && (
                <div className="flex gap-2 pt-2 border-t border-line">
                    <button type="button" disabled={isBusy} onClick={onTogglePin} className="text-xs text-soft hover:text-white flex items-center gap-1 cursor-pointer disabled:opacity-50">
                        <span className="material-symbols-outlined text-[16px]">push_pin</span>{announcement.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button type="button" disabled={isBusy} onClick={onDelete} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer disabled:opacity-50 ml-auto">
                        <span className="material-symbols-outlined text-[16px]">delete</span>Delete
                    </button>
                </div>
            )}
        </article>
    )
}

const EMPTY_FORM = { title: "", body: "", category: "company_update", pinned: false, meetingUrl: "", startsAt: "", endsAt: "", coverFile: null }

export function AnnouncementForm({ onSubmit, onClose }) {
    const [form, setForm] = useState(EMPTY_FORM)
    const [errorMsg, setErrorMsg] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }))

    const handleCover = (e) => {
        const file = e.target.files?.[0] || null
        const invalid = file && validateImage(file)
        setErrorMsg(invalid || "")
        setForm((f) => ({ ...f, coverFile: invalid ? null : file }))
        if (invalid) e.target.value = ""
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        const invalid = validateAnnouncement(form)
        setErrorMsg(invalid || "")
        if (invalid) return
        setIsSaving(true)
        const error = await onSubmit(form)
        setIsSaving(false)
        if (error) setErrorMsg("Couldn't publish the announcement. Please try again.")
    }

    return (
        <Modal title="Create announcement" onClose={onClose} wide>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Title"><input className={INPUT_CLASS} value={form.title} onChange={set("title")} maxLength={200} required /></Field>
                <Field label="Message"><textarea className={`${INPUT_CLASS} min-h-[120px]`} value={form.body} onChange={set("body")} required /></Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Category">
                        <Select className={INPUT_CLASS} value={form.category} onChange={set("category")}>
                            {ANNOUNCEMENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </Select>
                    </Field>
                    <Field label="Cover image" hint="Optional. JPG, PNG, WebP or GIF, up to 5 MB.">
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleCover} className="text-xs text-soft" />
                    </Field>
                </div>
                <fieldset className="space-y-3 rounded-lg border border-line p-3">
                    <legend className="px-1 text-xs text-muted">Event details (optional)</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Starts"><input type="datetime-local" className={INPUT_CLASS} value={form.startsAt} onChange={set("startsAt")} /></Field>
                        <Field label="Ends"><input type="datetime-local" className={INPUT_CLASS} value={form.endsAt} onChange={set("endsAt")} /></Field>
                    </div>
                    <Field label="Meeting link" hint="Google Meet, Zoom, Teams… must start with https://">
                        <input type="url" className={INPUT_CLASS} value={form.meetingUrl} onChange={set("meetingUrl")} placeholder="https://meet.google.com/…" />
                    </Field>
                </fieldset>
                <label className="flex items-center gap-2 text-sm text-soft">
                    <input type="checkbox" checked={form.pinned} onChange={set("pinned")} className="accent-[#aff82a]" />
                    Pin to the top
                </label>
                {errorMsg && <ErrorNote>{errorMsg}</ErrorNote>}
                <div className="flex justify-end">
                    <PrimaryButton type="submit" icon="campaign" disabled={isSaving}>{isSaving ? "Publishing…" : "Publish"}</PrimaryButton>
                </div>
            </form>
        </Modal>
    )
}
