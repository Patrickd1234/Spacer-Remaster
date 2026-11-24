import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeDepartments, newProjectProblem, createProjectArgs } from "./newProject.js"

const allowed = [{ id: "a", name: "Design" }, { id: "b", name: "Marketing" }, { id: "c", name: "IT" }]
const nameOf = (id) => allowed.find((t) => t.id === id)?.name || "Department"

test("with nothing picked yet the first allowed department leads", () => {
    assert.deepEqual(normalizeDepartments([], allowed), [{ teamSpaceId: "a", dueDate: "" }])
    assert.deepEqual(normalizeDepartments([], []), [])
})

test("picks that are no longer allowed or repeated drop out; the lead falls back", () => {
    const picked = [{ teamSpaceId: "x", dueDate: "" }, { teamSpaceId: "b", dueDate: "" }, { teamSpaceId: "b", dueDate: "" }, { teamSpaceId: "z" }]
    assert.deepEqual(normalizeDepartments(picked, allowed).map((d) => d.teamSpaceId), ["a", "b"])
})

test("a project needs a name and a department", () => {
    assert.equal(newProjectProblem({ name: " ", deadline: "", departments: [{ teamSpaceId: "a" }], nameOf }), "Please specify a project name.")
    assert.equal(newProjectProblem({ name: "Nightfall", deadline: "", departments: [], nameOf }), "You can only create projects in a department where you're a team lead or admin.")
})

test("one department: the deadline is optional", () => {
    assert.equal(newProjectProblem({ name: "Nightfall", deadline: "", departments: [{ teamSpaceId: "a" }], nameOf }), null)
})

test("several departments need an overall deadline, and none may be due after it", () => {
    const departments = [{ teamSpaceId: "a", dueDate: "" }, { teamSpaceId: "b", dueDate: "2026-12-20" }]
    assert.equal(newProjectProblem({ name: "Nightfall", deadline: "", departments, nameOf }), "Please pick the overall deadline.")
    assert.equal(newProjectProblem({ name: "Nightfall", deadline: "2026-12-15", departments, nameOf }), "Marketing is due after the overall deadline.")
    assert.equal(newProjectProblem({ name: "Nightfall", deadline: "2026-12-20", departments, nameOf }), null)
})

test("one department: the project lead also leads it, and it takes the deadline", () => {
    const args = createProjectArgs({ name: " Nightfall ", deadline: "", projectLeadId: "u1", departments: [{ teamSpaceId: "a", leadId: "u9", dueDate: "2026-01-01" }] })
    assert.deepEqual(args, {
        p_name: "Nightfall", p_due_date: null, p_project_lead: "u1",
        p_departments: [{ team_space_id: "a", lead_id: "u1", due_date: null }],
    })
})

test("several departments keep their own leads; an empty due date takes the deadline", () => {
    const args = createProjectArgs({
        name: "Nightfall", deadline: "2026-12-15", projectLeadId: "",
        departments: [{ teamSpaceId: "a", leadId: "u2", dueDate: "" }, { teamSpaceId: "b", leadId: "", dueDate: "2026-12-01" }],
    })
    assert.deepEqual(args, {
        p_name: "Nightfall", p_due_date: "2026-12-15", p_project_lead: null,
        p_departments: [
            { team_space_id: "a", lead_id: "u2", due_date: null },
            { team_space_id: "b", lead_id: null, due_date: "2026-12-01" },
        ],
    })
})

test("other departments can be any in the organization; the lead must be one you can create in", () => {
    const everyone = [...allowed, { id: "d", name: "Sales" }]
    const picked = [{ teamSpaceId: "d" }, { teamSpaceId: "d" }, { teamSpaceId: "b" }]
    assert.deepEqual(normalizeDepartments(picked, allowed, everyone).map((d) => d.teamSpaceId), ["a", "d", "b"])
    assert.deepEqual(normalizeDepartments([{ teamSpaceId: "a" }, { teamSpaceId: "x" }], allowed, everyone).map((d) => d.teamSpaceId), ["a"])
})

test("an invited department is sent without a lead; its lead is picked when it accepts", () => {
    const args = createProjectArgs({
        name: "Nightfall", deadline: "2026-12-15", projectLeadId: "u1",
        departments: [{ teamSpaceId: "a", leadId: "u2", dueDate: "" }, { teamSpaceId: "d", leadId: "u3", dueDate: "", isInvite: true }],
    })
    assert.deepEqual(args.p_departments[1], { team_space_id: "d", lead_id: null, due_date: null })
})
