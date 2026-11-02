// Placeholder for a feature that isn't built yet. Shown disabled with a
// "Coming soon" badge instead of a UI that pretends to work.
export default function ComingSoonCard({ icon, title, description }) {
    return (
        <div className="p-md rounded-xl bg-panel border border-line flex flex-col justify-between space-y-4 opacity-70">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-field flex items-center justify-center border border-line">
                        <span className="material-symbols-outlined text-white">{icon}</span>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white">{title}</h3>
                        <p className="text-xs text-muted">{description}</p>
                    </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded font-semibold bg-field text-muted shrink-0">
                    COMING SOON
                </span>
            </div>
            <button
                type="button"
                disabled
                className="w-full py-2 bg-field border border-line text-muted text-xs font-semibold rounded-xl cursor-not-allowed"
            >
                Not available yet
            </button>
        </div>
    );
}
