import { test } from "node:test"
import assert from "node:assert/strict"
import { visibleProjects } from "./projectVisibility.js"

const ME = "me"
const projects = [
    { id: "p1", team_space_id: "design", team_lead: "someone" },
    { id: "p2", team_space_id: "design", team_lead: ME },
    { id: "p3", team_space_id: "design", team_lead: "someone" },
    { id: "p4", team_space_id: "sales", team_lead: "someone" },
]
const ids = (list) => list.map((p) => p.id)

test("organization admins see every project", () => {
    const seen = visibleProjects({ projects, userId: ME, isOrgAdmin: true, myDepartments: [], myProjectIds: new Set() })
    assert.deepEqual(ids(seen), ["p1", "p2", "p3", "p4"])
})

test("members see projects they lead, were added to, or have a task in", () => {
    const seen = visibleProjects({
        projects, userId: ME, isOrgAdmin: false,
        myDepartments: [{ team_space_id: "design", role: "member" }],
        myProjectIds: new Set(["p3"]),
    })
    assert.deepEqual(ids(seen), ["p2", "p3"])
})

test("a department's team leads and admins see all its projects", () => {
    const seen = visibleProjects({
        projects, userId: ME, isOrgAdmin: false,
        myDepartments: [{ team_space_id: "design", role: "team_lead" }, { team_space_id: "sales", role: "member" }],
        myProjectIds: new Set(),
    })
    assert.deepEqual(ids(seen), ["p1", "p2", "p3"])
})

test("leading one of a shared project's other departments shows it too", () => {
    const seen = visibleProjects({
        projects, userId: ME, isOrgAdmin: false,
        myDepartments: [{ team_space_id: "sales", role: "admin" }],
        links: [{ project_id: "p1", team_space_id: "sales" }],
        myProjectIds: new Set(),
    })
    assert.deepEqual(ids(seen), ["p1", "p2", "p4"]) // p2: they lead it
})
