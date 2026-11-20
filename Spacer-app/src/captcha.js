// CAPTCHA (Cloudflare Turnstile) on sign-in, sign-up and password reset.
// Off until VITE_TURNSTILE_SITE_KEY is set, so local development keeps
// working without keys. Once CAPTCHA protection is turned on in Supabase
// (Authentication -> Attack Protection), Supabase refuses those requests
// without a token, so the site key must be set in the same deploy.
// Kept free of imports so `npm test` can load it without Supabase.

export function captchaSiteKey(env = import.meta.env) {
    return (env?.VITE_TURNSTILE_SITE_KEY || "").trim()
}

// Supabase auth options with the token added (each token works only once)
export function withCaptcha(options = {}, token = "") {
    return token ? { ...options, captchaToken: token } : options
}

// Can the form be sent? Always when CAPTCHA is off; otherwise once solved
export function isCaptchaSolved(isEnabled, token) {
    return !isEnabled || Boolean(token)
}
