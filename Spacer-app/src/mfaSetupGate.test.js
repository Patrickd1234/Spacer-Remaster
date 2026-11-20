import { test } from "node:test"
import assert from "node:assert/strict"
import { mfaSetupState, hasVerifiedFactor } from "./mfaSetupGate.js"

test("nothing to set up when signed out", () => {
    assert.equal(mfaSetupState({ userId: null, hasVerifiedFactor: false, check: null }), "none")
})

test("nothing to set up once the account has an authenticator app", () => {
    assert.equal(mfaSetupState({ userId: "u1", hasVerifiedFactor: true, check: null }), "none")
})

test("waits for the server's answer for this user", () => {
    assert.equal(mfaSetupState({ userId: "u1", hasVerifiedFactor: false, check: null }), "checking")
    // An answer for someone else (previous sign-in) doesn't count
    assert.equal(mfaSetupState({ userId: "u1", hasVerifiedFactor: false, check: { userId: "u0", required: false } }), "checking")
})

test("managers without two-factor must set it up", () => {
    assert.equal(mfaSetupState({ userId: "u1", hasVerifiedFactor: false, check: { userId: "u1", required: true } }), "required")
})

test("members without two-factor carry on", () => {
    assert.equal(mfaSetupState({ userId: "u1", hasVerifiedFactor: false, check: { userId: "u1", required: false } }), "none")
})

test("only verified factors count", () => {
    assert.equal(hasVerifiedFactor({ factors: [{ status: "unverified" }] }), false)
    assert.equal(hasVerifiedFactor({ factors: [{ status: "verified" }] }), true)
    assert.equal(hasVerifiedFactor(null), false)
})
