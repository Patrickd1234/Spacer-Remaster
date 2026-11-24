import { useEffect, useRef, useState } from "react"
import { Avatar, Modal, Field, INPUT_CLASS, PrimaryButton, SecondaryButton, ErrorNote } from "./GeneralParts"
import PhotoField from "../avatars/PhotoField"
import Select from "../components/Select"
import { RemoveFromOrganizationButton } from "../components/OrgExitControls"
import { roleKey, roleName } from "../permissions"
import { canEditRoles } from "./roleAssignment"
import RoleEditor from "./RoleEditor"
import AwayBadge, { AwayDot } from "../availability/AwayBadge"
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
                <span key={t.id} className="px-2 py-0.5 rounded-md border border-line bg-raised text-[11px] text-soft">{t.name}</span>
            ))}
            {teams.length > MAX_TAGS && <span className="px-1 text-[11px] text-muted">+{teams.length - MAX_TAGS}</span>}
        </div>
    )
}

// "Filters" button with Team and Role inside; the badge counts active filters.
// Closes on Escape or a click outside.
export function FilterMenu({ teams, jobTitles, teamId, jobTitle, onTeamChange, onJobTitleChange, onClear }) {
    const menuRef = useRef(null)
    const [isOpen, setIsOpen] = useState(false)
    const activeCount = (teamId !== "all" ? 1 : 0) + (jobTitle !== "all" ? 1 : 0)

    useEffect(() => {
        if (!isOpen) return
        const onPointer = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setIsOpen(false) }
        const onKey = (e) => { if (e.key === "Escape") setIsOpen(false) }
        document.addEventListener("mousedown", onPointer)
        window.addEventListener("keydown", onKey)
        return () => {
            document.removeEventListener("mousedown", onPointer)
            window.removeEventListener("keydown", onKey)
        }
    }, [isOpen])

    return (
        <div className="relative" ref={menuRef}>
            <button
                type="button"
                onClick={() => setIsOpen((open) => !open)}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors cursor-pointer ${activeCount > 0 ? "border-accent-ink/60 text-white" : "border-line text-soft hover:text-white hover:border-line-strong"}`}
            >
                <span className="material-symbols-outlined text-[18px]">filter_list</span>
                Filters
                {activeCount > 0 && (
                    <span className="min-w-5 h-5 px-1 rounded-full bg-accent text-on-accent text-[11px] font-semibold flex items-center justify-center">{activeCount}</span>
                )}
            </button>
            {isOpen && (
                <div role="dialog" aria-label="Filter people" className="font-body-md absolute right-0 top-full mt-2 z-30 w-72 bg-panel border border-line rounded-xl p-4 space-y-4 shadow-xl shadow-black/40">
                    <Field label="Team">
                        <Select className={INPUT_CLASS} value={teamId} onChange={(e) => onTeamChange(e.target.value)}>
                            <option value="all">All teams</option>
                            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </Select>
                    </Field>
                    <Field label="Role">
                        <Select className={INPUT_CLASS} value={jobTitle} onChange={(e) => onJobTitleChange(e.target.value)}>
                            <option value="all">All roles</option>
                            {jobTitles.map((t) => <option key={t} value={t}>{t}</option>)}
                        </Select>
                    </Field>
                    <div className="flex justify-between items-center pt-1">
                        <button type="button" onClick={onClear} disabled={activeCount === 0} className="text-xs text-muted hover:text-white disabled:opacity-40 disabled:hover:text-muted cursor-pointer disabled:cursor-default">
                            Clear filters
                        </button>
                        <button type="button" onClick={() => setIsOpen(false)} className="text-xs font-medium text-accent-ink hover:underline cursor-pointer">Done</button>
                    </div>
                </div>
            )}
        </div>
    )
}

// Removable chips for the filters in use; nothing when none are
export function ActiveFilters({ filters, onClearAll }) {
    if (filters.length === 0) return null
    return (
        <div className="flex flex-wrap items-center gap-2">
            {filters.map((f) => (
                <span key={f.key} className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-accent/10 border border-accent-ink/30 text-xs text-accent-ink">
                    {f.label}
                    <button type="button" onClick={f.onRemove} aria-label={`Remove filter ${f.label}`} className="flex items-center rounded-full hover:bg-accent/20 cursor-pointer">
                        <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                </span>
            ))}
            {filters.length > 1 && (
                <button type="button" onClick={onClearAll} className="text-xs text-muted hover:text-white cursor-pointer">Clear all</button>
            )}
        </div>
    )
}

export function PersonCard({ person, isSelected, onOpen }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-current={isSelected ? "true" : undefined}
            className={`w-full text-left p-4 rounded-xl border bg-panel transition-colors cursor-pointer flex flex-col items-start gap-2 ${isSelected ? "border-accent-ink/60" : "border-line hover:border-line-strong"}`}
        >
            <span className="relative inline-flex shrink-0"><Avatar name={person.name} url={person.avatarUrl} size="lg" /><AwayDot person={person} isDecorative /></span>
            <div className="min-w-0 w-full">
                <p className="text-sm font-semibold text-white truncate">{person.name}</p>
                <p className="text-xs text-muted truncate">{person.job_title || "No title yet"}</p>
            </div>
            <AwayBadge person={person} />
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
            className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-line last:border-b-0 transition-colors cursor-pointer ${isSelected ? "bg-raised" : "hover:bg-raised"}`}
        >
            <span className="relative inline-flex shrink-0"><Avatar name={person.name} url={person.avatarUrl} /><AwayDot person={person} isDecorative /></span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{person.name}</p>
                <p className="text-xs text-muted truncate">{person.job_title || "No title yet"}</p>
            </div>
            <AwayBadge person={person} />
            <div className="hidden md:block"><TeamTags teams={person.teams} /></div>
        </button>
    )
}

