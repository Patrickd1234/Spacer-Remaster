// Placeholder for a feature that isn't built yet. Shown disabled with a
// "Coming soon" badge instead of a UI that pretends to work.
export default function ComingSoonCard({ icon, title, description }) {
    return (
        <div className="p-md rounded-xl bg-surface-container-low border border-outline-variant flex flex-col justify-between space-y-4 opacity-70">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center border border-outline-variant">
                        <span className="material-symbols-outlined text-on-surface">{icon}</span>
                    </div>
                    <div>
                        <h3 className="font-body-md font-bold text-on-surface">{title}</h3>
                        <p className="text-xs text-on-surface-variant">{description}</p>
                    </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded font-semibold bg-surface-container-highest text-on-surface-variant shrink-0">
                    COMING SOON
                </span>
            </div>
            <button
                type="button"
                disabled
                className="w-full py-2 bg-surface-container-highest border border-outline-variant text-on-surface-variant font-body-sm font-semibold rounded-xl cursor-not-allowed"
            >
                Not available yet
            </button>
        </div>
    );
}
