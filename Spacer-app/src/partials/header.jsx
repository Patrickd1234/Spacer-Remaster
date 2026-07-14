import { useState } from "react";

function Header({ searchQuery, onSearchChange }) {
    const [showNotifications, setShowNotifications] = useState(false);

    return (
        <>
            {/* HEADER */}
            <header className="h-16 flex items-center justify-between gap-3 px-3 sm:px-lg w-full border-b border-outline-variant bg-surface-container-low sticky top-0 z-40">
                <div className="ml-auto flex items-center gap-2 sm:gap-3">
                    <div className="relative w-full max-w-[220px] sm:max-w-[260px]">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                        <input
                            className="w-full bg-surface-container-highest border-none rounded-lg pl-10 pr-md py-2 text-on-surface font-body-sm focus:ring-1 focus:ring-primary-fixed"
                            placeholder="Search..."
                            type="text"
                            value={searchQuery}
                            onChange={(event) => onSearchChange(event.target.value)}
                        />
                    </div>
                    <div className="relative">
                        <button
                            className="p-2 text-on-surface-variant hover:bg-surface-variant rounded-full transition-colors relative"
                            onClick={() => setShowNotifications((prev) => !prev)}
                            aria-label="Notifications"
                        >
                            <span className="material-symbols-outlined">notifications</span>
                            <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border-2 border-surface-container-low"></span>
                        </button>
                        {showNotifications && (
                            <div className="absolute right-0 mt-2 w-72 rounded-xl border border-outline-variant bg-surface-container-low shadow-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="font-label-md text-on-surface">Notifications</p>
                                    <button className="text-sm text-primary-fixed" onClick={() => setShowNotifications(false)}>Close</button>
                                </div>
                                <div className="space-y-2">
                                    <div className="rounded-lg bg-surface-container-highest p-2">
                                        <p className="font-body-sm text-on-surface">New project shared with you</p>
                                        <p className="text-xs text-on-surface-variant">5 min ago</p>
                                    </div>
                                    <div className="rounded-lg bg-surface-container-highest p-2">
                                        <p className="font-body-sm text-on-surface">Weekly report is ready</p>
                                        <p className="text-xs text-on-surface-variant">1 hour ago</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>
        </>
    )
}

export default Header