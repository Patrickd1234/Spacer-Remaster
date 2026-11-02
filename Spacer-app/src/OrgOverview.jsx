import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { supabase } from "./supabase"
import { fetchRecentActivity } from "./recentActivity"
import { DEPARTMENT_CREATED_EVENT } from "./appEvents"
import { StatCard, Panel } from "./components/DashboardParts"

const UPCOMING_EVENTS_LIMIT = 4
const TEAMS_PER_PAGE = 3
const COLLAPSED_ACTIVITY_COUNT = 3

const TEAM_ICONS = {
    Development: "code",
    Marketing: "campaign",
    HR: "person_search",
    Finance: "account_balance",
    Design: "palette",
    default: "groups",
}

function TeamStat({ icon, label, value }) {
    return (
        <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-surface2 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[14px] text-muted">{icon}</span>
            </div>
            <div className="min-w-0">
                <p className="text-[10px] text-muted">{label}</p>
                <p className="text-sm text-white truncate">{value}</p>
            </div>
        </div>
    )
}

// No status row: departments have no status data (it always read "ON TRACK")
function TeamCard({ team }) {
    return (
        <div className="bg-raised border border-line rounded-lg p-3 flex flex-col gap-3 hover:border-line-strong transition-colors">
            <TeamStat icon={TEAM_ICONS[team.name] || TEAM_ICONS.default} label="Team" value={team.name} />
            <TeamStat icon="person" label="Members" value={team.member_count ?? "—"} />
            <TeamStat icon="folder" label="Projects" value={team.project_count ?? "—"} />
        </div>
    )
}

async function fetchOrgData(orgId) {
    let teamQuery = supabase.from("team_spaces").select("id, name")
    if (orgId) teamQuery = teamQuery.eq("organization_id", orgId)
    const { data: teamSpaces, error } = await teamQuery
    if (error) console.warn("team_spaces fetch error:", error)
    const teamIds = (teamSpaces || []).map(ts => ts.id)

    let members = []
    let projects = []
    if (teamIds.length > 0) {
        const [{ data: memsData }, { data: projsData }] = await Promise.all([
            supabase.from("memberships").select("id, team_space_id").in("team_space_id", teamIds),
            supabase.from("project_spaces").select("id, team_space_id").in("team_space_id", teamIds),
        ])
        members = memsData || []
        projects = projsData || []
    }

    return {
        stats: { members: members.length, teams: teamIds.length, activeProjects: projects.length },
        teams: (teamSpaces || []).map((ts) => ({
            ...ts,
            member_count: members.filter(m => m.team_space_id === ts.id).length,
            project_count: projects.filter(p => p.team_space_id === ts.id).length,
        })),
    }
}

