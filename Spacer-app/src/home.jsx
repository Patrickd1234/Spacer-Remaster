import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"
import { useState, useEffect } from "react"
import { supabase, getSessionUser } from "./supabase"
import { useRole } from "./RoleContext"
import OrgOverview from "./OrgOverview"
import MySpace from "./myspace/MySpace"
import DepartmentInvites from "./partials/DepartmentInvites"
import HoldupsPanel from "./partials/HoldupsPanel"
import GreetingSky from "./myspace/GreetingSky"
import { greetingFor } from "./myspace/taskStats"
import { StatCardSkeleton } from "./components/DashboardParts"
import { readSavedOrgName, saveOrgName } from "./orgNameCache"

// Super admins land on the organization overview, everyone else on My Space
function Home() {
    const [userEmail] = useState(() => localStorage.getItem("userEmail") || "")
    const [userData, setUserData] = useState(null)
    const [orgId, setOrgId] = useState(null)
    // The last organization name loaded shows straight away (orgNameCache.js)
    const [orgName, setOrgName] = useState(readSavedOrgName)
    const [isOrgNameLoaded, setIsOrgNameLoaded] = useState(false)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const { isSuperAdmin, roleLoading, membershipData } = useRole()
    // Super admins get the same greeting as My Space, above the organization name
    const [greeting] = useState(() => greetingFor(new Date().getHours()))

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

                // Only from the users table: user_metadata is editable by the user (D-06)
                let resolvedOrgId = profile?.organization_id
                if (!resolvedOrgId && membershipData?.team_space_id) {
                    const { data: tsData } = await supabase.from("team_spaces").select("organization_id").eq("id", membershipData.team_space_id).maybeSingle()
                    resolvedOrgId = tsData?.organization_id
                }
                if (!active) return
                setOrgId(resolvedOrgId || null)
                if (!resolvedOrgId) setIsOrgNameLoaded(true)
                if (resolvedOrgId) {
                    const { data: org, error } = await supabase.from("organizations").select("name").eq("id", resolvedOrgId).maybeSingle()
                    if (error) console.warn("organizations fetch error:", error)
                    if (active) {
                        setOrgName(org?.name || "")
                        saveOrgName(org?.name || "")
                        setIsOrgNameLoaded(true)
                    }
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
        <div className="bg-canvas min-h-screen text-white font-sans antialiased flex">
            <Sidebar onCollapsedChange={setSidebarCollapsed} userData={userData} userEmail={userEmail} />
            <div className="flex-1 flex flex-col min-w-0">
                <Header
                    breadcrumb={isSuperAdmin ? { icon: "home", label: "Home" } : { icon: "person", label: "My Space" }}
                    insetLeft={sidebarCollapsed ? 72 : 260}
                />
                <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} flex-1 flex flex-col transition-all duration-300 ease-out`}>
                    <div className="p-8 space-y-6 max-w-[1400px] w-full mx-auto">
                        {!isReady && (
                            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {[0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} />)}
                            </section>
                        )}

                        {isReady && isSuperAdmin && (
                            <>
                                <section>
                                    <p className="text-2xl font-semibold text-white">{greeting}, {displayName} <GreetingSky greeting={greeting} /></p>
                                    <h1 className="text-2xl font-semibold text-white mt-3">
                                        {orgName || (isOrgNameLoaded ? "Your Organization" : <span className="inline-block h-6 w-48 rounded bg-line animate-pulse align-middle" aria-label="Loading organization" />)}
                                    </h1>
                                    <p className="text-muted text-sm mt-1">Organization's overview and activity.</p>
                                </section>
                                <DepartmentInvites />
                                <HoldupsPanel userId={userData.id} />
                                <OrgOverview userId={userData.id} orgId={orgId} />
                            </>
                        )}

                        {isReady && !isSuperAdmin && <MySpace userId={userData.id} displayName={displayName} />}
                    </div>
                </main>
            </div>
            {/* Tasks are created from the header's Create menu */}
        </div>
    )
}

export default Home
