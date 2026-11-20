import { useEffect, useRef } from "react"

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
let scriptPromise = null

// Loads Cloudflare's Turnstile script once per page
function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile)
    if (!scriptPromise) {
        scriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script")
            script.src = SCRIPT_URL
            script.async = true
            script.onload = () => resolve(window.turnstile)
            script.onerror = () => {
                scriptPromise = null
                reject(new Error("The CAPTCHA could not load"))
            }
            document.head.appendChild(script)
        })
    }
    return scriptPromise
}

// Cloudflare Turnstile widget. Renders nothing when CAPTCHA is off (no site
// key). Reports the token through onToken ("" when it expires or fails);
// changing resetKey asks for a fresh one. State lives in useCaptcha().
export default function Captcha({ siteKey, onToken, resetKey = 0 }) {
    const containerRef = useRef(null)
    const widgetIdRef = useRef(null)
    const onTokenRef = useRef(onToken)

    useEffect(() => {
        onTokenRef.current = onToken
    }, [onToken])

    useEffect(() => {
        if (!siteKey || !containerRef.current) return undefined
        let active = true
        loadTurnstile()
            .then((turnstile) => {
                if (!active || !containerRef.current) return
                widgetIdRef.current = turnstile.render(containerRef.current, {
                    sitekey: siteKey,
                    theme: document.documentElement.classList.contains("light") ? "light" : "dark",
                    callback: (token) => onTokenRef.current?.(token),
                    "expired-callback": () => onTokenRef.current?.(""),
                    "error-callback": () => onTokenRef.current?.(""),
                })
            })
            .catch((err) => console.error(err))
        return () => {
            active = false
            if (widgetIdRef.current !== null) window.turnstile?.remove(widgetIdRef.current)
            widgetIdRef.current = null
        }
    }, [siteKey])

    // A used token can't be sent again: get a new one
    useEffect(() => {
        if (resetKey === 0 || widgetIdRef.current === null) return
        window.turnstile?.reset(widgetIdRef.current)
    }, [resetKey])

    if (!siteKey) return null
    return <div ref={containerRef} className="flex justify-center min-h-[65px]" />
}
