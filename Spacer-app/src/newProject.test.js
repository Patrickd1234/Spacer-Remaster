import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeDepartments, newProjectProblem, createProjectArgs, applyDeadlineChange, departmentPeople, matchesPerson, toggleMember, selectedMemberIds } from "./newProject.js"

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
    assert.equal(newProjectProblem({ name: " ", deadline: "2026-12-15", projectLeadId: "u1", departments: [{ teamSpaceId: "a" }], nameOf }), "Please specify a project name.")
    assert.equal(newProjectProblem({ name: "Nightfall", deadline: "2026-12-15", projectLeadId: "u1", departments: [], nameOf }), "You can only create projects in a department where you're a team lead or admin.")
})

test("the project lead and the overall deadline are required, even with one department", () => {
    const departments = [{ teamSpaceId: "a", leadId: "u1", hasPeople: true }]
    assert.equal(newProjectProblem({ name: "Nightfall", deadline: "2026-12-15", projectLeadId: "", departments, nameOf }), "Please pick the project lead.")
    assert.equal(newProjectProblem({ name: "Nightfall", deadline: "", projectLeadId: "u1", departments, nameOf }), "Please pick the overall deadline.")
    assert.equal(newProjectProblem({ name: "Nightfall", deadline: "2026-12-15", projectLeadId: "u1", departments, nameOf }), null)
})

test("a joined department with people needs a lead; an invited or empty one doesn't", () => {
    const base = { name: "Nightfall", deadline: "2026-12-15", projectLeadId: "u1", nameOf }
    assert.equal(newProjectProblem({ ...base, departments: [{ teamSpaceId: "a", leadId: "", hasPeople: true }] }), "Please pick a lead for Design.")
    assert.equal(newProjectProblem({ ...base, departments: [{ teamSpaceId: "a", leadId: "u1", hasPeople: true }, { teamSpaceId: "b", leadId: "", hasPeople: true, isInvite: true }] }), null)
    assert.equal(newProjectProblem({ ...base, departments: [{ teamSpaceId: "a", leadId: "", hasPeople: false }] }), null)
})

test("the description is limited to 250 characters", () => {
    const base = { name: "Nightfall", deadline: "2026-12-15", projectLeadId: "u1", departments: [{ teamSpaceId: "a", leadId: "u1" }], nameOf }
    assert.equal(newProjectProblem({ ...base, description: "x".repeat(250) }), null)
    assert.equal(newProjectProblem({ ...base, description: "x".repeat(251) }), "The description can be at most 250 characters.")
})

test("no department may be due after the overall deadline", () => {
    const departments = [{ teamSpaceId: "a", leadId: "u1", dueDate: "" }, { teamSpaceId: "b", leadId: "u2", dueDate: "2026-12-20" }]
    assert.equal(newProjectProblem({ name: "Nightfall", deadline: "2026-12-15", projectLeadId: "u1", departments, nameOf }), "Marketing is due after the overall deadline.")
    assert.equal(newProjectProblem({ name: "Nightfall", deadline: "2026-12-20", projectLeadId: "u1", departments, nameOf }), null)
})

test("each department keeps its own lead, due date and picked members (each once)", () => {
    const args = createProjectArgs({
        name: " Nightfall ", deadline: "2026-12-15", projectLeadId: "u1", description: "  Q4 revamp ",
        departments: [
            { teamSpaceId: "a", leadId: "u2", dueDate: "", memberIds: ["u4", "u5", "u4"] },
            { teamSpaceId: "b", leadId: "", dueDate: "2026-12-01" },
        ],
    })
    assert.deepEqual(args, {
        p_name: "Nightfall", p_due_date: "2026-12-15", p_project_lead: "u1", p_description: "Q4 revamp",
        p_departments: [
            { team_space_id: "a", lead_id: "u2", due_date: null, member_ids: ["u4", "u5"] },
            { team_space_id: "b", lead_id: null, due_date: "2026-12-01", member_ids: [] },
        ],
    })
    assert.equal(createProjectArgs({ name: "N", deadline: "", projectLeadId: "", description: "   ", departments: [] }).p_description, null)
})

