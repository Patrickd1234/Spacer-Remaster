import Sidebar from "./partials/sidebar"
import Header from "./partials/header"
import { useState, useEffect } from "react"
import { supabase } from "./supabase"

function Home() {
    const [userEmail, setUserEmail] = useState("")
    const [userData, setUserData] = useState(null)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [sidebarHovered, setSidebarHovered] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const sidebarExpanded = !sidebarCollapsed || sidebarHovered

    useEffect(() => {
        const email = localStorage.getItem("userEmail")
        if (email) {
            setUserEmail(email)
            const fetchUser = async () => {
                const { data, error } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
                if (error) console.log(error)
                if (data) {
                    console.log("User profile:", data)
                    setUserData(data)
                }
            }
            fetchUser()
        } else {
            console.log("No user email found")
        }
    }, [])
    return (
        <>
            <Sidebar
                collapsed={sidebarCollapsed}
                hovered={sidebarHovered}
                searchQuery={searchQuery}
                userEmail={userEmail}
                userData={userData}
                onToggle={() => setSidebarCollapsed((prev) => !prev)}
                onHoverChange={setSidebarHovered}
            />
            <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
            <main className={`${sidebarExpanded ? "ml-[260px]" : "ml-[72px]"} transition-all duration-300 ease-out flex-1 flex flex-col min-h-screen`}>
                <div className="p-lg space-y-lg">
                    {/* GREETING SECTION */}
                    <section>
                        <h1 className="text-headline-xl font-bold text-on-surface flex items-center gap-2">Hello, {userData?.name || userEmail || "User"} 👋</h1>
                        <p className="text-on-surface-variant font-body-md mt-1">Here's what's on your plate in this workspace.</p>
                    </section>

                    {/* METRICS ROW */}
                    <section className="grid grid-cols-1 md:grid-cols-4 gap-md">
                        <div className="glass-card p-lg rounded-xl flex flex-col">
                            <p className="text-headline-xl font-bold">0</p>
                            <p className="text-on-surface-variant font-body-sm mt-1">To do</p>
                        </div>
                        <div className="glass-card p-lg rounded-xl flex flex-col">
                            <p className="text-headline-xl font-bold text-primary-fixed">0</p>
                            <p className="text-on-surface-variant font-body-sm mt-1">In progress</p>
                        </div>
                        <div className="glass-card p-lg rounded-xl flex flex-col">
                            <p className="text-headline-xl font-bold text-primary-container">0</p>
                            <p className="text-on-surface-variant font-body-sm mt-1">Done</p>
                        </div>
                        <div className="glass-card p-lg rounded-xl flex flex-col">
                            <p className="text-headline-xl font-bold text-error">0</p>
                            <p className="text-on-surface-variant font-body-sm mt-1">Overdue</p>
                        </div>
                    </section>

                    {/* MAIN BENTO CONTENT AREA */}
                    <div className="grid grid-cols-12 gap-lg">
                        {/* LEFT COLUMN: MY OPEN WORK */}
                        <div className="col-span-12 lg:col-span-8">
                            <div className="glass-card rounded-xl flex flex-col min-h-[480px]">
                                <div className="p-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low/50 rounded-t-xl">
                                    <h3 className="font-headline-md font-semibold text-on-surface">My open work</h3>
                                    <span className="text-label-sm text-on-surface-variant">0 items</span>
                                </div>
                                <div className="flex-1 flex flex-col items-center justify-center p-xl text-center">
                                    <div className="text-5xl mb-6">🎉</div>
                                    <h4 className="font-headline-md text-on-surface font-semibold">You're all caught up</h4>
                                    <p className="text-on-surface-variant font-body-md max-w-xs mt-2">Nothing assigned to you is open right now.</p>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: RECENT ACTIVITY */}
                        <div className="col-span-12 lg:col-span-4">
                            <div className="glass-card rounded-xl flex flex-col min-h-[480px]">
                                <div className="p-md border-b border-outline-variant bg-surface-container-low/50 rounded-t-xl">
                                    <h3 className="font-headline-md font-semibold text-on-surface">Recent activity</h3>
                                </div>
                                <div className="flex-1 overflow-y-auto p-md space-y-md">
                                    {/* ACTIVITY ITEMS */}
                                    <div className="flex gap-md items-start group">
                                        <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center shrink-0 font-bold text-[10px] text-on-surface-variant">SA</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-body-sm"><span className="font-bold text-on-surface">No Activity Yet</span></p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
            {/* Floating Action Button */}
            <button className="fixed bottom-lg right-lg w-14 h-14 bg-primary-fixed text-on-primary-fixed rounded-full flex items-center justify-center shadow-xl shadow-primary-fixed/30 hover:scale-110 active:scale-95 transition-all z-50 group">
                <span className="material-symbols-outlined text-2xl group-hover:rotate-90 transition-transform">add</span>
            </button>
        </>
    )
}

export default Home;
