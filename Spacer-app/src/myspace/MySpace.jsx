import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../supabase"
import { fetchRecentActivity } from "../recentActivity"
import { TASK_CREATED_EVENT } from "../appEvents"
import { StatCard, StatCardSkeleton, Panel, PanelLink, PanelMessage } from "../components/DashboardParts"
import { TaskCard, TaskCardSkeleton, ActivityList, ActivitySkeleton, MeetingRow, MeetingSkeleton } from "./MySpaceParts"
import { useResource } from "./useResource"
import { localDateKey, summarizeTasks, boardTasks, greetingFor } from "./taskStats"

const MEETINGS_LIMIT = 4
const COLLAPSED_ACTIVITY_COUNT = 6

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

    // Row-level security limits events to the user's organization
    const loadMeetings = useCallback(() => supabase
        .from("calendar_events")
        .select("id, title, event_date, external_url")
        .gte("event_date", todayKey)
        .order("event_date", { ascending: true })
        .limit(MEETINGS_LIMIT)
        .then(({ data, error }) => {
            if (error) console.error("Loading upcoming meetings failed:", error)
            return { data: data || [], error }
        }), [todayKey])

    const [tasksState, reloadTasks] = useResource(loadTasks)
    const [activityState, reloadActivity] = useResource(loadActivity)
    const [meetingsState, reloadMeetings] = useResource(loadMeetings)

    // A task created from the header's Create menu shows up straight away
    useEffect(() => {
        const refresh = () => { reloadTasks(); reloadActivity() }
        window.addEventListener(TASK_CREATED_EVENT, refresh)
        return () => window.removeEventListener(TASK_CREATED_EVENT, refresh)
    }, [reloadTasks, reloadActivity])

    const openTask = (task) => navigate(`/project_page/${task.project_id}?task_id=${task.id}`)
    const hasMoreActivity = activityState.status === "ready" && activityState.data.length > COLLAPSED_ACTIVITY_COUNT

    return (
        <>
            <section>
                <h1 className="text-2xl font-semibold text-white">{greeting}, {displayName} 👋</h1>
                <p className="text-[#8c947b] text-sm mt-1">Here's what's happening with your work today.</p>
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatRow tasksState={tasksState} todayKey={todayKey} onRetry={reloadTasks} />
            </section>

            <div className="grid grid-cols-12 gap-4">
                <Panel title="My Task" className="col-span-12 lg:col-span-7" action={<PanelLink onClick={() => navigate("/tasks")}>View all task</PanelLink>}>
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
