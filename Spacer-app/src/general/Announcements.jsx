import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { ANNOUNCEMENT_CATEGORIES, filterAnnouncements, sortAnnouncements } from "./generalFormat"
import { fetchAnnouncements, createAnnouncement, setAnnouncementPinned, deleteAnnouncement } from "./generalData"
import { useMyProfile } from "./useMyProfile"
import { useRole } from "../RoleContext"
import { GeneralShell, PageHeading, PrimaryButton, Chip, ErrorNote, COMPACT_SELECT_CLASS } from "./GeneralParts"
import { PanelMessage } from "../components/DashboardParts"
import { AnnouncementCard, AnnouncementRow, AnnouncementDetail, AnnouncementForm } from "./AnnouncementParts"
import Select from "../components/Select"

const FILTERS = [{ value: "all", label: "All" }, { value: "pinned", label: "Pinned" }, ...ANNOUNCEMENT_CATEGORIES]

// Screen 2: organization-wide news. ?id=<announcement> opens one directly
// (the Overview links here that way).
export default function Announcements() {
    const { profile } = useMyProfile()
    const canManage = useRole().can("announcement.manage")
    const [searchParams, setSearchParams] = useSearchParams()
    const [announcements, setAnnouncements] = useState([])
    const [status, setStatus] = useState("loading") // loading | ready | error
    const [filter, setFilter] = useState("all")
    const [sort, setSort] = useState("latest")
    const [isCreating, setIsCreating] = useState(false)
    const [busyId, setBusyId] = useState(null)
    const [actionError, setActionError] = useState("")

    const load = useCallback(async () => {
        const { data, error } = await fetchAnnouncements()
        setAnnouncements(data)
        setStatus(error ? "error" : "ready")
    }, [])

    useEffect(() => {
        let active = true
        fetchAnnouncements().then(({ data, error }) => {
            if (!active) return
            setAnnouncements(data)
            setStatus(error ? "error" : "ready")
        })
        return () => { active = false }
    }, [])

    const visible = useMemo(() => sortAnnouncements(filterAnnouncements(announcements, filter), sort), [announcements, filter, sort])
    const pinned = useMemo(() => sortAnnouncements(announcements.filter((a) => a.pinned), "latest"), [announcements])
    const selectedId = searchParams.get("id")
    const selected = announcements.find((a) => a.id === selectedId) || visible[0] || null
    const select = (id) => setSearchParams({ id }, { replace: true })
    const canEdit = (a) => canManage || a.author_id === profile?.id

    const handleCreate = async (form) => {
        const { data, error } = await createAnnouncement(profile, form)
        if (error) return error
        setIsCreating(false)
        await load()
        select(data.id)
        return null
    }

    const runAction = async (announcement, action) => {
        setBusyId(announcement.id)
        setActionError("")
        const { error } = await action()
        setBusyId(null)
        if (error) setActionError("That didn't work. Please try again.")
        else await load()
    }

    const handleDelete = (announcement) => {
        if (!window.confirm(`Delete "${announcement.title}"? This can't be undone.`)) return
        runAction(announcement, () => deleteAnnouncement(announcement))
    }

    return (
        <GeneralShell page="Announcements">
            <PageHeading
                title="Announcements"
                subtitle="Important updates and news from your organization."
                actions={canManage && profile && <PrimaryButton icon="add" onClick={() => setIsCreating(true)}>Create Announcement</PrimaryButton>}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filter announcements">
                    {FILTERS.map((f) => <Chip key={f.value} isActive={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</Chip>)}
                </div>
                <label className="flex items-center gap-2 text-xs text-muted">
                    Sort
                    <Select className={`${COMPACT_SELECT_CLASS} py-1.5`} value={sort} onChange={(e) => setSort(e.target.value)}>
                        <option value="latest">Latest</option>
                        <option value="oldest">Oldest</option>
                    </Select>
                </label>
            </div>

            {status === "error" && <ErrorNote onRetry={load}>Couldn't load announcements.</ErrorNote>}
            {actionError && <ErrorNote>{actionError}</ErrorNote>}

            {filter === "all" && pinned.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">push_pin</span>Pinned Announcements ({pinned.length})
                    </h2>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {pinned.slice(0, 4).map((a) => <AnnouncementCard key={a.id} announcement={a} onOpen={() => select(a.id)} />)}
                    </div>
                </section>
            )}

            <div className="grid grid-cols-12 gap-4">
                <section className="col-span-12 lg:col-span-7 bg-panel border border-line rounded-xl p-3 space-y-1">
                    <h2 className="text-sm font-semibold text-white px-2 py-1">
                        {filter === "all" ? "All Announcements" : FILTERS.find((f) => f.value === filter).label} ({visible.length})
                    </h2>
                    {status === "loading" && <p className="text-sm text-muted px-2 py-6">Loading…</p>}
                    {status === "ready" && visible.length === 0 && (
                        <PanelMessage icon="campaign" title="No announcements yet" text={canManage ? "Share news with everyone using Create Announcement." : "Announcements from your organization will appear here."} />
                    )}
                    {visible.map((a) => <AnnouncementRow key={a.id} announcement={a} isSelected={selected?.id === a.id} onSelect={() => select(a.id)} />)}
                </section>
                <div className="col-span-12 lg:col-span-5">
                    {selected && (
                        <AnnouncementDetail
                            announcement={selected}
                            canEdit={canEdit(selected)}
                            isBusy={busyId === selected.id}
                            onTogglePin={() => runAction(selected, () => setAnnouncementPinned(selected.id, !selected.pinned))}
                            onDelete={() => handleDelete(selected)}
                        />
                    )}
                </div>
            </div>

            {isCreating && <AnnouncementForm onSubmit={handleCreate} onClose={() => setIsCreating(false)} />}
        </GeneralShell>
    )
}
