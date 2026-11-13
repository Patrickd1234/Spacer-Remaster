// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPermissionIndex, can, canAnywhere, roleKey, roleName, highestRoleName, EMPTY_PERMISSIONS } from "./permissions.js";

const DEV = "11111111-1111-1111-1111-111111111111";
const DESIGN = "22222222-2222-2222-2222-222222222222";

// What my_permissions() returns for a team lead of DEV who is a member of DESIGN
const teamLeadRows = [
    { team_space_id: DEV, permission: "project.view" },
    { team_space_id: DEV, permission: "project.create" },
    { team_space_id: DESIGN, permission: "project.view" },
];
// ...and for an organization admin: no department means everywhere
const orgAdminRows = [
    { team_space_id: null, permission: "project.create" },
    { team_space_id: null, permission: "announcement.manage" },
];

test("a department permission holds only in the department that grants it", () => {
    const index = buildPermissionIndex(teamLeadRows);
    assert.equal(can(index, "project.create", DEV), true);
    assert.equal(can(index, "project.create", DESIGN), false);
});

test("an organization-wide permission holds in every department and with none named", () => {
    const index = buildPermissionIndex(orgAdminRows);
    assert.equal(can(index, "project.create", DEV), true);
    assert.equal(can(index, "project.create", DESIGN), true);
    assert.equal(can(index, "announcement.manage"), true);
});

test("a department permission does not answer an organization question", () => {
    const index = buildPermissionIndex(teamLeadRows);
    assert.equal(can(index, "project.create"), false);
});

test("department ids compare as text, whatever type the caller holds", () => {
    const index = buildPermissionIndex([{ team_space_id: 42, permission: "project.view" }]);
    assert.equal(can(index, "project.view", "42"), true);
    assert.equal(can(index, "project.view", 42), true);
});

test("an unknown permission, no rows, or no index is always a no", () => {
    assert.equal(can(buildPermissionIndex(teamLeadRows), "project.delete", DEV), false);
    assert.equal(can(buildPermissionIndex([]), "project.view", DEV), false);
    assert.equal(can(buildPermissionIndex(null), "project.view", DEV), false);
    assert.equal(can(EMPTY_PERMISSIONS, "project.view", DEV), false);
    assert.equal(can(undefined, "project.view", DEV), false);
});

test("canAnywhere is true with the permission in any department or organization-wide", () => {
    assert.equal(canAnywhere(buildPermissionIndex(teamLeadRows), "project.create"), true);
    assert.equal(canAnywhere(buildPermissionIndex(orgAdminRows), "project.create"), true);
    assert.equal(canAnywhere(buildPermissionIndex(teamLeadRows), "project.delete"), false);
});

test("a membership row reads as a role the same way the database reads it", () => {
    assert.equal(roleKey(DEV, "super_admin"), "owner");
    assert.equal(roleKey(null, "super_admin"), "owner");
    assert.equal(roleKey(null, "admin"), "org_admin");
    assert.equal(roleKey(DEV, "admin"), "department_admin");
    assert.equal(roleKey(DEV, "team_lead"), "team_lead");
    assert.equal(roleKey(DEV, "member"), "member");
    assert.equal(roleKey(DEV, "viewer"), "viewer");
});

test("roles have display names, and an unknown one falls back to Member", () => {
    assert.equal(roleName("org_admin"), "Organization Admin");
    assert.equal(roleName("department_admin"), "Department Admin");
    assert.equal(roleName("something_else"), "Member");
});

test("the highest role across someone's memberships names them", () => {
    const memberships = [
        { team_space_id: DEV, role: "member" },
        { team_space_id: DESIGN, role: "admin" },
    ];
    assert.equal(highestRoleName(memberships), "Department Admin");
    assert.equal(highestRoleName([...memberships, { team_space_id: null, role: "admin" }]), "Organization Admin");
    assert.equal(highestRoleName([]), "Member");
    assert.equal(highestRoleName(null), "Member");
});
