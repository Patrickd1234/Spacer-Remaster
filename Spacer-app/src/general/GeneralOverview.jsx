import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { addDays, startOfDay, upcomingEvents, formatEventTime, meetingPlatform, EVENT_CATEGORIES } from "./generalFormat"
import { fetchAnnouncements, fetchEvents, fetchPeople, fetchOrgUpdates, fetchOverviewCounts } from "./generalData"
import { useMyProfile } from "./useMyProfile"
import { GeneralShell, PageHeading, Avatar, DateBadge, CategoryTag, ErrorNote } from "./GeneralParts"
import { AnnouncementCard } from "./AnnouncementParts"
import { StatCard, StatCardSkeleton, Panel, PanelMessage } from "../components/DashboardParts"
import { describeActivity, timeAgo } from "../activityLabels"

const PREVIEW_ANNOUNCEMENTS = 3
const PREVIEW_EVENTS = 4
const PREVIEW_PEOPLE = 5
const UPCOMING_DAYS = 30

const ViewLink = ({ to, children }) => <Link to={to} className="text-xs text-[#8c947b] underline hover:text-white">{children}</Link>

async function loadOverview(profile) {
    const today = startOfDay(new Date())
    const [counts, announcements, events, people, updates] = await Promise.all([
        fetchOverviewCounts(profile),
        fetchAnnouncements({ limit: PREVIEW_ANNOUNCEMENTS, pinnedFirst: true }),
        fetchEvents(today, addDays(today, UPCOMING_DAYS)),
        fetchPeople({ limit: PREVIEW_PEOPLE }),
        fetchOrgUpdates(),
    ])
    return {
        counts: counts.data,
        announcements: announcements.data,
        upcoming: upcomingEvents(events.data, new Date(), UPCOMING_DAYS),
        people: people.data,
        updates: updates.data,
        hasError: Boolean(counts.error || announcements.error || events.error || people.error || updates.error),
    }
}

function UpdateRow({ row }) {
    const { title, icon } = describeActivity(row)
    return (
        <li className="flex items-start gap-3 py-2">
            <span className="w-8 h-8 shrink-0 rounded-full bg-[#191c21] border border-[#2D3139] flex items-center justify-center">
                <span className="material-symbols-outlined text-[16px] text-[#aff82a]">{icon}</span>
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{title}</p>
                <p className="text-[11px] text-[#8c947b] truncate">{row.actor?.name || "Someone"}</p>
            </div>
            <span className="text-[11px] text-[#8c947b] whitespace-nowrap">{timeAgo(row.created_at)}</span>
        </li>
    )
}

// Screen 1: organization-wide snapshot with previews of the other General Space pages
export default function GeneralOverview() {
    const navigate = useNavigate()
    const { profile, error: profileError } = useMyProfile()
    const [data, setData] = useState(null)

    const load = useCallback(() => {
        if (!profile) return
        setData(null)
        loadOverview(profile).then(setData)
    }, [profile])

    useEffect(() => {
        if (!profile) return
        let active = true
        loadOverview(profile).then((result) => { if (active) setData(result) })
        return () => { active = false }
    }, [profile])

    const today = new Date().toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" })

    return (
        <GeneralShell page="Overview">
            <PageHeading
                title="General Space"
                subtitle="Stay up to date with what's happening across your organization."
                actions={<span className="flex items-center gap-2 text-xs text-[#c4c9b8] border border-[#2D3139] rounded-lg px-3 py-2"><span className="material-symbols-outlined text-[16px]">calendar_today</span>{today}</span>}
            />

            {profileError && <ErrorNote>Couldn't load your profile.</ErrorNote>}
            {data?.hasError && <ErrorNote onRetry={load}>Some sections couldn't load.</ErrorNote>}

            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {!data ? [0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} />) : (
                    <>
                        <Link to="/general/announcements"><StatCard value={data.counts.announcements} label="New Announcements" sub="This month" subIcon="campaign" /></Link>
                        <Link to="/general/calendar"><StatCard value={data.upcoming.length} label="Upcoming Events" sub={`Next ${UPCOMING_DAYS} days`} subIcon="event" /></Link>
                        <Link to="/general/directory"><StatCard value={data.counts.members} label="Team Members" sub="Across all teams" subIcon="group" /></Link>
                        <StatCard value={data.counts.teams} label="Team Spaces" sub="Active" subIcon="workspaces" />
                    </>
                )}
            </section>

            {data && (
                <div className="grid grid-cols-12 gap-4">
                    <Panel title="Company Announcements" className="col-span-12 lg:col-span-7" action={<ViewLink to="/general/announcements">View all</ViewLink>}>
                        {data.announcements.length === 0
                            ? <PanelMessage icon="campaign" title="No announcements yet" text="Company news will appear here." />
                            : data.announcements.map((a) => <AnnouncementCard key={a.id} announcement={a} onOpen={() => navigate(`/general/announcements?id=${a.id}`)} />)}
                    </Panel>

                    <Panel title="Upcoming Company Events" className="col-span-12 lg:col-span-5" action={<ViewLink to="/general/calendar">View calendar</ViewLink>}>
                        {data.upcoming.length === 0
                            ? <PanelMessage icon="event" title="No upcoming events" text={`Nothing scheduled in the next ${UPCOMING_DAYS} days.`} />
                            : data.upcoming.slice(0, PREVIEW_EVENTS).map((e) => (
                                <Link key={e.id} to="/general/calendar" className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#191c21]">
                                    <DateBadge event={e} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-white truncate">{e.title}</p>
                                        <p className="text-[11px] text-[#8c947b]">{formatEventTime(e)}{meetingPlatform(e.external_url) ? ` · ${meetingPlatform(e.external_url)}` : ""}</p>
                                    </div>
                                    <CategoryTag categories={EVENT_CATEGORIES} value={e.category} />
                                </Link>
                            ))}
                    </Panel>

                    <Panel title="Organization Updates" className="col-span-12 lg:col-span-7">
                        {data.updates.length === 0
                            ? <PanelMessage icon="history" title="Nothing yet" text="Activity across your organization will appear here." />
                            : <ul className="divide-y divide-[#2D3139]">{data.updates.map((row) => <UpdateRow key={row.id} row={row} />)}</ul>}
                    </Panel>

                    <Panel title="People Directory (Preview)" className="col-span-12 lg:col-span-5" action={<ViewLink to="/general/directory">View directory</ViewLink>}>
                        {data.people.slice(0, PREVIEW_PEOPLE).map((p) => (
                            <Link key={p.id} to={`/general/directory?person=${p.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#191c21]">
                                <Avatar name={p.name} url={p.avatarUrl} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-white truncate">{p.name}</p>
                                    <p className="text-[11px] text-[#8c947b] truncate">{p.job_title || "No title yet"}</p>
                                </div>
                                {p.teams[0] && <span className="px-2 py-0.5 rounded-md border border-[#2D3139] text-[11px] text-[#c4c9b8]">{p.teams[0].name}</span>}
                            </Link>
                        ))}
                    </Panel>
                </div>
            )}
        </GeneralShell>
    )
}
