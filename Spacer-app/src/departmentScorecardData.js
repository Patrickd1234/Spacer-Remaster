import { supabase } from "./supabase"
import { fetchOrganizationDepartments } from "./crossDepartmentData"
import { departmentScorecard } from "./departmentScorecard"

// Reads for the Reports page's department scorecard. Row-level security limits
// both queries to what the person can see; organization admins see it all.
const MAX_ROWS = 5000

/** Resolves to { rows, error } (departmentScorecard rows). */
export async function fetchDepartmentScorecard() {
    const [tasks, dependencies, departments] = await Promise.all([
        supabase
            .from("tasks")
            .select("id, status, due_date, completed_at, team_space_id, project_id, project:project_spaces(team_space_id)")
            .not("project_id", "is", null)
            .limit(MAX_ROWS),
        supabase.from("task_dependencies").select("task_id, blocker_task_id, created_at, resolved_at").limit(MAX_ROWS),
        fetchOrganizationDepartments(),
    ])
    const failed = tasks.error || dependencies.error
    if (failed) {
        console.error("Loading the department scorecard failed:", failed)
        return { rows: [], error: "Couldn't load the department scorecard." }
    }
    const names = new Map(departments.data.map((d) => [String(d.id), d.name]))
    return {
        rows: departmentScorecard({ tasks: tasks.data || [], dependencies: dependencies.data || [], nameOf: (id) => names.get(String(id)) }),
        error: null,
    }
}
