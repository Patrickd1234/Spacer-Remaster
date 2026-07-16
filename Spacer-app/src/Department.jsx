import Sidebar from "./partials/sidebar";
import Header from "./partials/header"
import { supabase } from "./supabase";
import { useEffect, useState } from 'react'

function Department() {

    const [dpt_members, setDpt_members] = useState(null);
    const [mem_info, setMem_info] = useState(null);
    const [session_user, setSession_user] = useState(null);

    useEffect(() => {
        const getSessionUserAndFetch = async () => {
            try {
                const { data } = await supabase.auth.getUser();
                const user = data?.user;
                if (user?.id) {
                    setSession_user(user.id);
                    await fetch_dpt(user.id);
                }
            } catch (error) {
                console.log("Auth error:", error);
            }
        };
        getSessionUserAndFetch();
    }, []);

    const fetch_dpt = async (id) => {
        try {
            // 1. Resolve the team_space_id for the current user
            let teamSpaceId = id?.team_space_id;

            if (!teamSpaceId && typeof id === "string") {
                const { data: userMembership, error: memError } = await supabase
                    .from("memberships")
                    .select("team_space_id")
                    .eq("user_id", id);

                if (!memError && userMembership && userMembership.length > 0) {
                    teamSpaceId = userMembership[0].team_space_id;
                }
            }

            if (!teamSpaceId) {
                console.log("No team_space_id found for current user.");
                setDpt_members([]);
                setMem_info([]);
                return null;
            }

            // 2. Select all membership rows that have the same team_space_id as the user
            const { data, error } = await supabase
                .from("memberships")
                .select("*")
                .eq("team_space_id", teamSpaceId);

            if (error) {
                console.log(error);
                return null;
            }

            if (data) {
                setDpt_members(data);

                // 3. Fetch user profiles for each member and combine them cleanly (Method 1)
                const enrichedList = [];
                for (let i = 0; i < data.length; i++) {
                    const { data: userDetails, error: userError } = await supabase
                        .from("users")
                        .select("*")
                        .eq("id", data[i].user_id)
                        .single();

                    if (!userError && userDetails) {
                        enrichedList.push({
                            ...data[i],        // membership fields (role, team_space_id, user_id, etc.)
                            ...userDetails,    // user profile fields (name, display_name, email, avatar_url, etc.)
                            membershipRole: data[i].role,
                            profileRole: userDetails.role
                        });
                    } else {
                        enrichedList.push(data[i]);
                    }
                }
                setMem_info(enrichedList);
                console.log("Combined mem_info:", enrichedList);
            }
        } catch (error) {
            console.log(error);
            return null;
        }
    };

    return (
        <>
            <Sidebar />
            <Header />
            {/*<!-- Main Content Area --> */}
            <main className="ml-sidebar-width flex-1 flex flex-col min-h-screen">
                {/*<!-- TopAppBar Component --> */}
                <header
                    className="h-16 bg-surface-container-low border-b border-outline-variant flex items-center justify-between px-lg sticky top-0 z-40"
                >
                    <div className="flex items-center gap-lg flex-1">
                        <div className="relative w-full max-w-md">
                            <span
                                className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                            >search</span>
                            <input
                                className="w-full bg-surface-variant border-none rounded-full py-2 pl-10 pr-4 text-on-surface focus:ring-1 focus:ring-primary-fixed placeholder:text-on-surface-variant font-body-md text-body-md"
                                placeholder="Search department members..."
                                type="text"
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-md">
                        <div className="flex items-center gap-xs">
                            <button
                                className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant transition-colors"
                            >
                                <span className="material-symbols-outlined">videocam</span>
                            </button>
                            <button
                                className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant relative transition-colors"
                            >
                                <span className="material-symbols-outlined">notifications</span>
                                <span
                                    className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full"
                                ></span>
                            </button>
                        </div>
                        <div className="h-8 w-[1px] bg-outline-variant"></div>
                        <button
                            className="text-on-surface font-medium hover:text-primary transition-colors px-3 py-2 flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined">note_add</span> New Document
                        </button>
                        <button
                            className="bg-primary-container text-on-primary-container font-bold px-lg py-2 rounded-lg hover:opacity-90 transition-opacity active:scale-95"
                        >
                            New Task
                        </button>
                        <div
                            className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary-fixed ml-2"
                        >
                            <img
                                className="w-full h-full object-cover"
                                alt="Close up profile photo of a professional software architect with a focused expression, wearing a dark turtleneck against a clean, charcoal gray studio background. The lighting is soft and directional, highlighting textures and reflecting a modern, tech-focused corporate aesthetic in alignment with a high-performance dark theme."
                                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDnkNgoKDoSaL9AEZksG3JAlvgvOJKqAqrl1vEqS67Ee7wsAP8es46ryGiPNJ-ANLXdAPHNd4wSvN9glPVHB3V9VWtk8fO6E2gHlGlSNIjNyuQvs717zwNrnm-SwTKwa3x8UqmsSHFQw7UfNtRm1URzZjVr-MCuebasvVlvl-qWfK780BIejRsKzfDhxvwzhBrhtldLo268ULDXHwOTG5DhdZuW4yiBzAKpHqo7vXuXQy5kwymPlQTIEA"
                            />
                        </div>
                    </div>
                </header>
                {/*<!-- Content Canvas --> */}
                <div className="p-lg flex-1 overflow-y-auto">
                    {/*<!-- Page Header / Admin Actions Area --> */}
                    <div
                        className="flex flex-col md:flex-row md:items-end justify-between mb-xl gap-lg"
                    >
                        <div>
                            <nav
                                className="flex items-center gap-2 text-on-surface-variant mb-2"
                            ></nav>
                        </div>
                        <div className="flex items-center gap-sm">
                            <button
                                className="flex items-center gap-2 px-md py-sm rounded-lg bg-surface-container-high border border-outline-variant text-on-surface hover:border-error hover:text-error transition-all font-label-md text-label-md"
                            >
                                <span className="material-symbols-outlined">person_remove</span>
                                REMOVE MEMBER</button>
                            <button
                                className="flex items-center gap-2 px-md py-sm rounded-lg bg-primary-fixed text-on-primary-fixed hover:opacity-90 transition-all font-label-md text-label-md"
                            >
                                <span className="material-symbols-outlined">person_add</span> ADD
                                MEMBER
                            </button>
                        </div>
                    </div>
                    {/* Stats/Filter Row 
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter mb-xl">
                        <div
                            className="glass-card rounded-xl p-md flex items-center justify-between"
                            style={{ borderColor: "rgb(66, 73, 52)" }}
                        >
                            <div>
                                <p
                                    className="font-label-sm text-label-sm text-on-surface-variant uppercase"
                                >
                                    Total Members
                                </p>
                                <h3 className="font-headline-lg text-headline-lg font-bold">42</h3>
                            </div>
                            <span
                                className="material-symbols-outlined text-primary-fixed opacity-50"
                            >group</span>
                        </div>
                        <div
                            className="glass-card rounded-xl p-md flex items-center justify-between"
                            style={{ borderColor: "rgb(66, 73, 52)" }}
                        >
                            <div>
                                <p
                                    className="font-label-sm text-label-sm text-on-surface-variant uppercase"
                                >
                                    Active Now
                                </p>
                                <h3 className="font-headline-lg text-headline-lg font-bold">28</h3>
                            </div>
                            <span
                                className="material-symbols-outlined text-primary-fixed opacity-50"
                            >bolt</span>
                        </div>
                        <div
                            className="glass-card rounded-xl p-md flex items-center justify-between"
                            style={{ borderColor: "rgb(66, 73, 52)" }}
                        >
                            <div>
                                <p
                                    className="font-label-sm text-label-sm text-on-surface-variant uppercase"
                                >
                                    Admins
                                </p>
                                <h3 className="font-headline-lg text-headline-lg font-bold">4</h3>
                            </div>
                            <span
                                className="material-symbols-outlined text-primary-fixed opacity-50"
                            >verified</span>
                        </div>
                        <div
                            className="glass-card rounded-xl p-md flex items-center justify-between border-dashed"
                        >
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined">filter_list</span>
                                <span className="font-label-md text-label-md uppercase">Filters</span>
                            </div>
                            <span
                                className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary"
                            >expand_more</span>
                        </div>
                    </div>
                    */}
                    {/*Member Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-lg">
                        {/*Card 1 */}
                        {mem_info?.map((member) => (
                            <div
                                className="glass-card rounded-xl p-md flex flex-col h-full relative group"
                            >
                                <div className="flex items-start justify-between mb-sm">
                                    <div className="relative">
                                        <div
                                            className="w-12 h-12 rounded-xl overflow-hidden border border-outline-variant"
                                        >

                                        </div>
                                        <div className="presence-indicator presence-active"></div>
                                    </div>
                                    <div className="flex gap-1">
                                        <span
                                            className="px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container text-[9px] font-bold uppercase tracking-tighter"
                                        >{member.role}</span>
                                        <button
                                            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-surface-variant text-on-surface-variant"
                                        >
                                            <span className="material-symbols-outlined text-xs"
                                            >more_vert</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="mb-sm">
                                    <h4
                                        className="font-headline-md text-body-lg text-on-surface font-bold"
                                    >
                                        {member.name} {/*User name */}
                                    </h4>
                                    <p className="font-body-sm text-[11px] text-on-surface-variant">
                                        {member.role} {/*User role */}
                                    </p>
                                </div>
                                <div className="mt-auto flex items-center gap-2">
                                    <button
                                        className="flex-1 bg-surface-variant text-on-surface font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5 hover:bg-outline-variant transition-all text-body-sm"
                                    >
                                        <span className="material-symbols-outlined text-sm"
                                        >chat_bubble</span>
                                        Message
                                    </button>
                                    <button
                                        className="w-8 h-8 bg-surface-variant text-on-surface rounded-lg flex items-center justify-center hover:bg-outline-variant transition-all"
                                    >
                                        <span className="material-symbols-outlined text-sm"
                                        >trending_flat</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Footer / Mini Report*/}
                <footer
                    className="mt-auto px-lg py-md border-t border-outline-variant bg-surface-container-low flex flex-col md:flex-row md:items-center justify-between gap-md"
                >
                    <div className="flex items-center gap-lg">
                        <div className="flex items-center gap-2">
                            <span
                                className="w-2 h-2 rounded-full bg-primary-fixed animate-pulse"
                            ></span>
                            <span
                                className="font-label-sm text-label-sm text-on-surface-variant uppercase"
                            >Mission Control Sync: OK</span>
                        </div>
                        <div
                            className="flex items-center gap-4 text-outline font-label-md text-label-md"
                        >
                            <a className="hover:text-primary transition-colors cursor-pointer"
                            >Usage Report</a>
                            <a className="hover:text-primary transition-colors cursor-pointer"
                            >Access Logs</a>
                            <a className="hover:text-primary transition-colors cursor-pointer"
                            >Help Center</a>
                        </div>
                    </div>
                    <div className="flex items-center gap-md">
                        <div className="flex -space-x-2">
                            <div
                                className="w-8 h-8 rounded-full border-2 border-surface-container-low overflow-hidden"
                            >
                                <img
                                    className="w-full h-full object-cover"
                                    alt="Avatar of a diverse team member in a dark tech UI."
                                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuDVQmXGWcB2OyedeMnzxK_Fri7__vS-j4NvT1wnAqwVTXTHD-r2GI08FTxtoWlihs5jbjSc6avTHEPW2HS7yZDL42IBLw2UOz-iso-GHnIihjh0bOuLWVxp-z8KASGM85MU-YeGBQ97xs_2pZ9Bhl40J3pL7dt6PIxNXzl83X0sejCgsNtQPRF5_uxc_h3msdbWohELYZ68DmcjjT5587-gFM4JQgVFTVJN6u7bQAi73bJeZsQd7ujFXA"
                                />
                            </div>
                            <div
                                className="w-8 h-8 rounded-full border-2 border-surface-container-low overflow-hidden"
                            >
                                <img
                                    className="w-full h-full object-cover"
                                    alt="Avatar of a diverse team member in a dark tech UI."
                                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuAl805bn3x0xM4cBoSpt9Dgw4CBApdY37ANoZAbtxYc4h26lsOSoAin2so5EojHUfidZBr_2XYBAv3yy6pCeCYdd0Q8hhf-jAylCiHwGSwl92IQxOQQuhdvh5IoD4_MIbcLjcEZAF3oXK0LlmUse4wLSTi86kGpWWnjmFtKRAJ-41lT1R7m3pilvYaiqpUSbg5aUK5vlwPt5lflmH6KB-cYpQxg0qsT5narc8OISuBN4CrzDsjM335jrA"
                                />
                            </div>
                            <div
                                className="w-8 h-8 rounded-full border-2 border-surface-container-low overflow-hidden bg-surface-variant flex items-center justify-center text-[10px] font-bold text-on-surface-variant"
                            >
                                +39
                            </div>
                        </div>
                        <span className="font-label-md text-label-md text-on-surface-variant"
                        >Total Department Strength</span>
                    </div>
                </footer>
            </main>
        </>
    )
}

export default Department;