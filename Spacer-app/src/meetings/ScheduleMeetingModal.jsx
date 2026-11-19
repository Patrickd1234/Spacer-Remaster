import { useEffect, useRef, useState } from "react"
import { ErrorNote } from "../general/GeneralParts"
import { isHttpsUrl } from "../general/generalFormat"
import { fetchInvitees, fetchAttendees, createMeeting, updateMeeting } from "./meetingData"
import { newMeetingForm, editMeetingForm, validateMeeting, durationOptions, repeatOptions, DESCRIPTION_MAX } from "./meetingFormat"
import { FIELD_CLASS, FieldLabel, PickerInput, IconSelect, MeetingLinkField } from "./MeetingFields"
import AttendeePicker from "./AttendeePicker"
import AgendaEditor from "./AgendaEditor"

const formatDay = (key) => (key ? new Date(`${key}T00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "")
const formatTime = (time) => (time ? new Date(`2000-01-01T${time}`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "")

// Postgres / PostgREST errors in words the organizer can act on
function saveErrorMessage(error, isNew) {
    if (error?.code === "PGRST204" || error?.code === "42703" || error?.code === "PGRST205") {
        return "Meetings need a database update first. Ask an admin to apply it."
    }
    if (error?.code === "42501") return "You don't have permission to change this meeting."
    return isNew ? "Couldn't schedule the meeting. Please try again." : "Couldn't save your changes. Please try again."
}

function SectionHeading({ icon, children, action = null }) {
    return (
        <div className="flex items-center justify-between gap-2 mb-2.5">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-white">
                <span className="material-symbols-outlined text-[16px] text-soft">{icon}</span>
                {children}
            </h3>
            {action}
        </div>
    )
}

// Schedule a meeting (event null) or edit one the viewer organized.
// organizer: { id, organization_id }; onSaved gets the saved event row.
export default function ScheduleMeetingModal({ organizer, event = null, defaultDate = new Date(), onClose, onSaved }) {
    const isNew = !event
    const [invitees, setInvitees] = useState({ people: [], teams: [], isLoading: true })
    const [storedAttendees, setStoredAttendees] = useState([])
    const [form, setForm] = useState(() => (isNew ? newMeetingForm(defaultDate) : null))
    const [linkDraft, setLinkDraft] = useState("")
    const [errorMsg, setErrorMsg] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const attendeeInputRef = useRef(null)
    const eventId = event?.id ?? null

    useEffect(() => {
        let active = true
        fetchInvitees().then(async ({ data, error }) => {
            if (!active) return
            if (error) setErrorMsg("Couldn't load people to invite. Close and try again.")
            setInvitees({ ...data, isLoading: false })
            if (!eventId) return
            const { data: attendees, error: attendeeError } = await fetchAttendees(eventId, data.teams)
            if (!active) return
            // Without the stored guest list a save would re-add everyone, so don't offer the form
            if (attendeeError) {
                setErrorMsg("Couldn't load the guest list. Close and try again.")
                return
            }
            setStoredAttendees(attendees)
            setForm(editMeetingForm(event, attendees, organizer?.id))
        })
        return () => { active = false }
        // Loads once per dialog; `event` and `organizer` don't change while it is open
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId])

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape" && !e.defaultPrevented && !isSaving) onClose() }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onClose, isSaving])

    const change = (key) => (e) => {
        const value = e.target.type === "checkbox" ? e.target.checked : e.target.value
        setForm((f) => ({ ...f, [key]: key === "duration" ? Number(value) : value }))
    }
    const setField = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

    const addLink = () => {
        const url = linkDraft.trim()
        if (!url) return
        if (!isHttpsUrl(url)) {
            setErrorMsg("Meeting links must start with https://")
            return
        }
        setErrorMsg("")
        setForm((f) => ({ ...f, meetingUrl: url }))
        setLinkDraft("")
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form || isSaving) return
        // A pasted link counts even if "Add link" wasn't pressed
        const toSave = !form.meetingUrl && linkDraft.trim() ? { ...form, meetingUrl: linkDraft.trim() } : form
        const invalid = !organizer ? "Still loading your account. Try again in a moment." : validateMeeting(toSave, new Date(), { isNew })
        setErrorMsg(invalid || "")
        if (invalid) return
        setIsSaving(true)
        const { data, error } = isNew
            ? await createMeeting(organizer, toSave)
            : await updateMeeting(eventId, organizer.id, toSave, storedAttendees)
        setIsSaving(false)
        if (error && !data) {
            setErrorMsg(saveErrorMessage(error, isNew))
            return
        }
        // error with data: the meeting saved but part of the guest list didn't
        onSaved(data, { isNew, hasGuestListError: Boolean(error) })
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !isSaving && onClose()}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="schedule-meeting-title"
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-panel border border-line rounded-2xl shadow-2xl"
            >
                <header className="flex items-start gap-4 px-6 pt-6 pb-5">
                    <span className="w-11 h-11 shrink-0 rounded-xl bg-violet-500/15 border border-violet-400/25 flex items-center justify-center text-violet-300" aria-hidden="true">
                        <span className="material-symbols-outlined text-[22px]">calendar_month</span>
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 id="schedule-meeting-title" className="text-xl font-semibold text-white tracking-tight">{isNew ? "Schedule a Meeting" : "Edit Meeting"}</h2>
                        <p className="text-[13px] text-soft mt-0.5">Create a meeting, invite teammates, and add an agenda.</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={isSaving} aria-label="Close" className="text-muted hover:text-white transition-colors cursor-pointer">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </header>

                {form ? (
                    <MeetingForm
                        form={form}
                        invitees={invitees}
                        organizerId={organizer?.id}
                        attendeeInputRef={attendeeInputRef}
                        linkDraft={linkDraft}
                        onLinkDraftChange={setLinkDraft}
                        onAddLink={addLink}
                        change={change}
                        setField={setField}
                        errorMsg={errorMsg}
                        isSaving={isSaving}
                        isNew={isNew}
                        onCancel={onClose}
                        onSubmit={handleSubmit}
                    />
                ) : (
                    <div className="px-6 pb-8 space-y-3" aria-busy="true">
                        {errorMsg ? <ErrorNote>{errorMsg}</ErrorNote> : <p className="text-sm text-muted">Loading meeting…</p>}
                    </div>
                )}
            </div>
        </div>
    )
}

function MeetingForm({ form, invitees, organizerId, attendeeInputRef, linkDraft, onLinkDraftChange, onAddLink, change, setField, errorMsg, isSaving, isNew, onCancel, onSubmit }) {
    return (
        <form onSubmit={onSubmit} noValidate className="flex flex-col min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] overflow-y-auto border-t border-line md:border-t-0">
                <div className="px-6 pt-5 md:pt-1 pb-6 space-y-4">
                    <div>
                        <FieldLabel htmlFor="meeting-title" isRequired>Meeting title</FieldLabel>
                        <input id="meeting-title" autoFocus className={FIELD_CLASS} value={form.title} onChange={change("title")} maxLength={200} placeholder="e.g. Project Sync" required />
                    </div>
                    <div>
                        <FieldLabel htmlFor="meeting-description">Description (optional)</FieldLabel>
                        <textarea
                            id="meeting-description"
                            className={`${FIELD_CLASS} min-h-[84px] resize-none`}
                            value={form.description}
                            onChange={change("description")}
                            maxLength={DESCRIPTION_MAX}
                            placeholder="Add a brief description, context, or key topics…"
                        />
                        <p className="text-right text-[11px] text-muted mt-1" aria-live="polite">{form.description.length}/{DESCRIPTION_MAX}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <FieldLabel htmlFor="meeting-date" isRequired>Date</FieldLabel>
                            <PickerInput id="meeting-date" type="date" icon="calendar_today" value={form.date} display={formatDay(form.date)} onChange={change("date")} isRequired />
                        </div>
                        <div>
                            <FieldLabel htmlFor="meeting-time" isRequired>Time</FieldLabel>
                            <PickerInput id="meeting-time" type="time" icon="schedule" value={form.time} display={formatTime(form.time)} onChange={change("time")} isRequired />
                        </div>
                        <div>
                            <FieldLabel htmlFor="meeting-duration" isRequired>Duration</FieldLabel>
                            <IconSelect id="meeting-duration" icon="timer" label="Duration" value={form.duration} onChange={change("duration")} options={durationOptions(form.duration)} />
                        </div>
                    </div>
                    <div>
                        <FieldLabel htmlFor="meeting-link" icon="link">Meeting link (optional)</FieldLabel>
                        <MeetingLinkField
                            id="meeting-link"
                            url={form.meetingUrl}
                            draft={linkDraft}
                            onDraftChange={onLinkDraftChange}
                            onAdd={onAddLink}
                            onRemove={() => setField("meetingUrl")("")}
                        />
                    </div>
                    <div className="sm:w-1/2">
                        <FieldLabel htmlFor="meeting-repeat">Repeat</FieldLabel>
                        <IconSelect id="meeting-repeat" label="Repeat" value={form.repeat} onChange={change("repeat")} options={repeatOptions(form.date)} />
                    </div>
                    <label className="inline-flex items-center gap-2 text-[13px] text-white cursor-pointer pt-1">
                        <input type="checkbox" checked={form.addToMyCalendar} onChange={change("addToMyCalendar")} className="w-4 h-4 rounded accent-[rgb(var(--c-accent))] cursor-pointer" />
                        <span className="material-symbols-outlined text-[16px] text-accent-ink">event_available</span>
                        Add to my calendar
                    </label>
                </div>

                <div className="px-6 pt-5 md:pt-1 pb-6 border-t md:border-t-0 md:border-l border-line space-y-6">
                    <section aria-label="Attendees">
                        <SectionHeading
                            icon="group"
                            action={(
                                <button type="button" onClick={() => attendeeInputRef.current?.focus()} className="flex items-center gap-1 text-xs font-medium text-accent-ink hover:underline cursor-pointer">
                                    <span className="material-symbols-outlined text-[16px]">add</span>Add attendees
                                </button>
                            )}
                        >
                            Attendees ({form.attendees.length})
                        </SectionHeading>
                        <AttendeePicker
                            people={invitees.people}
                            teams={invitees.teams}
                            selfId={organizerId}
                            value={form.attendees}
                            onChange={setField("attendees")}
                            isLoading={invitees.isLoading}
                            inputRef={attendeeInputRef}
                        />
                    </section>
                    <section aria-label="Agenda" className="border-t border-line pt-5">
                        <SectionHeading icon="format_list_bulleted">Agenda</SectionHeading>
                        <AgendaEditor items={form.agenda} onChange={setField("agenda")} />
                    </section>
                </div>
            </div>

            <footer className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-line">
                {errorMsg && <div className="mr-auto"><ErrorNote>{errorMsg}</ErrorNote></div>}
                <button type="button" onClick={onCancel} disabled={isSaving} className="px-4 py-2 rounded-lg border border-line hover:border-line-strong bg-raised text-[13px] font-medium text-white transition-colors cursor-pointer disabled:opacity-50">
                    Cancel
                </button>
                <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-on-accent text-[13px] font-semibold shadow-[0_0_0_1px_rgb(var(--c-accent)/0.4),0_8px_24px_-8px_rgb(var(--c-accent)/0.6)] transition-colors cursor-pointer disabled:opacity-60">
                    {isSaving ? (isNew ? "Scheduling…" : "Saving…") : (isNew ? "Schedule meeting" : "Save changes")}
                </button>
            </footer>
        </form>
    )
}