function DrawerSection({ title, children }) {
    return (
        <section className="space-y-2 pt-4 border-t border-line">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
            {children}
        </section>
    )
}

function InfoLine({ icon, children }) {
    return <p className="flex items-center gap-2 text-sm text-soft min-w-0"><span className="material-symbols-outlined text-[16px] text-muted">{icon}</span><span className="truncate">{children}</span></p>
}

// Right-side profile drawer. Shows only what the viewer's access returns.
export function ProfileDrawer({ person, people, isMe, canSetManager, canRemove, canAssignRoles = false, departments = [], onClose, onMessage, onEdit, onSetManager, onRemoved, onRolesChanged }) {
    const manager = people.find((p) => p.id === person.reports_to)
    const time = localTime(person.timezone)
    const showRoleEditor = canEditRoles({ person, viewerId: isMe ? person.id : null, canAssign: canAssignRoles })

    useEffect(() => {
        // An open dialog (Edit profile) handles Escape itself
        const onKey = (e) => { if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) onClose() }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onClose])

    return (
        <aside aria-label={`${person.name}'s profile`} className="bg-panel border border-line rounded-xl p-5 space-y-4 lg:sticky lg:top-20">
            <div className="flex items-start justify-between">
                <Avatar name={person.name} url={person.avatarUrl} size="lg" />
                <button type="button" onClick={onClose} aria-label="Close profile" className="text-muted hover:text-white cursor-pointer">
                    <span className="material-symbols-outlined">close</span>
                </button>
            </div>
            <div>
                <h2 className="text-lg font-semibold text-white">{person.name}</h2>
                <p className="text-sm text-muted">{person.job_title || "No title yet"}</p>
                {/* The note shows in the tooltip and, here, in full */}
                <AwayBadge person={person} className="mt-2" />
                {person.away_back_on && person.away_note && <p className="text-xs text-muted mt-1">{person.away_note}</p>}
            </div>
            <TeamTags teams={person.teams} />
            <div className="flex gap-2">
                {isMe
                    ? <SecondaryButton icon="edit" onClick={onEdit}>Edit profile</SecondaryButton>
                    : <PrimaryButton icon="chat" onClick={onMessage}>Message</PrimaryButton>}
            </div>

            <DrawerSection title="About">
                {person.description && <p className="text-sm text-soft whitespace-pre-line">{person.description}</p>}
                <InfoLine icon="mail"><a href={`mailto:${person.email}`} className="hover:text-white hover:underline">{person.email}</a></InfoLine>
                {person.location && <InfoLine icon="location_on">{person.location}</InfoLine>}
                {time && <InfoLine icon="schedule">Local time {time}</InfoLine>}
            </DrawerSection>

            {showRoleEditor ? (
                <DrawerSection title="Roles">
                    <RoleEditor key={person.id} person={person} departments={departments} onChanged={onRolesChanged} />
                </DrawerSection>
            ) : person.teams.length > 0 && (
                <DrawerSection title={`Team Spaces (${person.teams.length})`}>
                    {person.teams.map((t) => (
                        <p key={t.id} className="flex items-center justify-between text-sm text-soft">
                            <span className="truncate">{t.name}</span>
                            <span className="text-[11px] text-muted">{roleName(roleKey(t.id, t.role))}</span>
                        </p>
                    ))}
                </DrawerSection>
            )}

            <DrawerSection title="Role & Reporting">
                <dl className="grid grid-cols-[100px_1fr] gap-y-1.5 text-sm">
                    <dt className="text-muted">Role</dt><dd className="text-soft truncate">{person.job_title || "—"}</dd>
                    <dt className="text-muted">Access</dt><dd className="text-soft truncate">{person.orgRole ? roleName(person.orgRole) : "—"}</dd>
                    <dt className="text-muted">Reports to</dt>
                    <dd className="text-soft truncate">
                        {canSetManager ? (
                            <Select
                                aria-label={`Who ${person.name} reports to`}
                                className={`${INPUT_CLASS} py-1`}
                                value={person.reports_to || ""}
                                onChange={(e) => onSetManager(e.target.value || null)}
                            >
                                <option value="">No one</option>
                                {people.filter((p) => p.id !== person.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </Select>
                        ) : (manager?.name || "—")}
                    </dd>
                    <dt className="text-muted">Department</dt><dd className="text-soft truncate">{person.teams[0]?.name || "—"}</dd>
                </dl>
            </DrawerSection>

            {/* The database also refuses if the person holds an organization role */}
            {canRemove && !isMe && (
                <div className="pt-3 border-t border-line space-y-2">
                    <RemoveFromOrganizationButton key={person.id} person={person} onRemoved={onRemoved} />
                </div>
            )}
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
                {/* The file is kept until Save, so Cancel leaves the photo as it was */}
                <PhotoField name={form.name || person.name} url={person.avatarUrl} onPick={setAvatarFile} />
                <Field label="Name"><input className={INPUT_CLASS} value={form.name} onChange={set("name")} maxLength={100} required /></Field>
                <Field label="Job title"><input className={INPUT_CLASS} value={form.job_title} onChange={set("job_title")} maxLength={100} placeholder="e.g. Product Designer" /></Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Location"><input className={INPUT_CLASS} value={form.location} onChange={set("location")} maxLength={100} placeholder="e.g. Lagos, Nigeria" /></Field>
                    <Field label="Time zone">
                        <Select className={INPUT_CLASS} value={form.timezone} onChange={set("timezone")}>
                            <option value="">Not set</option>
                            {/* The browser's own zone (e.g. "UTC") can be missing from the list */}
                            {form.timezone && !TIME_ZONES.includes(form.timezone) && <option value={form.timezone}>{form.timezone}</option>}
                            {TIME_ZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                        </Select>
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
