import { useEffect, useRef, useState } from "react"

const DURATION_MS = 700

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

// Eases a number from its previous value to `value` whenever `value` changes.
export default function AnimatedNumber({ value, className, style }) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const to = Number(value) || 0
    if (from === to) return undefined

    let frameId
    const start = performance.now()
    const duration = prefersReducedMotion() ? 0 : DURATION_MS

    const tick = (now) => {
      const t = duration === 0 ? 1 : Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = Math.round(from + (to - from) * eased)
      fromRef.current = next
      setDisplay(next)
      if (t < 1) frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [value])

  return (
    <span className={className} style={style}>
      {display}
    </span>
  )
}
