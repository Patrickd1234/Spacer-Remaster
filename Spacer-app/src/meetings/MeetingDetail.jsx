import { useEffect, useState } from "react"
import { Modal, Avatar, ErrorNote } from "../general/GeneralParts"
import { eventStart, formatEventTime, meetingPlatform } from "../general/generalFormat"
import { fetchAttendees } from "./meetingData"
import { baseEventId, repeatLabel } from "./meetingFormat"

function DetailRow({ icon, children }) {
    return <p className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px] text-muted">{icon}</span>{children}</p>
}

function GuestList({ attendees, selfId }) {
    if (attendees === null) return <p className="text-xs text-muted">Loading guests…</p>
    if (attendees.length === 0) return <p className="text-xs text-muted">No guests.</p>
    return (
        <ul className="flex flex-wrap gap-2">
            {attendees.map((a) => (
                <li key={`${a.kind}:${a.id}`} className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-raised border border-line text-xs text-white">
                    {a.kind === "team"
                        ? <span className="material-symbols-outlined text-[15px] text-blue-300 px-0.5">groups</span>
                        : <Avatar name={a.name} size="xs" />}
                    {a.kind === "user" && a.id === selfId ? "You" : a.name}
                </li>
            ))}
        </ul>
    )
}

// A scheduled meeting: when, link, agenda and guests. The organizer can edit
// or delete it (every repeat at once).
export default function MeetingDetail({ event, selfId, onEdit, onDelete, onClose }) {
    const [attendees, setAttendees] = useState(null)
    const [loadError, setLoadError] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const eventId = baseEventId(event)
    const isOrganizer = Boolean(selfId) && event.created_by === selfId
    const platform = meetingPlatform(event.external_url)
    const repeat = event.repeat && event.repeat !== "none" ? repeatLabel(event) : null

    useEffect(() => {
        let active = true
        fetchAttendees(eventId).then(({ data, error }) => {
            if (!active) return
            setLoadError(Boolean(error))
            setAttendees(data)
        })
        return () => { active = false }
    }, [eventId])

    const handleDelete = async () => {
        const message = repeat ? "Delete this meeting and all its repeats?" : "Delete this meeting?"
        if (!window.confirm(message)) return
        setIsDeleting(true)
        const failed = await onDelete(eventId)
        if (failed) setIsDeleting(false)
    }

    return (
        <Modal title={event.title} onClose={onClose}>
            <div className="space-y-4 text-sm text-soft">
                <div className="space-y-2">
                    <DetailRow icon="calendar_today">{eventStart(event).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</DetailRow>
                    <DetailRow icon="schedule">{formatEventTime(event)}</DetailRow>
                    {repeat && <DetailRow icon="repeat">{repeat}</DetailRow>}
                    {platform && (
                        <a href={event.external_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-accent-ink hover:underline">
                            <span className="material-symbols-outlined text-[16px]">videocam</span>Join on {platform}
                        </a>
                    )}
                </div>
                {event.description && <p className="whitespace-pre-line pt-3 border-t border-line">{event.description}</p>}
                {event.agenda?.length > 0 && (
                    <section className="pt-3 border-t border-line space-y-2">
                        <h3 className="text-xs font-semibold text-white">Agenda</h3>
                        <ul className="space-y-1.5">
                            {event.agenda.map((item, i) => (
                                <li key={i} className="flex items-center gap-2">
                                    <span className={`material-symbols-outlined text-[16px] ${item.done ? "text-accent-ink" : "text-muted"}`}>{item.done ? "check_box" : "check_box_outline_blank"}</span>
                                    <span className={item.done ? "line-through text-muted" : ""}>{item.text}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
                <section className="pt-3 border-t border-line space-y-2">
                    <h3 className="text-xs font-semibold text-white">Guests{attendees ? ` (${attendees.length})` : ""}</h3>
                    {loadError ? <ErrorNote>Couldn't load the guest list.</ErrorNote> : <GuestList attendees={attendees} selfId={selfId} />}
                </section>
                {isOrganizer && (
                    <div className="flex gap-2 pt-3 border-t border-line">
                        <button type="button" onClick={() => onEdit(eventId)} className="text-xs hover:text-white flex items-center gap-1 cursor-pointer"><span className="material-symbols-outlined text-[16px]">edit</span>Edit meeting</button>
                        <button type="button" onClick={handleDelete} disabled={isDeleting} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer ml-auto disabled:opacity-50">
                            <span className="material-symbols-outlined text-[16px]">delete</span>{isDeleting ? "Deleting…" : "Delete"}
                        </button>
                    </div>
                )}
            </div>
        </Modal>
    )
}
