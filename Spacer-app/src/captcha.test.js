import { test } from "node:test"
import assert from "node:assert/strict"
import { captchaSiteKey, withCaptcha, isCaptchaSolved } from "./captcha.js"

test("CAPTCHA is off without a site key", () => {
    assert.equal(captchaSiteKey({}), "")
    assert.equal(captchaSiteKey({ VITE_TURNSTILE_SITE_KEY: "   " }), "")
    assert.equal(captchaSiteKey(undefined), "")
})

test("reads the site key", () => {
    assert.equal(captchaSiteKey({ VITE_TURNSTILE_SITE_KEY: " 0x4AAA " }), "0x4AAA")
})

test("adds the token to Supabase auth options without changing them", () => {
    const options = { emailRedirectTo: "https://example.test/login" }
    assert.deepEqual(withCaptcha(options, "tok"), { emailRedirectTo: "https://example.test/login", captchaToken: "tok" })
    assert.deepEqual(options, { emailRedirectTo: "https://example.test/login" })
})

test("leaves options alone without a token", () => {
    const options = { redirectTo: "x" }
    assert.equal(withCaptcha(options, ""), options)
    assert.deepEqual(withCaptcha(undefined, ""), {})
})

test("a form can be sent once the CAPTCHA is solved, or always when it's off", () => {
    assert.equal(isCaptchaSolved(false, ""), true)
    assert.equal(isCaptchaSolved(true, ""), false)
    assert.equal(isCaptchaSolved(true, "tok"), true)
})
