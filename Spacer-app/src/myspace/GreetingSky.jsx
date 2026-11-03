// The sun or moon in dark glasses beside the My Space greeting. Morning: a sun
// with brows up and a big grin. Afternoon: a sun, relaxed and smiling. Evening:
// a moon whose glasses have slipped down to show sleepy eyes. It moves gently
// (see .greeting-sky in index.css), and stays still for people who ask for
// reduced motion. Colours come from the .sun-*, .moon-* and .sky-* classes in
// index.css, so they follow the theme (dark now, html.light later).

const MOODS = {
    "Good morning": { key: "morning", body: "sun", label: "A grinning sun in dark glasses" },
    "Good afternoon": { key: "afternoon", body: "sun", label: "A smiling sun in dark glasses" },
    "Good evening": { key: "evening", body: "moon", label: "A sleepy moon, dark glasses slipping down" },
}

// Eight long, faint rays around the sun, from just outside its edge
const SUN_RAYS = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4
    const point = (r) => `${(20 + r * Math.cos(angle)).toFixed(2)} ${(20 + r * Math.sin(angle)).toFixed(2)}`
    return `M${point(15)} L${point(20)}`
}).join(" ")

function Sun() {
    return (
        <>
            <path d={SUN_RAYS} className="sun-ray" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="20" cy="20" r="13" className="sun-body" />
        </>
    )
}

function Moon() {
    return (
        <>
            <circle cx="20" cy="20" r="16" className="moon-body" />
            <circle cx="9.5" cy="29" r="2.2" className="moon-crater" />
            <circle cx="30" cy="29.5" r="1.8" className="moon-crater" />
            <circle cx="20" cy="34" r="1.3" className="moon-crater" />
        </>
    )
}

// Solid lenses on a frame; lensY is how far down the nose they sit
function Glasses({ lensY }) {
    return (
        <>
            <rect x="8.5" y={lensY - 4} width="10" height="8" rx="3.5" className="sky-ink" />
            <rect x="21.5" y={lensY - 4} width="10" height="8" rx="3.5" className="sky-ink" />
            <path d={`M18.5 ${lensY - 1} Q20 ${lensY - 2.4} 21.5 ${lensY - 1}`} className="sky-line" strokeWidth="1.6" />
            <path d={`M8.5 ${lensY - 2} L5 ${lensY - 3.6} M31.5 ${lensY - 2} L35 ${lensY - 3.6}`} className="sky-line" strokeWidth="1.4" strokeLinecap="round" />
            {/* Glint */}
            <path d={`M10.6 ${lensY - 1.6} L12.6 ${lensY - 2.8} M23.6 ${lensY - 1.6} L25.6 ${lensY - 2.8}`} className="sky-glint" strokeWidth="1.1" strokeLinecap="round" />
        </>
    )
}

function Face({ mood }) {
    if (mood === "morning") {
        return (
            <>
                {/* Brows raised high */}
                <path d="M10 11 Q13.5 8.8 17 11 M23 11 Q26.5 8.8 30 11" className="sky-line" strokeWidth="1.4" strokeLinecap="round" />
                <Glasses lensY={17} />
                <path d="M14.5 24 Q20 30.5 25.5 24 Z" className="sky-ink" />
            </>
        )
    }
    if (mood === "afternoon") {
        return (
            <>
                {/* Brows relaxed */}
                <path d="M10.5 11.8 Q13.5 10.8 16.5 11.8 M23.5 11.8 Q26.5 10.8 29.5 11.8" className="sky-line" strokeWidth="1.4" strokeLinecap="round" />
                <Glasses lensY={17} />
                <path d="M15.5 25 Q20 28.8 24.5 25" className="sky-line" strokeWidth="1.5" strokeLinecap="round" />
            </>
        )
    }
    // Evening: glasses slipped down, heavy lids showing above them
    return (
        <>
            <path d="M10.5 14 Q13.5 15.8 16.5 14 M23.5 14 Q26.5 15.8 29.5 14" className="sky-line" strokeWidth="1.4" strokeLinecap="round" />
            <Glasses lensY={21.5} />
            <path d="M17.5 29.5 Q20 30.9 22.5 29.5" className="sky-line" strokeWidth="1.4" strokeLinecap="round" />
        </>
    )
}

export default function GreetingSky({ greeting }) {
    const mood = MOODS[greeting] || MOODS["Good morning"]
    return (
        <svg
            viewBox="0 0 40 40"
            role="img"
            aria-label={mood.label}
            className={`greeting-sky greeting-sky--${mood.key} inline-block w-9 h-9 align-middle ml-1`}
        >
            {mood.body === "sun" ? <Sun /> : <Moon />}
            {mood.body === "sun" && (
                <>
                    <circle cx="11" cy="23.5" r="2" className="sky-cheek" />
                    <circle cx="29" cy="23.5" r="2" className="sky-cheek" />
                </>
            )}
            <Face mood={mood.key} />
            {mood.key === "evening" && (
                <text x="31" y="9" fontSize="8" fontWeight="700" className="moon-z">z</text>
            )}
        </svg>
    )
}
