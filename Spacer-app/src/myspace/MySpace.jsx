import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../supabase"
import { fetchRecentActivity } from "../recentActivity"
import { TASK_CREATED_EVENT, MEETING_SAVED_EVENT } from "../appEvents"
import { StatCard, StatCardSkeleton, Panel, PanelLink, PanelMessage } from "../components/DashboardParts"
import { TaskCard, TaskCardSkeleton, ActivityList, ActivitySkeleton, MeetingRow, MeetingSkeleton } from "./MySpaceParts"
import { useResource } from "./useResource"
import GreetingSky from "./GreetingSky"
import DepartmentInvites from "../partials/DepartmentInvites"
import { fetchUpcomingMeetings } from "../meetings/meetingData"
import { localDateKey, summarizeTasks, boardTasks, greetingFor } from "./taskStats"

const MEETINGS_LIMIT = 4
// How far ahead repeating meetings are looked for
const MEETINGS_DAYS_AHEAD = 60
const COLLAPSED_ACTIVITY_COUNT = 6
// Wait for a burst of task changes to settle before refreshing
const LIVE_REFRESH_DELAY_MS = 500

const STAT_CARDS = [
    { key: "active", label: "Active Tasks", sub: "Tasks assigned to you that are still active", empty: "No active task until you get assigned" },
    { key: "dueToday", label: "Due Today", sub: "Tasks you need to complete today", empty: "No due task until you get assigned", accent: "orange" },
    { key: "overdue", label: "Overdue Tasks", sub: "Tasks that have passed their due date", empty: "No overdue task until you get assigned", accent: "red" },
    { key: "completed", label: "Completed", sub: "Tasks you've successfully completed", empty: "No completed task until you get assigned" },
]

function StatRow({ tasksState, todayKey, onRetry }) {
    if (tasksState.status === "loading") {
        return STAT_CARDS.map(({ key }) => <StatCardSkeleton key={key} />)
    }
    if (tasksState.status === "error") {
        return STAT_CARDS.map(({ key, label, accent }) => (
            <StatCard key={key} value="–" label={label} accent={accent} sub="Tasks can't be displayed." subIcon="fiber_manual_record" onRetry={onRetry} />
        ))
    }
    const counts = summarizeTasks(tasksState.data, todayKey)
    const hasTasks = tasksState.data.length > 0
    return STAT_CARDS.map(({ key, label, sub, empty, accent }) => (
        <StatCard key={key} value={counts[key]} label={label} accent={accent} sub={hasTasks ? sub : empty} subIcon="fiber_manual_record" />
    ))
}

function TaskBoard({ tasksState, todayKey, onRetry, onOpen }) {
    if (tasksState.status === "loading") {
        return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <TaskCardSkeleton key={i} />)}</div>
    }
    if (tasksState.status === "error") {
        return <PanelMessage icon="assignment" title="Couldn't load your tasks" text="Your tasks couldn't be loaded. Try again in a moment." onRetry={onRetry} />
    }
    const tasks = boardTasks(tasksState.data, todayKey)
    if (tasks.length === 0) {
        return <PanelMessage icon="assignment" title="No Task Assigned" text="Tasks assigned to you will appear here." />
    }
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tasks.map((task) => <TaskCard key={task.id} task={task} todayKey={todayKey} onOpen={onOpen} />)}
        </div>
    )
}

function ActivityBody({ activityState, isShowingAll, onRetry }) {
    if (activityState.status === "loading") return <ActivitySkeleton />
    if (activityState.status === "error") {
        return <PanelMessage icon="shield" title="Couldn't load recent activity" text="We couldn't retrieve your recent activity right now." onRetry={onRetry} />
    }
    if (activityState.data.length === 0) {
        return <PanelMessage icon="history" title="Nothing here yet" text="Your recent activity will appear here as you work." />
    }
    const items = isShowingAll ? activityState.data : activityState.data.slice(0, COLLAPSED_ACTIVITY_COUNT)
    return <ActivityList items={items} />
}

function MeetingsBody({ meetingsState, todayKey, onRetry }) {
    if (meetingsState.status === "loading") {
        return <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><MeetingSkeleton /><MeetingSkeleton /></div>
    }
    if (meetingsState.status === "error") {
        return <PanelMessage icon="error" title="Couldn't load meetings" text="We couldn't retrieve your upcoming meetings." onRetry={onRetry} />
    }
    if (meetingsState.data.length === 0) {
        return <PanelMessage icon="headset_mic" title="No Upcoming Meetings" text="Your scheduled meetings will appear here." />
    }
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {meetingsState.data.map((event) => <MeetingRow key={event.id} event={event} todayKey={todayKey} />)}
        </div>
    )
}

