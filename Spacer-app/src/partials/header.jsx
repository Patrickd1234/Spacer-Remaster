import { useState } from "react";

function Header({ onSearch = () => {} }) {
    const [showNotifications, setShowNotifications] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    return (
        <>
            {/* HEADER */}
            <header className="h-16 flex items-center justify-between gap-3 px-3 sm:px-lg w-full border-b border-[#2D3139] bg-[#0F1115] sticky top-0 z-40">
                <div className="ml-auto flex items-center gap-2 sm:gap-3">
                    <div className="relative w-full max-w-[220px] sm:max-w-[260px]">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#8c947b]">search</span>
                        <input
                            className="w-full bg-[#191c21] border border-[#2D3139] rounded-lg pl-10 pr-4 py-2 text-white font-body-sm focus:ring-1 focus:ring-[#aff82a] focus:outline-none transition-colors"
                            placeholder="Search..."
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                onSearch(e.target.value);
                            }}
                        />
                    </div>
                    <div className="relative">
                        <button
                            className="p-2 text-[#8c947b] hover:text-white hover:bg-[#2D3139] rounded-full transition-colors relative"
                            onClick={() => setShowNotifications((prev) => !prev)}
                            aria-label="Notifications"
                        >
                            <span className="material-symbols-outlined">notifications</span>
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-[#0F1115]"></span>
                        </button>
                        {showNotifications && (
                            <div className="absolute right-0 mt-2 w-72 rounded-xl border border-[#2D3139] bg-[#191c21] shadow-xl p-3">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-sm font-bold text-white">Notifications</p>
                                    <button className="text-xs text-[#aff82a] hover:underline" onClick={() => setShowNotifications(false)}>Close</button>
                                </div>
                                <div className="space-y-2">
                                    <div className="rounded-lg bg-[#252a33] p-3 border border-[#2D3139]">
                                        <p className="text-sm text-white">New project shared with you</p>
                                        <p className="text-xs text-[#8c947b] mt-1">5 min ago</p>
                                    </div>
                                    <div className="rounded-lg bg-[#252a33] p-3 border border-[#2D3139]">
                                        <p className="text-sm text-white">Weekly report is ready</p>
                                        <p className="text-xs text-[#8c947b] mt-1">1 hour ago</p>
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