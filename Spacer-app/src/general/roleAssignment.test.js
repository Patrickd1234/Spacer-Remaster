// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { departmentRoleKey, isOwner, canEditRoles, DEPARTMENT_ROLE_OPTIONS } from "./roleAssignment.js";

const DEV = "11111111-1111-1111-1111-111111111111";
const DESIGN = "22222222-2222-2222-2222-222222222222";
const person = { id: "p1", orgRole: null, teams: [{ id: DEV, name: "Dev", role: "admin" }, { id: DESIGN, name: "Design", role: "member" }] };

test("a person's role in a department reads as the role key the database uses", () => {
    assert.equal(departmentRoleKey(person, DEV), "department_admin");
    assert.equal(departmentRoleKey(person, DESIGN), "member");
});

test("no membership in a department is the empty option", () => {
    assert.equal(departmentRoleKey(person, "33333333-3333-3333-3333-333333333333"), "");
    assert.equal(departmentRoleKey({ id: "p2", teams: [] }, DEV), "");
});

test("the empty option is first and owner is never offered", () => {
    assert.equal(DEPARTMENT_ROLE_OPTIONS[0].key, "");
    assert.ok(!DEPARTMENT_ROLE_OPTIONS.some((o) => o.key === "owner" || o.key === "org_admin"));
});

test("owners are recognised from the organization role", () => {
    assert.equal(isOwner({ ...person, orgRole: "owner" }), true);
    assert.equal(isOwner({ ...person, orgRole: "org_admin" }), false);
    assert.equal(isOwner(person), false);
});

test("roles can be edited only by someone allowed to, on others, and never on an owner", () => {
    assert.equal(canEditRoles({ person, viewerId: "me", canAssign: true }), true);
    assert.equal(canEditRoles({ person, viewerId: "me", canAssign: false }), false);
    assert.equal(canEditRoles({ person, viewerId: "p1", canAssign: true }), false);
    assert.equal(canEditRoles({ person: { ...person, orgRole: "owner" }, viewerId: "me", canAssign: true }), false);
});
