// The sign-in logo: a little grey rocket climbing past a few asteroids. The
// rocket takes the text colour it sits in (text-soft, a light grey, by
// default), the asteroids the muted palette role, so both follow dark and
// light mode.
export default function RocketLogo({ size = 24, className = "text-soft" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Spacer" className={`shrink-0 ${className}`}>
            {/* Asteroids: solid, with a firm outline so they read at small sizes */}
            <g fill="rgb(var(--c-muted))" stroke="rgb(var(--c-faint))" strokeWidth="1" strokeLinejoin="round">
                <path d="M3 9 L7 5.5 L12 8 L11.5 13 L5.5 13.5 Z" />
                <path d="M36 37 L40.5 33.5 L45.5 37.5 L43 43 L37 42 Z" />
                <path d="M38.5 7.5 L42 5.5 L44.5 8.5 L42 11 Z" />
                <path d="M4 37 L7.5 35 L10 38 L7 40.5 Z" />
                <circle cx="44" cy="22.5" r="1.8" />
            </g>
            {/* Rocket, tilted toward the top right */}
            <g transform="rotate(40 24 24)">
                <path d="M24 6 C29 11 31 18 30 28 L18 28 C17 18 19 11 24 6 Z" fill="currentColor" />
                <path d="M18 21 L13 30 L18 29 Z M30 21 L35 30 L30 29 Z" fill="currentColor" opacity="0.75" />
                <circle cx="24" cy="17" r="3" fill="rgb(var(--c-canvas))" />
                <rect x="20" y="28" width="8" height="2.5" rx="1" fill="currentColor" opacity="0.6" />
                <path d="M21 30.5 Q24 40 27 30.5 Z" fill="#F97316" />
                <path d="M22.5 30.5 Q24 36 25.5 30.5 Z" fill="#FACC15" />
            </g>
        </svg>
    )
}