// Super admin home: organization summary, teams, activity and calendar
export default function OrgOverview({ userId, orgId }) {
    const [orgStats, setOrgStats] = useState({ members: null, teams: null, activeProjects: null })
    const [teams, setTeams] = useState([])
    const [teamPage, setTeamPage] = useState(0)
    const [activities, setActivities] = useState([])
    const [isShowingAllActivity, setIsShowingAllActivity] = useState(false)
    const [upcomingEvents, setUpcomingEvents] = useState([])

    const loadOrgData = useCallback(() => fetchOrgData(orgId)
        .then(({ stats, teams: enriched }) => { setOrgStats(stats); setTeams(enriched) })
        .catch((err) => console.error("Org data fetch error:", err)), [orgId])

    useEffect(() => { loadOrgData() }, [loadOrgData])

    // A department created from the header's Create menu updates the overview
    useEffect(() => {
        window.addEventListener(DEPARTMENT_CREATED_EVENT, loadOrgData)
        return () => window.removeEventListener(DEPARTMENT_CREATED_EVENT, loadOrgData)
    }, [loadOrgData])

    useEffect(() => {
        let active = true
        fetchRecentActivity(userId).then(({ data }) => { if (active) setActivities(data) })
        return () => { active = false }
    }, [userId])

    // Row-level security limits events to the user's organization
    useEffect(() => {
        let active = true
        const today = new Date().toISOString().slice(0, 10)
        supabase
            .from("calendar_events")
            .select("id, title, event_date")
            .gte("event_date", today)
            .order("event_date", { ascending: true })
            .limit(UPCOMING_EVENTS_LIMIT)
            .then(({ data, error }) => {
                if (error) console.error("Loading upcoming events failed:", error)
                if (active) setUpcomingEvents(data || [])
            })
        return () => { active = false }
    }, [])

    const totalTeamPages = Math.ceil(teams.length / TEAMS_PER_PAGE)
    const visibleTeams = teams.slice(teamPage * TEAMS_PER_PAGE, (teamPage + 1) * TEAMS_PER_PAGE)
    const visibleActivities = isShowingAllActivity ? activities : activities.slice(0, COLLAPSED_ACTIVITY_COUNT)

    return (
        <>
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Members" value={orgStats.members ?? "—"} sub="Company members" subIcon="person" />
                <StatCard label="Teams" value={orgStats.teams ?? "—"} sub="Across the organization" subIcon="grid_view" />
                <StatCard label="Active Projects" value={orgStats.activeProjects ?? "—"} sub="Currently in progress" subIcon="fiber_manual_record" />
                <StatCard
                    label="Requires Attention"
                    value={teams.filter(t => t.status === "NEEDS ATTENTION" || t.status === "AT RISK").length}
                    sub="Pending leadership decisions"
                    subIcon="flag"
                    accent="red"
                />
            </section>

            <div className="grid grid-cols-12 gap-4">
                <Panel
                    title="Team Overview"
                    className="col-span-12 lg:col-span-7"
                    action={totalTeamPages > 1 && (
                        <div className="flex items-center gap-1 text-muted text-xs">
                            <button type="button" onClick={() => setTeamPage(p => Math.max(0, p - 1))} disabled={teamPage === 0} aria-label="Previous teams" className="p-0.5 rounded hover:text-white disabled:opacity-30 transition-colors cursor-pointer">
                                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                            </button>
                            <span>{Math.min((teamPage + 1) * TEAMS_PER_PAGE, teams.length)} out of {teams.length}</span>
                            <button type="button" onClick={() => setTeamPage(p => Math.min(totalTeamPages - 1, p + 1))} disabled={teamPage >= totalTeamPages - 1} aria-label="Next teams" className="p-0.5 rounded hover:text-white disabled:opacity-30 transition-colors cursor-pointer">
                                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                            </button>
                        </div>
                    )}
                >
                    {teams.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center min-h-[180px] gap-3">
                            <span className="material-symbols-outlined text-4xl text-muted">groups</span>
                            <p className="text-muted text-sm">No teams in the organization yet. Use Create → Create Department.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {visibleTeams.map(team => <TeamCard key={team.id} team={team} />)}
                        </div>
                    )}
                </Panel>

                <Panel
                    title="Recent Activity"
                    className="col-span-12 lg:col-span-5"
                    action={activities.length > COLLAPSED_ACTIVITY_COUNT && (
                        <button type="button" onClick={() => setIsShowingAllActivity(v => !v)} className="text-xs text-muted underline hover:text-white cursor-pointer">
                            {isShowingAllActivity ? "Show less" : "See recent activities"}
                        </button>
                    )}
                >
                    <div className="bg-raised border border-line rounded-lg p-3 space-y-4 flex-1">
                        {activities.length === 0 && <p className="text-xs text-muted">No activity yet. Create a project or task to get started.</p>}
                        {visibleActivities.map(act => (
                            <div key={act.id} className="flex gap-3 items-start">
                                <div className="w-7 h-7 rounded-full bg-surface2 flex items-center justify-center shrink-0 font-semibold text-[10px] text-muted">{act.initials}</div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-white">{act.title}</p>
                                    <p className="text-[11px] text-muted mt-0.5">{act.sub}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Panel>

                <Panel title="Upcoming" className="col-span-12" action={<Link to="/calendar" className="text-xs text-muted underline hover:text-white">Open Calendar</Link>}>
                    {upcomingEvents.length === 0 ? (
                        <p className="text-xs text-muted">No upcoming events. Events added to the calendar will appear here.</p>
                    ) : (
                        <ul className="bg-raised border border-line rounded-lg p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                            {upcomingEvents.map(event => (
                                <li key={event.id} className="flex gap-3 items-start">
                                    <span className="material-symbols-outlined text-[16px] text-muted mt-0.5">event</span>
                                    <div className="min-w-0">
                                        <p className="text-xs text-white truncate">{event.title}</p>
                                        <p className="text-[11px] text-muted">
                                            {new Date(`${event.event_date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>
        </>
    )
}
