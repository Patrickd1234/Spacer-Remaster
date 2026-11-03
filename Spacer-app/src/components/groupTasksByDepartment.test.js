// Run with: node --test src/components/groupTasksByDepartment.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupTasksByDepartment } from "./groupTasksByDepartment.js";

const departments = [{ id: "d1", name: "Design" }, { id: "d2", name: "Marketing" }];
const task = (id, projectId, projectName, deptId) => ({
    id, title: `Task ${id}`, project_id: projectId, project_name: projectName, project_team_space_id: deptId,
});

test("groups tasks under their department, then project", () => {
    const groups = groupTasksByDepartment([
        task(1, "p1", "Website", "d1"),
        task(2, "p2", "Campaign", "d2"),
        task(3, "p1", "Website", "d1"),
    ], departments);

    assert.deepEqual(groups.map((g) => g.name), ["Design", "Marketing"]);
    assert.deepEqual(groups[0].projects.map((p) => [p.name, p.tasks.map((t) => t.id)]), [["Website", [1, 3]]]);
    assert.equal(groups[0].taskCount, 2);
    assert.equal(groups[1].taskCount, 1);
});

test("keeps the given department order and sorts projects by name", () => {
    const groups = groupTasksByDepartment([
        task(1, "p2", "zeta", "d2"),
        task(2, "p3", "Alpha", "d2"),
        task(3, "p1", "Website", "d1"),
    ], departments);

    assert.deepEqual(groups.map((g) => g.name), ["Design", "Marketing"]);
    assert.deepEqual(groups[1].projects.map((p) => p.name), ["Alpha", "zeta"]);
});

test("puts tasks without a project or department last", () => {
    const groups = groupTasksByDepartment([
        task(1, null, null, null),
        task(2, "p9", "Orphan", "unknown-dept"),
        task(3, "p1", "Website", "d1"),
    ], departments);

    assert.deepEqual(groups.map((g) => g.name), ["Design", "No department"]);
    assert.deepEqual(groups[1].projects.map((p) => p.name), ["Orphan", "No project"]);
});

test("leaves out departments with no tasks and handles empty input", () => {
    assert.deepEqual(groupTasksByDepartment([], departments), []);
    assert.deepEqual(groupTasksByDepartment(undefined, undefined), []);
});

test("does not expose assignees in the grouping", () => {
    const [group] = groupTasksByDepartment([{ ...task(1, "p1", "Website", "d1"), assignee_id: "u1" }], departments);
    assert.deepEqual(Object.keys(group).sort(), ["id", "name", "projects", "taskCount"]);
    assert.deepEqual(Object.keys(group.projects[0]).sort(), ["id", "name", "tasks"]);
});