test("other departments can be any in the organization; the lead must be one you can create in", () => {
    const everyone = [...allowed, { id: "d", name: "Sales" }]
    const picked = [{ teamSpaceId: "d" }, { teamSpaceId: "d" }, { teamSpaceId: "b" }]
    assert.deepEqual(normalizeDepartments(picked, allowed, everyone).map((d) => d.teamSpaceId), ["a", "d", "b"])
    assert.deepEqual(normalizeDepartments([{ teamSpaceId: "a" }, { teamSpaceId: "x" }], allowed, everyone).map((d) => d.teamSpaceId), ["a"])
})

test("an invited department is sent without a lead; its picked members are a proposal", () => {
    const args = createProjectArgs({
        name: "Nightfall", deadline: "2026-12-15", projectLeadId: "u1",
        departments: [{ teamSpaceId: "a", leadId: "u2", dueDate: "" }, { teamSpaceId: "d", leadId: "u3", dueDate: "", isInvite: true, memberIds: ["u7"] }],
    })
    assert.deepEqual(args.p_departments[1], { team_space_id: "d", lead_id: null, due_date: null, member_ids: ["u7"] })
})

test("the member picker lists a department's people once, by name, with their job title", () => {
    const memberships = [
        { user_id: "u2", team_space_id: "a" }, { user_id: "u1", team_space_id: "a" },
        { user_id: "u1", team_space_id: "a" }, { user_id: "u3", team_space_id: "b" },
    ]
    const users = new Map([["u1", { name: "Zoe", job_title: "UI Designer" }], ["u2", { name: "Ada", job_title: null }]])
    assert.deepEqual(departmentPeople(memberships, users, "a"), [
        { id: "u2", name: "Ada", jobTitle: "" },
        { id: "u1", name: "Zoe", jobTitle: "UI Designer" },
    ])
})

test("search matches part of a name or job title; toggling adds then removes", () => {
    const zoe = { id: "u1", name: "Zoe Kim", jobTitle: "UI Designer" }
    assert.equal(matchesPerson(zoe, "kim"), true)
    assert.equal(matchesPerson(zoe, "design"), true)
    assert.equal(matchesPerson(zoe, "eng"), false)
    assert.equal(matchesPerson(zoe, "  "), true)
    assert.deepEqual(toggleMember(["u1"], "u2"), ["u1", "u2"])
    assert.deepEqual(toggleMember(["u1", "u2"], "u1"), ["u2"])
})

test("the lead always counts as a selected member; an invited department's lead doesn't", () => {
    assert.deepEqual(selectedMemberIds({ leadId: "u1", memberIds: ["u2", "u1"] }), ["u1", "u2"])
    assert.deepEqual(selectedMemberIds({ leadId: "u1", memberIds: ["u2"], isInvite: true }), ["u2"])
    assert.deepEqual(selectedMemberIds({ leadId: "" }), [])
})

test("a new deadline moves the department dates that followed the old one, or now fall after it", () => {
    const departments = [
        { teamSpaceId: "a", dueDate: "" },
        { teamSpaceId: "b", dueDate: "2026-12-15" },  // was the old deadline
        { teamSpaceId: "c", dueDate: "2026-12-01" },  // picked by hand, still fits
        { teamSpaceId: "d", dueDate: "2026-12-12" },  // picked by hand, now too late
    ]
    assert.deepEqual(applyDeadlineChange(departments, "2026-12-15", "2026-12-10").map((d) => d.dueDate), ["2026-12-10", "2026-12-10", "2026-12-01", "2026-12-10"])
    assert.deepEqual(applyDeadlineChange(departments, "2026-12-15", "").map((d) => d.dueDate), ["", "2026-12-15", "2026-12-01", "2026-12-12"])
})
