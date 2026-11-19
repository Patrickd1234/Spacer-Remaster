import { useState, useCallback } from "react"
import { captchaSiteKey, isCaptchaSolved } from "./captcha"

// State for one <Captcha> widget. Call reset() after every auth request, since
// Supabase accepts each token only once.
export function useCaptcha() {
    const siteKey = captchaSiteKey()
    const [token, setToken] = useState("")
    const [resetKey, setResetKey] = useState(0)

    const reset = useCallback(() => {
        setToken("")
        setResetKey((key) => key + 1)
    }, [])

    const isEnabled = Boolean(siteKey)
    return { siteKey, isEnabled, token, setToken, reset, resetKey, isSolved: isCaptchaSolved(isEnabled, token) }
}
