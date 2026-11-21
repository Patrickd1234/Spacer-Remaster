import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { filterPeople, sortPeople, scopeDirectory } from "./generalFormat"
import { fetchPeople, fetchDepartments, updateMyProfile, updateMyAvatar, setReportsTo } from "./generalData"
import { useMyProfile } from "./useMyProfile"
import { useRole } from "../RoleContext"
import { GeneralShell, PageHeading, ErrorNote, INPUT_CLASS, COMPACT_SELECT_CLASS } from "./GeneralParts"
import { PanelMessage } from "../components/DashboardParts"
import { PersonCard, PersonRow, ProfileDrawer, EditProfileForm, FilterMenu, ActiveFilters } from "./DirectoryParts"
import Select from "../components/Select"

const LAYOUT_KEY = "directory_layout"

function readLayout() {
    try {
        return localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid"
    } catch {
        return "grid"
    }
}

// Screen 4: the people the viewer may see (see scopeDirectory). ?person=<id> opens a profile drawer;
// search, filters and layout stay as they were when it closes.
export default function Directory() {
    const { profile, error: profileError, reload: reloadProfile } = useMyProfile()
    const [searchParams, setSearchParams] = useSearchParams()
    const { isSuperAdmin, roleLoading, can } = useRole()
    // Everyone in the organization; the drawer still names managers outside the scope
    const [everyone, setEveryone] = useState([])
    const [orgTeams, setOrgTeams] = useState([])
    const [loadStatus, setStatus] = useState("loading")
    const [query, setQuery] = useState("")
    const [teamId, setTeamId] = useState("all")
    const [jobTitle, setJobTitle] = useState("all")
    const [order, setOrder] = useState("az")
    const [layout, setLayout] = useState(readLayout)
    const [isEditing, setIsEditing] = useState(false)
    const [actionError, setActionError] = useState("")

    const load = useCallback(async () => {
        const result = await fetchPeople()
        setEveryone(result.data)
        setOrgTeams(result.teams)
        setStatus(result.error ? "error" : "ready")
    }, [])

    useEffect(() => {
        let active = true
        fetchPeople().then((result) => {
            if (!active) return
            setEveryone(result.data)
            setOrgTeams(result.teams)
            setStatus(result.error ? "error" : "ready")
        })
        return () => { active = false }
    }, [])

    // Every department, for the role editor (only people who may assign roles see it)
    const canAssignRoles = can("member.assign_role")
    const [departments, setDepartments] = useState([])
    useEffect(() => {
        if (!canAssignRoles) return undefined
        let active = true
        fetchDepartments().then((result) => { if (active) setDepartments(result.data) })
        return () => { active = false }
    }, [canAssignRoles])

    const changeLayout = (next) => {
        setLayout(next)
        try { localStorage.setItem(LAYOUT_KEY, next) } catch { /* private mode: layout just isn't remembered */ }
    }

    // Who to list depends on your role and departments, so wait for both
    const status = loadStatus !== "ready" ? loadStatus
        : profileError ? "error"
        : roleLoading || !profile ? "loading"
        : "ready"
    const { people, teams } = useMemo(
        () => scopeDirectory(everyone, orgTeams, { viewerId: profile?.id ?? null, isSuperAdmin }),
        [everyone, orgTeams, profile?.id, isSuperAdmin]
    )
    const jobTitles = useMemo(() => [...new Set(people.map((p) => p.job_title).filter(Boolean))].sort(), [people])
    const visible = useMemo(() => sortPeople(filterPeople(people, { query, teamId, jobTitle }), order), [people, query, teamId, jobTitle, order])
    const selected = people.find((p) => p.id === searchParams.get("person")) || null
    // Plain ids for the handlers below. The React Compiler re-checks what a
    // handler reads on every render, so `selected.id` there would throw while
    // no profile is open, and `profile.id` before your profile has loaded.
    const selectedId = selected?.id ?? null
    const myId = profile?.id ?? null
    const clearFilters = () => {
        setTeamId("all")
        setJobTitle("all")
    }
    const activeFilters = [
        teamId !== "all" && { key: "team", label: teams.find((t) => t.id === teamId)?.name || "Team", onRemove: () => setTeamId("all") },
        jobTitle !== "all" && { key: "role", label: jobTitle, onRemove: () => setJobTitle("all") },
    ].filter(Boolean)
    const open = (id) => setSearchParams({ person: id }, { replace: true })
    const close = useCallback(() => setSearchParams({}, { replace: true }), [setSearchParams])

    const handleSaveProfile = async (fields, avatarFile) => {
        if (!myId) return "Your profile hasn't loaded yet."
        const saved = await updateMyProfile(myId, fields)
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
        if (!selectedId) return
        const { error } = await setReportsTo(selectedId, managerId)
        if (error) setActionError("Couldn't change who they report to.")
        await load()
    }

    const handleRemoved = async () => {
        close()
        await load()
    }

    const openChat =(person) => window.dispatchEvent(new CustomEvent("open_coworker_chat", { detail: { user_id: person.id, name: person.name } }))

    return (
        <GeneralShell page="Directory">
            <PageHeading
                title="People Directory"
                subtitle="Find colleagues and learn more about the people across your organization."
                actions={status === "ready" && <span className="text-xs text-muted">{people.length} member{people.length === 1 ? "" : "s"}</span>}
            />

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                    <span className="material-symbols-outlined absolute left-3 top-2 text-[18px] text-muted">search</span>
                    <input
                        type="search"
                        aria-label="Search by name, role, or team"
                        placeholder="Search by name, role, or team…"
                        className={`${INPUT_CLASS} pl-9`}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
                <FilterMenu
                    teams={teams}
                    jobTitles={jobTitles}
                    teamId={teamId}
                    jobTitle={jobTitle}
                    onTeamChange={setTeamId}
                    onJobTitleChange={setJobTitle}
                    onClear={clearFilters}
                />
                <Select aria-label="Sort" className={COMPACT_SELECT_CLASS} value={order} onChange={(e) => setOrder(e.target.value)}>
                    <option value="az">A–Z</option>
                    <option value="za">Z–A</option>
                </Select>
                <div className="flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Layout">
                    {[["grid", "grid_view"], ["list", "view_list"]].map(([value, icon]) => (
                        <button
                            key={value}
                            type="button"
                            aria-label={`${value} layout`}
                            aria-pressed={layout === value}
                            onClick={() => changeLayout(value)}
                            className={`px-2.5 py-1.5 cursor-pointer ${layout === value ? "bg-accent text-on-accent" : "text-muted hover:text-white"}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">{icon}</span>
                        </button>
                    ))}
                </div>
            </div>

            <ActiveFilters filters={activeFilters} onClearAll={clearFilters} />

            {status === "error" && <ErrorNote onRetry={() => { load(); reloadProfile() }}>Couldn't load the directory.</ErrorNote>}
            {actionError && <ErrorNote>{actionError}</ErrorNote>}

            <div className="grid grid-cols-12 gap-4 items-start">
                <section className={selected ? "col-span-12 lg:col-span-8" : "col-span-12"}>
                    {status === "loading" && <p className="text-sm text-muted py-6">Loading…</p>}
                    {status === "ready" && visible.length === 0 && (
                        <PanelMessage icon="person_search" title="No one matches" text="Try a different name, team or role." />
                    )}
                    {layout === "grid" ? (
                        <div className={`grid gap-3 grid-cols-1 sm:grid-cols-2 ${selected ? "xl:grid-cols-3" : "lg:grid-cols-3 xl:grid-cols-4"}`}>
                            {visible.map((p) => <PersonCard key={p.id} person={p} isSelected={selected?.id === p.id} onOpen={() => open(p.id)} />)}
                        </div>
                    ) : (
                        visible.length > 0 && (
                            <div className="rounded-xl border border-line bg-panel overflow-hidden">
                                {visible.map((p) => <PersonRow key={p.id} person={p} isSelected={selected?.id === p.id} onOpen={() => open(p.id)} />)}
                            </div>
                        )
                    )}
                </section>
                {selected && (
                    <div className="col-span-12 lg:col-span-4">
                        <ProfileDrawer
                            person={selected}
                            people={everyone}
                            isMe={myId !== null && selectedId === myId}
                            canSetManager={can("directory.manage")}
                            canRemove={can("member.remove_from_organization")}
                            canAssignRoles={canAssignRoles}
                            departments={departments}
                            onRolesChanged={load}
                            onClose={close}
                            onMessage={() => openChat(selected)}
                            onEdit={() => setIsEditing(true)}
                            onSetManager={handleSetManager}
                            onRemoved={handleRemoved}
                        />
                    </div>
                )}
            </div>

            {isEditing && selected && <EditProfileForm person={selected} onSave={handleSaveProfile} onClose={() => setIsEditing(false)} />}
        </GeneralShell>
    )
}
