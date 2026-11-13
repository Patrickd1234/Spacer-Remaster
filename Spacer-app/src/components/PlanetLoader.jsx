// The app's loading indicator: a planet with a moon circling it (styles under
// .planet-loader in index.css). Drawn with CSS, so it shows before the icon
// font has loaded. It is 1em square and uses the text colour, so size and
// colour it like an icon: <PlanetLoader className="text-[16px] text-accent-ink" />.
// Pass `label` when nothing next to it says what is loading.
export default function PlanetLoader({ className = "", label = null }) {
    return (
        <span
            className={`planet-loader ${className}`}
            role={label ? "status" : undefined}
            aria-label={label || undefined}
            aria-hidden={label ? undefined : "true"}
        >
            <span className="planet-loader__orbit" />
            <span className="planet-loader__planet" />
            <span className="planet-loader__moon" />
        </span>
    )
}
