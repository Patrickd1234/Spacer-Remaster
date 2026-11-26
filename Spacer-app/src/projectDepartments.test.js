// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { addableDepartments, projectsInDepartment, teamLeadOptions, departmentLeadOptions, addableProjectMembers, applyDepartmentChange, resolveDepartmentLead } from "./projectDepartments.js";

const spaces = [
    { id: "a", name: "Design" },
    { id: "b", name: "Marketing" },
    { id: "c", name: "Sales" },
];

test("the main department can't be added again", () => {
    assert.deepEqual(addableDepartments(spaces, "a", []).map((s) => s.id), ["b", "c"]);
});

test("departments already added aren't offered twice", () => {
    assert.deepEqual(addableDepartments(spaces, "a", ["b"]).map((s) => s.id), ["c"]);
});

test("a picker keeps its own choice in its list", () => {
    assert.deepEqual(addableDepartments(spaces, "a", ["b", "c"], "b").map((s) => s.id), ["b"]);
});

test("ids are compared as strings", () => {
    assert.deepEqual(addableDepartments([{ id: 1 }, { id: 2 }], "1", [2]), []);
});

const projects = [
    { id: "p1", team_space_id: "a" },
    { id: "p2", team_space_id: "b" },
];
const links = [{ project_id: "p1", team_space_id: "b" }];

test("a project shows in its main department", () => {
    assert.deepEqual(projectsInDepartment(projects, links, "a").map((p) => p.id), ["p1"]);
});

test("a project also shows in its extra departments, once", () => {
    assert.deepEqual(projectsInDepartment(projects, [...links, ...links], "b").map((p) => p.id), ["p1", "p2"]);
});

test("no links means main department only", () => {
    assert.deepEqual(projectsInDepartment(projects, undefined, "c"), []);
});

test("the main picker hides departments picked in the extra boxes", () => {
    assert.deepEqual(addableDepartments(spaces, "a", ["b"], "a").map((s) => s.id), ["a", "c"]);
});

const memberRows = [
    { team_space_id: "b", users: { id: "u2", name: "Zoe" } },
    { team_space_id: "a", users: { id: "u1", name: "Ade" } },
    { team_space_id: "b", users: { id: "u1", name: "Ade" } },
    { team_space_id: "a", users: null },
];

test("team lead options name each person's departments, sorted by name", () => {
    assert.deepEqual(teamLeadOptions(memberRows, spaces, ["a", "b"]), [
        { id: "u1", name: "Ade", departments: ["Design", "Marketing"], label: "Ade (Design, Marketing)" },
        { id: "u2", name: "Zoe", departments: ["Marketing"], label: "Zoe (Marketing)" },
    ]);
});

test("departments follow the picked order, main department first", () => {
    assert.deepEqual(teamLeadOptions(memberRows, spaces, ["b", "a"])[0].departments, ["Marketing", "Design"]);
});

test("members of departments that aren't picked are left out", () => {
    assert.deepEqual(teamLeadOptions(memberRows, spaces, ["a"]).map((o) => o.label), ["Ade (Design)"]);
});

test("a department's lead choices are its own members, by name, team leads marked as the default", () => {
    const rows = [
        { team_space_id: "a", role: "member", users: { id: "u2", name: "Zoe" } },
        { team_space_id: "a", role: "team_lead", users: { id: "u3", name: "Ben" } },
        { team_space_id: "b", role: "team_lead", users: { id: "u4", name: "Ann" } },
    ];
    const { options, defaultId } = departmentLeadOptions(rows, "a");
    assert.deepEqual(options.map((o) => o.name), ["Ben", "Zoe"]);
    assert.equal(defaultId, "u3");
});

test("a department with no team lead has no default lead", () => {
    const rows = [{ team_space_id: "a", role: "member", users: { id: "u2", name: "Zoe" } }];
    assert.equal(departmentLeadOptions(rows, "a").defaultId, "");
    assert.deepEqual(departmentLeadOptions([], "a").options, []);
});

test("people to add come from the project's departments, once each, by name", () => {
    const rows = [
        { team_space_id: "a", user: { id: "u1", name: "Zoe", email: "z@x" } },
        { team_space_id: "b", user: { id: "u1", name: "Zoe", email: "z@x" } },
        { team_space_id: "a", user: { id: "u2", name: "Ben", email: "b@x" } },
        { team_space_id: "a", user: { id: "u3", name: "Ann", email: "a@x" } },
    ];
    const departments = [{ team_space_id: "a", name: "Design" }, { team_space_id: "b", name: "Marketing" }];
    const people = addableProjectMembers(rows, departments, new Set(["u3"]));
    assert.deepEqual(people.map((p) => [p.name, p.departments]), [["Ben", ["Design"]], ["Zoe", ["Design", "Marketing"]]]);
});

test("rows without a user are skipped", () => {
    assert.deepEqual(addableProjectMembers([{ team_space_id: "a", user: null }], [], new Set()), []);
});

test("switching a card to another department gives it that department's default lead", () => {
    const card = { teamSpaceId: "a", leadId: "u1", dueDate: "2026-12-01" };
    const next = applyDepartmentChange(card, { teamSpaceId: "b" });
    assert.equal(next.teamSpaceId, "b");
    assert.equal(next.leadId, undefined);
    assert.equal(next.dueDate, "2026-12-01");
    assert.equal(resolveDepartmentLead(next.leadId, { options: [{ id: "u9" }], defaultId: "u9" }), "u9");
});

test("switching a card's department forgets its picked members", () => {
    const card = { teamSpaceId: "a", leadId: "u1", memberIds: ["u2"] };
    assert.deepEqual(applyDepartmentChange(card, { teamSpaceId: "b" }).memberIds, []);
    assert.deepEqual(applyDepartmentChange(card, { teamSpaceId: "a" }).memberIds, ["u2"]);
    assert.deepEqual(applyDepartmentChange(card, { memberIds: ["u3"] }).memberIds, ["u3"]);
});

test("other card changes keep the department's lead", () => {
    const card = { teamSpaceId: "a", leadId: "u1", dueDate: "" };
    assert.equal(applyDepartmentChange(card, { dueDate: "2026-12-01" }).leadId, "u1");
    assert.equal(applyDepartmentChange(card, { teamSpaceId: "a" }).leadId, "u1");
    assert.equal(applyDepartmentChange(card, { leadId: "" }).leadId, "");
});

test("a department's lead: the pick if still a member, 'No lead' if chosen, else the default", () => {
    const choices = { options: [{ id: "u1" }, { id: "u2" }], defaultId: "u1" };
    assert.equal(resolveDepartmentLead("u2", choices), "u2");
    assert.equal(resolveDepartmentLead("", choices), "");
    assert.equal(resolveDepartmentLead("gone", choices), "u1");
    assert.equal(resolveDepartmentLead(undefined, choices), "u1");
});
