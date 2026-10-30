import { useEffect, useState } from "react"
import { Avatar, Modal, Field, INPUT_CLASS, PrimaryButton, SecondaryButton, ErrorNote } from "./GeneralParts"
import { validateImage } from "./generalData"

const ROLE_NAMES = { admin: "Admin", team_lead: "Team lead", member: "Member", viewer: "Viewer", super_admin: "Super admin" }
const MAX_TAGS = 2
const TIME_ZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []

// "10:42 AM (WAT)" in the person's time zone; null if unset or unknown
function localTime(timezone) {
    if (!timezone) return null
    try {
        return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: timezone, timeZoneName: "short" })
    } catch {
        return null
    }
}

function TeamTags({ teams }) {
    if (teams.length === 0) return null
    return (
        <div className="flex flex-wrap gap-1">
            {teams.slice(0, MAX_TAGS).map((t) => (
                <span key={t.id} className="px-2 py-0.5 rounded-md border border-[#2D3139] bg-[#191c21] text-[11px] text-[#c4c9b8]">{t.name}</span>
            ))}
            {teams.length > MAX_TAGS && <span className="px-1 text-[11px] text-[#8c947b]">+{teams.length - MAX_TAGS}</span>}
        </div>
    )
}

export function PersonCard({ person, isSelected, onOpen }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-current={isSelected ? "true" : undefined}
            className={`w-full text-left p-4 rounded-xl border bg-[#14161b] transition-colors cursor-pointer flex flex-col items-start gap-2 ${isSelected ? "border-[#aff82a]/60" : "border-[#2D3139] hover:border-[#3d424d]"}`}
        >
            <Avatar name={person.name} url={person.avatarUrl} size="lg" />
            <div className="min-w-0 w-full">
                <p className="text-sm font-semibold text-white truncate">{person.name}</p>
                <p className="text-xs text-[#8c947b] truncate">{person.job_title || "No title yet"}</p>
            </div>
            <TeamTags teams={person.teams} />
        </button>
    )
}

export function PersonRow({ person, isSelected, onOpen }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-current={isSelected ? "true" : undefined}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-[#2D3139] last:border-b-0 transition-colors cursor-pointer ${isSelected ? "bg-[#191c21]" : "hover:bg-[#191c21]"}`}
        >
            <Avatar name={person.name} url={person.avatarUrl} />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{person.name}</p>
                <p className="text-xs text-[#8c947b] truncate">{person.job_title || "No title yet"}</p>
            </div>
            <div className="hidden md:block"><TeamTags teams={person.teams} /></div>
        </button>
    )
}

function DrawerSection({ title, children }) {
    return (
        <section className="space-y-2 pt-4 border-t border-[#2D3139]">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8c947b]">{title}</h3>
            {children}
        </section>
    )
}

function InfoLine({ icon, children }) {
    return <p className="flex items-center gap-2 text-sm text-[#c4c9b8] min-w-0"><span className="material-symbols-outlined text-[16px] text-[#8c947b]">{icon}</span><span className="truncate">{children}</span></p>
}

