import { test } from "node:test"
import assert from "node:assert/strict"
import { parseSavedList, findProject } from "./projectListCache.js"

const list = {
    projects: [{ id: "p1", name: "Apollo", team_space_id: "t1", due_date: "2026-12-01" }],
    links: [{ project_id: "p1", team_space_id: "t2" }],
    orgTeams: [{ id: "t1", name: "Design" }],
}

test("a saved list reads back as it was saved", () => {
    assert.deepEqual(parseSavedList(JSON.stringify(list)), list)
})

test("nothing saved reads as null", () => {
    assert.equal(parseSavedList(null), null)
    assert.equal(parseSavedList(""), null)
})

test("broken or wrongly shaped data reads as null", () => {
    assert.equal(parseSavedList("{not json"), null)
    assert.equal(parseSavedList(JSON.stringify({ projects: "nope" })), null)
    assert.equal(parseSavedList(JSON.stringify([1, 2])), null)
})

test("missing links and departments read as empty lists", () => {
    const saved = parseSavedList(JSON.stringify({ projects: list.projects }))
    assert.deepEqual(saved.links, [])
    assert.deepEqual(saved.orgTeams, [])
})

test("projects without an id are dropped", () => {
    const saved = parseSavedList(JSON.stringify({ projects: [{ name: "No id" }, ...list.projects] }))
    assert.deepEqual(saved.projects, list.projects)
})

test("findProject finds a saved project by id, compared as strings", () => {
    assert.equal(findProject(list, "p1").name, "Apollo")
    assert.equal(findProject({ projects: [{ id: 7, name: "Seven" }] }, "7").name, "Seven")
})

test("findProject returns null when the project or the list is missing", () => {
    assert.equal(findProject(list, "nope"), null)
    assert.equal(findProject(null, "p1"), null)
})
