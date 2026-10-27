import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"
import { useState, useEffect } from "react"
import { supabase, getSessionUser } from "./supabase"
import { useRole } from "./RoleContext"
import CreateTaskModal from "./partials/CreateTaskModal"
import OrgOverview from "./OrgOverview"
import MySpace from "./myspace/MySpace"
import { StatCardSkeleton } from "./components/DashboardParts"
import { TASK_CREATED_EVENT } from "./appEvents"

// Super admins land on the organization overview, everyone else on My Space
function Home() {
    const [userEmail] = useState(() => localStorage.getItem("userEmail") || "")
    const [userData, setUserData] = useState(null)
    const [orgId, setOrgId] = useState(null)
    const [orgName, setOrgName] = useState("")
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false)
    const { isSuperAdmin, roleLoading, membershipData } = useRole()

    useEffect(() => {
        if (roleLoading) return
        let active = true
        const init = async () => {
            try {
                const sessionUser = await getSessionUser()
                if (!sessionUser?.id) return

                const { data: profile } = await supabase.from("users").select("*").eq("id", sessionUser.id).maybeSingle()
                if (!active) return
                setUserData(profile || { id: sessionUser.id, email: sessionUser.email })
                if (!isSuperAdmin) return

                let resolvedOrgId = profile?.organization_id || sessionUser.user_metadata?.organization_id
                if (!resolvedOrgId && membershipData?.team_space_id) {
                    const { data: tsData } = await supabase.from("team_spaces").select("organization_id").eq("id", membershipData.team_space_id).maybeSingle()
                    resolvedOrgId = tsData?.organization_id
                }
                if (!active) return
                setOrgId(resolvedOrgId || null)
                if (resolvedOrgId) {
                    const { data: org, error } = await supabase.from("organizations").select("name").eq("id", resolvedOrgId).maybeSingle()
                    if (error) console.warn("organizations fetch error:", error)
                    if (active) setOrgName(org?.name || "")
                }
            } catch (err) {
                console.error("Home init error:", err)
            }
        }
        init()
        return () => { active = false }
    }, [isSuperAdmin, roleLoading, membershipData])

    const displayName = userData?.full_name || userData?.name || userEmail.split("@")[0] || "there"
    const isReady = !roleLoading && Boolean(userData)

    return (
        <div className="bg-[#0F1115] min-h-screen text-white font-sans antialiased flex">
            <Sidebar onCollapsedChange={setSidebarCollapsed} userData={userData} userEmail={userEmail} />
            <div className="flex-1 flex flex-col min-w-0">
                <Header
                    breadcrumb={isSuperAdmin ? { icon: "home", label: "Home" } : { icon: "person", label: "My Space" }}
                    insetLeft={sidebarCollapsed ? 72 : 260}
                />
                <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} flex-1 flex flex-col pt-16 transition-all duration-300 ease-out`}>
                    <div className="p-8 space-y-6 max-w-[1400px] w-full mx-auto">
                        {!isReady && (
                            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {[0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} />)}
                            </section>
                        )}

                        {isReady && isSuperAdmin && (
                            <>
                                <section>
                                    <h1 className="text-2xl font-semibold text-white">{orgName || "Your Organization"}</h1>
                                    <p className="text-[#8c947b] text-sm mt-1">Organization's overview and activity.</p>
                                </section>
                                <OrgOverview userId={userData.id} orgId={orgId} />
                            </>
                        )}

                        {isReady && !isSuperAdmin && <MySpace userId={userData.id} displayName={displayName} />}
                    </div>
                </main>
            </div>

            {/* Members create tasks from the header's Create menu; super admins keep this button */}
            {isSuperAdmin && (
                <button
                    type="button"
                    onClick={() => setIsCreateTaskModalOpen(true)}
                    className="fixed bottom-[96px] right-lg w-14 h-14 bg-primary-fixed-dim text-on-primary rounded-full shadow-[0_8px_32px_rgba(182,255,51,0.3)] flex items-center justify-center hover:scale-105 transition-transform active:scale-95 group z-30 cursor-pointer"
                >
                    <span className="material-symbols-outlined text-[28px] font-bold">add</span>
                    <span className="absolute right-full mr-md px-md py-sm bg-[#191c21] text-white font-label-md text-label-md rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap border border-[#2D3139]">
                        Add Task
                    </span>
                </button>
            )}

            {isCreateTaskModalOpen && (
                <CreateTaskModal
                    organizationId={userData?.organization_id}
                    onClose={() => setIsCreateTaskModalOpen(false)}
                    onCreated={(task) => window.dispatchEvent(new CustomEvent(TASK_CREATED_EVENT, { detail: task }))}
                />
            )}
        </div>
    )
}

export default Home
