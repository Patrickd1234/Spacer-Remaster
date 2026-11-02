// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectDepartmentIds, canCreateProjects } from "./projectPermissions.js";

const departments = [
    { team_space_id: "a", role: "member", name: "Design" },
    { team_space_id: "b", role: "team_lead", name: "Marketing" },
    { team_space_id: 3, role: "admin", name: "Sales" },
    { team_space_id: "d", role: "viewer", name: "Support" },
];

test("team leads and admins can create projects in their department", () => {
    assert.deepEqual(projectDepartmentIds(departments), ["b", "3"]);
});

test("members and viewers can't create projects", () => {
    const plain = [departments[0], departments[3]];
    assert.deepEqual(projectDepartmentIds(plain), []);
    assert.equal(canCreateProjects({ isSuperAdmin: false, departments: plain }), false);
});

test("a team lead or admin anywhere can create projects", () => {
    assert.equal(canCreateProjects({ isSuperAdmin: false, departments }), true);
});

test("super admins can always create projects, even with no department", () => {
    assert.equal(canCreateProjects({ isSuperAdmin: true, departments: [] }), true);
});

test("missing departments are treated as none", () => {
    assert.deepEqual(projectDepartmentIds(undefined), []);
    assert.equal(canCreateProjects({ isSuperAdmin: false }), false);
});