// Right-side profile drawer. Shows only what the viewer's access returns.
export function ProfileDrawer({ person, people, isMe, canSetManager, onClose, onMessage, onEdit, onSetManager }) {
    const manager = people.find((p) => p.id === person.reports_to)
    const time = localTime(person.timezone)

    useEffect(() => {
        // An open dialog (Edit profile) handles Escape itself
        const onKey = (e) => { if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) onClose() }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onClose])

    return (
        <aside aria-label={`${person.name}'s profile`} className="bg-[#14161b] border border-[#2D3139] rounded-xl p-5 space-y-4 lg:sticky lg:top-20">
            <div className="flex items-start justify-between">
                <Avatar name={person.name} url={person.avatarUrl} size="lg" />
                <button type="button" onClick={onClose} aria-label="Close profile" className="text-[#8c947b] hover:text-white cursor-pointer">
                    <span className="material-symbols-outlined">close</span>
                </button>
            </div>
            <div>
                <h2 className="text-lg font-semibold text-white">{person.name}</h2>
                <p className="text-sm text-[#8c947b]">{person.job_title || "No title yet"}</p>
            </div>
            <TeamTags teams={person.teams} />
            <div className="flex gap-2">
                {isMe
                    ? <SecondaryButton icon="edit" onClick={onEdit}>Edit profile</SecondaryButton>
                    : <PrimaryButton icon="chat" onClick={onMessage}>Message</PrimaryButton>}
            </div>

            <DrawerSection title="About">
                {person.description && <p className="text-sm text-[#c4c9b8] whitespace-pre-line">{person.description}</p>}
                <InfoLine icon="mail"><a href={`mailto:${person.email}`} className="hover:text-white hover:underline">{person.email}</a></InfoLine>
                {person.location && <InfoLine icon="location_on">{person.location}</InfoLine>}
                {time && <InfoLine icon="schedule">Local time {time}</InfoLine>}
            </DrawerSection>

            {person.teams.length > 0 && (
                <DrawerSection title={`Team Spaces (${person.teams.length})`}>
                    {person.teams.map((t) => (
                        <p key={t.id} className="flex items-center justify-between text-sm text-[#c4c9b8]">
                            <span className="truncate">{t.name}</span>
                            <span className="text-[11px] text-[#8c947b]">{ROLE_NAMES[t.role] || t.role}</span>
                        </p>
                    ))}
                </DrawerSection>
            )}

            <DrawerSection title="Role & Reporting">
                <dl className="grid grid-cols-[100px_1fr] gap-y-1.5 text-sm">
                    <dt className="text-[#8c947b]">Role</dt><dd className="text-[#c4c9b8] truncate">{person.job_title || "—"}</dd>
                    <dt className="text-[#8c947b]">Reports to</dt>
                    <dd className="text-[#c4c9b8] truncate">
                        {canSetManager ? (
                            <select
                                aria-label={`Who ${person.name} reports to`}
                                className={`${INPUT_CLASS} py-1`}
                                value={person.reports_to || ""}
                                onChange={(e) => onSetManager(e.target.value || null)}
                            >
                                <option value="">No one</option>
                                {people.filter((p) => p.id !== person.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        ) : (manager?.name || "—")}
                    </dd>
                    <dt className="text-[#8c947b]">Department</dt><dd className="text-[#c4c9b8] truncate">{person.teams[0]?.name || "—"}</dd>
                </dl>
            </DrawerSection>
        </aside>
    )
}

export function EditProfileForm({ person, onSave, onClose }) {
    const [form, setForm] = useState({
        name: person.name || "",
        job_title: person.job_title || "",
        location: person.location || "",
        timezone: person.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "",
        description: person.description || "",
    })
    const [avatarFile, setAvatarFile] = useState(null)
    const [errorMsg, setErrorMsg] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

    const handleAvatar = (e) => {
        const file = e.target.files?.[0] || null
        const invalid = file && validateImage(file)
        setErrorMsg(invalid || "")
        setAvatarFile(invalid ? null : file)
        if (invalid) e.target.value = ""
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.name.trim()) {
            setErrorMsg("Add your name.")
            return
        }
        setIsSaving(true)
        const fields = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]))
        const error = await onSave({ ...fields, name: form.name.trim() }, avatarFile)
        setIsSaving(false)
        if (error) setErrorMsg("Couldn't save your profile. Please try again.")
    }

    return (
        <Modal title="Edit your profile" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Photo" hint="JPG, PNG, WebP or GIF, up to 5 MB.">
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleAvatar} className="text-xs text-[#c4c9b8]" />
                </Field>
                <Field label="Name"><input className={INPUT_CLASS} value={form.name} onChange={set("name")} maxLength={100} required /></Field>
                <Field label="Job title"><input className={INPUT_CLASS} value={form.job_title} onChange={set("job_title")} maxLength={100} placeholder="e.g. Product Designer" /></Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Location"><input className={INPUT_CLASS} value={form.location} onChange={set("location")} maxLength={100} placeholder="e.g. Lagos, Nigeria" /></Field>
                    <Field label="Time zone">
                        <select className={INPUT_CLASS} value={form.timezone} onChange={set("timezone")}>
                            <option value="">Not set</option>
                            {/* The browser's own zone (e.g. "UTC") can be missing from the list */}
                            {form.timezone && !TIME_ZONES.includes(form.timezone) && <option value={form.timezone}>{form.timezone}</option>}
                            {TIME_ZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                    </Field>
                </div>
                <Field label="About"><textarea className={`${INPUT_CLASS} min-h-[90px]`} value={form.description} onChange={set("description")} maxLength={1000} /></Field>
                {errorMsg && <ErrorNote>{errorMsg}</ErrorNote>}
                <div className="flex justify-end">
                    <PrimaryButton type="submit" icon="save" disabled={isSaving}>{isSaving ? "Saving…" : "Save"}</PrimaryButton>
                </div>
            </form>
        </Modal>
    )
}
