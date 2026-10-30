import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { filterPeople, sortPeople } from "./generalFormat"
import { fetchPeople, updateMyProfile, updateMyAvatar, setReportsTo } from "./generalData"
import { useMyProfile } from "./useMyProfile"
import { GeneralShell, PageHeading, ErrorNote, INPUT_CLASS } from "./GeneralParts"
import { PanelMessage } from "../components/DashboardParts"
import { PersonCard, PersonRow, ProfileDrawer, EditProfileForm } from "./DirectoryParts"

const LAYOUT_KEY = "directory_layout"

function readLayout() {
    try {
        return localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid"
    } catch {
        return "grid"
    }
}

// Screen 4: everyone in the organization. ?person=<id> opens a profile drawer;
// search, filters and layout stay as they were when it closes.
export default function Directory() {
    const { profile, canManage, reload: reloadProfile } = useMyProfile()
    const [searchParams, setSearchParams] = useSearchParams()
    const [people, setPeople] = useState([])
    const [teams, setTeams] = useState([])
    const [status, setStatus] = useState("loading")
    const [query, setQuery] = useState("")
    const [teamId, setTeamId] = useState("all")
    const [jobTitle, setJobTitle] = useState("all")
    const [order, setOrder] = useState("az")
    const [layout, setLayout] = useState(readLayout)
    const [isEditing, setIsEditing] = useState(false)
    const [actionError, setActionError] = useState("")

    const load = useCallback(async () => {
        const result = await fetchPeople()
        setPeople(result.data)
        setTeams(result.teams)
        setStatus(result.error ? "error" : "ready")
    }, [])

    useEffect(() => {
        let active = true
        fetchPeople().then((result) => {
            if (!active) return
            setPeople(result.data)
            setTeams(result.teams)
            setStatus(result.error ? "error" : "ready")
        })
        return () => { active = false }
    }, [])

    const changeLayout = (next) => {
        setLayout(next)
        try { localStorage.setItem(LAYOUT_KEY, next) } catch { /* private mode: layout just isn't remembered */ }
    }

    const jobTitles = useMemo(() => [...new Set(people.map((p) => p.job_title).filter(Boolean))].sort(), [people])
    const visible = useMemo(() => sortPeople(filterPeople(people, { query, teamId, jobTitle }), order), [people, query, teamId, jobTitle, order])
    const selected = people.find((p) => p.id === searchParams.get("person")) || null
    const open = (id) => setSearchParams({ person: id }, { replace: true })
    const close = useCallback(() => setSearchParams({}, { replace: true }), [setSearchParams])

    const handleSaveProfile = async (fields, avatarFile) => {
        const saved = await updateMyProfile(profile.id, fields)
        if (saved.error) return saved.error
        if (avatarFile) {
            const uploaded = await updateMyAvatar(profile, avatarFile)
            if (uploaded.error) {
                // The text fields did save; show them even though the photo didn't
                await load()
                return uploaded.error
            }
        }
        setIsEditing(false)
        await Promise.all([load(), reloadProfile()])
        return null
    }

    const handleSetManager = async (managerId) => {
        setActionError("")
        const { error } = await setReportsTo(selected.id, managerId)
        if (error) setActionError("Couldn't change who they report to.")
        await load()
    }

    const openChat = (person) => window.dispatchEvent(new CustomEvent("open_coworker_chat", { detail: { user_id: person.id, name: person.name } }))

    return (
        <GeneralShell page="Directory">
            <PageHeading
                title="People Directory"
                subtitle="Find colleagues and learn more about the people across your organization."
                actions={status === "ready" && <span className="text-xs text-[#8c947b]">{people.length} member{people.length === 1 ? "" : "s"}</span>}
            />

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                    <span className="material-symbols-outlined absolute left-3 top-2 text-[18px] text-[#8c947b]">search</span>
                    <input
                        type="search"
                        aria-label="Search by name, role, or team"
                        placeholder="Search by name, role, or team…"
                        className={`${INPUT_CLASS} pl-9`}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
                <select aria-label="Filter by team" className={`${INPUT_CLASS} w-auto`} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                    <option value="all">All Teams</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select aria-label="Filter by role" className={`${INPUT_CLASS} w-auto`} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}>
                    <option value="all">All Roles</option>
                    {jobTitles.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select aria-label="Sort" className={`${INPUT_CLASS} w-auto`} value={order} onChange={(e) => setOrder(e.target.value)}>
                    <option value="az">A–Z</option>
                    <option value="za">Z–A</option>
                </select>
                <div className="flex rounded-lg border border-[#2D3139] overflow-hidden" role="group" aria-label="Layout">
                    {[["grid", "grid_view"], ["list", "view_list"]].map(([value, icon]) => (
                        <button
                            key={value}
                            type="button"
                            aria-label={`${value} layout`}
                            aria-pressed={layout === value}
                            onClick={() => changeLayout(value)}
                            className={`px-2.5 py-1.5 cursor-pointer ${layout === value ? "bg-[#aff82a] text-[#1C1F26]" : "text-[#8c947b] hover:text-white"}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">{icon}</span>
                        </button>
                    ))}
                </div>
            </div>

            {status === "error" && <ErrorNote onRetry={load}>Couldn't load the directory.</ErrorNote>}
            {actionError && <ErrorNote>{actionError}</ErrorNote>}

            <div className="grid grid-cols-12 gap-4 items-start">
                <section className={selected ? "col-span-12 lg:col-span-8" : "col-span-12"}>
                    {status === "loading" && <p className="text-sm text-[#8c947b] py-6">Loading…</p>}
                    {status === "ready" && visible.length === 0 && (
                        <PanelMessage icon="person_search" title="No one matches" text="Try a different name, team or role." />
                    )}
                    {layout === "grid" ? (
                        <div className={`grid gap-3 grid-cols-1 sm:grid-cols-2 ${selected ? "xl:grid-cols-3" : "lg:grid-cols-3 xl:grid-cols-4"}`}>
                            {visible.map((p) => <PersonCard key={p.id} person={p} isSelected={selected?.id === p.id} onOpen={() => open(p.id)} />)}
                        </div>
                    ) : (
                        visible.length > 0 && (
                            <div className="rounded-xl border border-[#2D3139] bg-[#14161b] overflow-hidden">
                                {visible.map((p) => <PersonRow key={p.id} person={p} isSelected={selected?.id === p.id} onOpen={() => open(p.id)} />)}
                            </div>
                        )
                    )}
                </section>
                {selected && (
                    <div className="col-span-12 lg:col-span-4">
                        <ProfileDrawer
                            person={selected}
                            people={people}
                            isMe={selected.id === profile?.id}
                            canSetManager={canManage}
                            onClose={close}
                            onMessage={() => openChat(selected)}
                            onEdit={() => setIsEditing(true)}
                            onSetManager={handleSetManager}
                        />
                    </div>
                )}
            </div>

            {isEditing && selected && <EditProfileForm person={selected} onSave={handleSaveProfile} onClose={() => setIsEditing(false)} />}
        </GeneralShell>
    )
}