// Personal dashboard for members and department admins
export default function MySpace({ userId, displayName }) {
    const navigate = useNavigate()
    const [todayKey] = useState(() => localDateKey())
    const [greeting] = useState(() => greetingFor(new Date().getHours()))
    const [isShowingAllActivity, setIsShowingAllActivity] = useState(false)

    const loadTasks = useCallback(() => supabase
        .from("tasks")
        .select("id, title, description, status, priority, sub_tasks, due_date, project_id, project:project_spaces(name)")
        .eq("assignee_id", userId)
        .then(({ data, error }) => {
            if (error) console.error("Loading your tasks failed:", error)
            return { data: data || [], error }
        }), [userId])

    const loadActivity = useCallback(() => fetchRecentActivity(userId), [userId])

    // Company events plus meetings you organize or are invited to (row-level
    // security decides), repeats included
    const loadMeetings = useCallback(() => {
        const from = new Date(`${todayKey}T00:00`)
        const until = new Date(from.getFullYear(), from.getMonth(), from.getDate() + MEETINGS_DAYS_AHEAD)
        return fetchUpcomingMeetings(from, until, MEETINGS_LIMIT)
    }, [todayKey])

    const [tasksState, reloadTasks, refreshTasks] = useResource(loadTasks)
    const [activityState, reloadActivity, refreshActivity] = useResource(loadActivity)
    const [meetingsState, reloadMeetings] = useResource(loadMeetings)

    // A meeting scheduled from the header's Create menu shows up straight away
    useEffect(() => {
        window.addEventListener(MEETING_SAVED_EVENT, reloadMeetings)
        return () => window.removeEventListener(MEETING_SAVED_EVENT, reloadMeetings)
    }, [reloadMeetings])

    // A task created from the header's Create menu shows up straight away
    useEffect(() => {
        const refresh = () => { reloadTasks(); reloadActivity() }
        window.addEventListener(TASK_CREATED_EVENT, refresh)
        return () => window.removeEventListener(TASK_CREATED_EVENT, refresh)
    }, [reloadTasks, reloadActivity])

    // Ids of the tasks on screen, so a change that takes one away (unassigned,
    // deleted) is noticed even though the changed row no longer names this user
    const shownTaskIds = useRef(new Set())
    useEffect(() => {
        shownTaskIds.current = new Set((tasksState.data || []).map((t) => t.id))
    }, [tasksState.data])

    // Live: a change to one of your tasks, by anyone, refreshes My Tasks and
    // Recent Activities without the loading skeletons
    useEffect(() => {
        if (!userId) return
        let refreshTimer = null
        const onTaskChange = ({ new: row, old }) => {
            const isMine = row?.assignee_id === userId || shownTaskIds.current.has(row?.id) || shownTaskIds.current.has(old?.id)
            if (!isMine) return
            clearTimeout(refreshTimer)
            refreshTimer = setTimeout(() => { refreshTasks(); refreshActivity() }, LIVE_REFRESH_DELAY_MS)
        }
        const channel = supabase
            .channel(`my-space-tasks-${userId}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, onTaskChange)
            .subscribe()
        return () => {
            clearTimeout(refreshTimer)
            supabase.removeChannel(channel)
        }
    }, [userId, refreshTasks, refreshActivity])

    const openTask = (task) => navigate(`/project_page/${task.project_id}?task_id=${task.id}`)
    const hasMoreActivity = activityState.status === "ready" && activityState.data.length > COLLAPSED_ACTIVITY_COUNT

    return (
        <>
            <section>
                <h1 className="text-2xl font-semibold text-white">{greeting}, {displayName} <GreetingSky greeting={greeting} /></h1>
                <p className="text-muted text-sm mt-1">Here's what's happening with your work today.</p>
            </section>

            <DepartmentInvites />

            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatRow tasksState={tasksState} todayKey={todayKey} onRetry={reloadTasks} />
            </section>

            <div className="grid grid-cols-12 gap-4">
                <Panel title="My Orbit" className="orbit-column col-span-12 lg:col-span-7" action={<PanelLink onClick={() => navigate("/tasks")}>View all Orbits</PanelLink>}>
                    <TaskBoard tasksState={tasksState} todayKey={todayKey} onRetry={reloadTasks} onOpen={openTask} />
                </Panel>

                <Panel
                    title="Recent Activities"
                    className="col-span-12 lg:col-span-5"
                    action={hasMoreActivity && (
                        <PanelLink onClick={() => setIsShowingAllActivity((v) => !v)}>{isShowingAllActivity ? "Show less" : "See recent activities"}</PanelLink>
                    )}
                >
                    <ActivityBody activityState={activityState} isShowingAll={isShowingAllActivity} onRetry={reloadActivity} />
                </Panel>

                <Panel title="Meetings" className="col-span-12" action={<PanelLink onClick={() => navigate("/calendar")}>View all meetings</PanelLink>}>
                    <MeetingsBody meetingsState={meetingsState} todayKey={todayKey} onRetry={reloadMeetings} />
                </Panel>
            </div>
        </>
    )
}
