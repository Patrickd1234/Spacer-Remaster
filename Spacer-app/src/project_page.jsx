import { useState, useEffect } from "react"
import { Link, useNavigate, useParams, useLocation } from "react-router-dom"
import { supabase } from "./supabase"
import Sidebar from "./partials/sidebar"
import Header from "./partials/header"


function ProjectPage() {
    const location = useLocation()
    const { id: project_id } = useParams()
    const [project_name, setProjectName] = useState("Website Redesign")
    const [project_description, setProjectDescription] = useState("Next-gen corporate portal focusing on accessibility, high-performance rendering, and seamless brand integration across all touchpoints.")
    const [project_status, setProjectStatus] = useState("In Progress")
    const [project_due_date, setProjectDueDate] = useState("")
    const [project_tasks, setProjectTasks] = useState([])
    const [activeTab, setActiveTab] = useState("summary")

    useEffect(() => {
        const fetchProject = async () => {
            if (!project_id) return
            const { data, error } = await supabase
                .from("project_spaces")
                .select("*")
                .eq("id", project_id)
            if (error) {
                console.error("Error fetching project:", error)
            } else if (data && data.length > 0) {
                if (data[0].name) setProjectName(data[0].name)
                if (data[0].description) setProjectDescription(data[0].description)
                if (data[0].status) setProjectStatus(data[0].status)
                if (data[0].due_date) setProjectDueDate(data[0].due_date)
            }
        }
        fetchProject()
    }, [project_id])

    return (
        <>
            <Sidebar />
            <Header />
            <main className="ml-[260px] mt-16 p-lg h-[calc(100vh-64px)] overflow-y-auto scroll-hide">
                {/* Project Header */}
                <div className="mb-lg">
                    <div className="flex items-end justify-between">
                        <div>
                            <div className="flex items-center gap-sm mb-xs">
                                <span className="px-xs py-[2px] rounded bg-secondary-container text-on-secondary-container text-[10px] font-bold uppercase tracking-tighter">{project_status || "In Progress"}</span>
                                <span className="text-on-surface-variant text-label-sm">• Updated 2 hours ago</span>
                            </div>
                            <h2 className="font-headline-xl text-headline-xl text-primary leading-tight">{project_name || "Website Redesign"}</h2>
                            <p className="text-on-surface-variant font-body-md text-body-md max-w-2xl mt-xs">{project_description || "Next-gen corporate portal focusing on accessibility, high-performance rendering, and seamless brand integration across all touchpoints."}</p>
                        </div>
                        <div className="flex -space-x-2">
                            <div className="w-10 h-10 rounded-full border-2 border-background bg-surface-variant flex items-center justify-center text-xs font-bold" title="Alan Turing">
                                <img className="w-full h-full rounded-full object-cover" alt="Alan Turing" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDhfAXpOled7fwJS5EeWSyBZ4uC04rfSN1qvNIVp2bF7HPZUg0ii1QmlRu2Dq7nn8500cgB6y3X3Jw2kgqcCpqCipX2Cp7pL_JRifmm_zwDFkFgcKTSjx-fj7Vo9Xpr3v5Ngb6ZePj0e8yeqDwc1G0AxLE8ma_a7RALCNslwYWf-LpO1Mxinbs9r1bJdcAcjmE_XzlB_YoqQ401cx7VGfnLAoCCtdAqXeoXIBymmNEv3j1-QhL1PZFV5w" />
                            </div>
                            <div className="w-10 h-10 rounded-full border-2 border-background bg-surface-variant flex items-center justify-center text-xs font-bold" title="Grace Hopper">
                                <img className="w-full h-full rounded-full object-cover" alt="Grace Hopper" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAdX5F-18T3UaKbEivUzdKxjSqM3AVnAL4AG5XIGsiSAcZ11Pb9vtvfSrMVzFvvMRJxvW__QQ5TqE9XJKQCIVeyNi2wcOEkV-8TuC7ZWn1waIGpNYUYaYcGDymk4EOOdCouEoNk4JNW2agkiRyQ8uSTJmJi4FQpZS-Nic9F04bqRsaxHyaOsgUmjKE5K8G3jA4XF_plF4ItvFhX-bL7otKZXb737_GYyyeFEPUEB6RlyZ45VS_rYpToBA" />
                            </div>
                            <div className="w-10 h-10 rounded-full border-2 border-background bg-surface-variant flex items-center justify-center text-xs font-bold" title="Ada Lovelace">
                                <img className="w-full h-full rounded-full object-cover" alt="Ada Lovelace" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBwvBPloEgecglUd5xU6mKjhaP19nSMbi0AJ2a-EPNTQVIkCPXWaOjetaHXNm2Pk-G7W69lXtPwEDPiQWsKDNmgbj5vHrFzyZaCy5HgoD0Mg034REGgE-ul99Jft6HZFDPsLFjuZ68spwEt_Fnrh3XuufFUHaICFUlTdeKi3AMb3LCOImua9-rc8wMeoBNpkp60Eqo5Np7XYzGt5fDM6sVjgrP8uECbdCM_b-5_28koB1jxihRg2hLvOA" />
                            </div>
                            <div className="w-10 h-10 rounded-full border-2 border-background bg-surface-container-highest flex items-center justify-center text-label-sm text-on-surface-variant" title="View all">
                                +5
                            </div>
                        </div>
                    </div>
                    {/* Sub-Tabs Navigation */}
                    <div className="flex gap-lg mt-xl border-b border-outline-variant/30">
                        <button
                            type="button"
                            className={`pb-sm px-sm font-label-md text-label-md transition-all cursor-pointer ${activeTab === "summary" ? "text-primary-fixed-dim border-b-2 border-primary-fixed-dim font-bold" : "text-on-surface-variant hover:text-on-surface border-b-2 border-transparent"}`}
                            onClick={() => setActiveTab("summary")}
                        >
                            Summary
                        </button>
                        <button
                            type="button"
                            className={`pb-sm px-sm font-label-md text-label-md transition-all cursor-pointer ${activeTab === "tasks" ? "text-primary-fixed-dim border-b-2 border-primary-fixed-dim font-bold" : "text-on-surface-variant hover:text-on-surface border-b-2 border-transparent"}`}
                            onClick={() => setActiveTab("tasks")}
                        >
                            Tasks
                        </button>
                        <button
                            type="button"
                            className={`pb-sm px-sm font-label-md text-label-md transition-all cursor-pointer ${activeTab === "files" ? "text-primary-fixed-dim border-b-2 border-primary-fixed-dim font-bold" : "text-on-surface-variant hover:text-on-surface border-b-2 border-transparent"}`}
                            onClick={() => setActiveTab("files")}
                        >
                            Public Files
                        </button>
                        <button
                            type="button"
                            className={`pb-sm px-sm font-label-md text-label-md transition-all cursor-pointer ${activeTab === "members" ? "text-primary-fixed-dim border-b-2 border-primary-fixed-dim font-bold" : "text-on-surface-variant hover:text-on-surface border-b-2 border-transparent"}`}
                            onClick={() => setActiveTab("members")}
                        >
                            Members
                        </button>
                    </div>
                </div>
                {/* Tab Contents */}
                <div id="content-area">
                    {/* Summary Tab */}
                    {activeTab === "summary" && (
                        <div className="tab-pane block" id="section-summary">
                            <div className="bento-grid">
                                {/* Progress Card */}
                                <div className="col-span-12 lg:col-span-8 bg-surface-container-high p-lg rounded-xl glass-panel">
                                    <div className="flex items-center justify-between mb-lg">
                                        <h3 className="font-headline-md text-headline-md">Burned-down Progress</h3>
                                        <div className="flex items-center gap-sm">
                                            <span className="flex items-center gap-xs text-primary-fixed-dim text-label-sm"><span className="w-2 h-2 rounded-full bg-primary-fixed-dim"></span> Actual</span>
                                            <span className="flex items-center gap-xs text-on-surface-variant text-label-sm"><span className="w-2 h-2 rounded-full bg-outline-variant"></span> Projection</span>
                                        </div>
                                    </div>
                                    <div className="h-64 relative flex items-end justify-between gap-base">
                                        {/* Visual Chart Mock (Bars for demo) */}
                                        <div className="flex-1 bg-primary-fixed-dim/10 rounded-t-sm relative group h-[85%]">
                                            <div className="absolute bottom-0 w-full bg-primary-fixed-dim/40 h-full rounded-t-sm group-hover:bg-primary-fixed-dim transition-all"></div>
                                        </div>
                                        <div className="flex-1 bg-primary-fixed-dim/10 rounded-t-sm relative group h-[78%]">
                                            <div className="absolute bottom-0 w-full bg-primary-fixed-dim/40 h-[92%] rounded-t-sm group-hover:bg-primary-fixed-dim transition-all"></div>
                                        </div>
                                        <div className="flex-1 bg-primary-fixed-dim/10 rounded-t-sm relative group h-[70%]">
                                            <div className="absolute bottom-0 w-full bg-primary-fixed-dim/40 h-[85%] rounded-t-sm group-hover:bg-primary-fixed-dim transition-all"></div>
                                        </div>
                                        <div className="flex-1 bg-primary-fixed-dim/10 rounded-t-sm relative group h-[62%]">
                                            <div className="absolute bottom-0 w-full bg-primary-fixed-dim/40 h-[75%] rounded-t-sm group-hover:bg-primary-fixed-dim transition-all"></div>
                                        </div>
                                        <div className="flex-1 bg-primary-fixed-dim/10 rounded-t-sm relative group h-[55%]">
                                            <div className="absolute bottom-0 w-full bg-primary-fixed-dim/40 h-[68%] rounded-t-sm group-hover:bg-primary-fixed-dim transition-all"></div>
                                        </div>
                                        <div className="flex-1 bg-primary-fixed-dim/10 rounded-t-sm relative group h-[48%]">
                                            <div className="absolute bottom-0 w-full bg-primary-fixed-dim/40 h-[55%] rounded-t-sm group-hover:bg-primary-fixed-dim transition-all"></div>
                                        </div>
                                        <div className="flex-1 bg-primary-fixed-dim/10 rounded-t-sm relative group h-[40%]">
                                            <div className="absolute bottom-0 w-full bg-primary-fixed-dim/40 h-[45%] rounded-t-sm group-hover:bg-primary-fixed-dim transition-all"></div>
                                        </div>
                                        <div className="flex-1 bg-primary-fixed-dim/10 rounded-t-sm relative group h-[32%]">
                                            <div className="absolute bottom-0 w-full bg-primary-fixed-dim/40 h-[38%] rounded-t-sm group-hover:bg-primary-fixed-dim transition-all"></div>
                                        </div>
                                        <div className="flex-1 bg-primary-fixed-dim/10 rounded-t-sm relative group h-[28%]">
                                            <div className="absolute bottom-0 w-full bg-primary-fixed-dim/40 h-[22%] rounded-t-sm group-hover:bg-primary-fixed-dim transition-all"></div>
                                        </div>
                                        <div className="flex-1 bg-primary-fixed-dim/10 rounded-t-sm relative group h-[22%]">
                                            <div className="absolute bottom-0 w-full bg-primary-fixed-dim/40 h-[10%] rounded-t-sm group-hover:bg-primary-fixed-dim transition-all"></div>
                                        </div>
                                    </div>
                                    <div className="mt-md pt-md border-t border-outline-variant/20 flex justify-between">
                                        <div className="text-center">
                                            <p className="text-on-surface-variant font-label-sm text-label-sm uppercase">Total Tasks</p>
                                            <p className="font-headline-md text-headline-md text-primary">128</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-on-surface-variant font-label-sm text-label-sm uppercase">Completed</p>
                                            <p className="font-headline-md text-headline-md text-primary-fixed-dim">94</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-on-surface-variant font-label-sm text-label-sm uppercase">Days Left</p>
                                            <p className="font-headline-md text-headline-md text-primary">14</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-on-surface-variant font-label-sm text-label-sm uppercase">Health</p>
                                            <p className="font-headline-md text-headline-md text-primary">On Track</p>
                                        </div>
                                    </div>
                                </div>
                                {/* Recent Activity Feed */}
                                <div className="col-span-12 lg:col-span-4 bg-surface-container-high p-lg rounded-xl glass-panel">
                                    <h3 className="font-headline-md text-headline-md mb-lg">Recent Activity</h3>
                                    <div className="space-y-lg overflow-y-auto max-h-[360px] scroll-hide">
                                        <div className="flex gap-sm">
                                            <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden bg-surface-variant">
                                                <img className="w-full h-full object-cover" alt="Alan Turing" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDoWgMjLOHKMkXqXIIvo8PhfXg__mp2M2Yc8RnUAkNs2xKLp9o5_uGC41g-DLojeM1NRaDOBem5LYwIi_ysOVkmO190RAFhZAVx_RE6vJYpqn0pu2jY-RE7kN7Qk3ZsNqBRiEl5PUHaYc75FJ2gVWBIA4nTdQNQGzoro9xGnqCH1ICl2dRI5_3o-4a69LKxU6A5C2p1jTsxWta2W6zHlRxU-QgkG2LB4qnINGQOD6_S0QM76jFSPyXPIA" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-body-sm font-body-sm leading-snug">
                                                    <span className="text-primary font-bold">Alan Turing</span> commented on <span className="text-primary-fixed-dim">Mobile Navigation</span>
                                                </p>
                                                <p className="text-on-surface-variant font-body-sm text-body-sm bg-surface-container-low p-sm rounded mt-xs italic border-l-2 border-primary-fixed-dim">"The breakpoint for tablet needs to be adjusted to 834px for the iPad Pro portrait mode."</p>
                                                <p className="text-on-surface-variant text-[10px] mt-xs">12 minutes ago</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-sm">
                                            <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden bg-surface-variant">
                                                <img className="w-full h-full object-cover" alt="Grace Hopper" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBJfzhYRqPUQo7AezcRmOBHrrgbrHh33lA-EunXzpD7ZBzqry2Vx0xuWPusxsNDtQAiZpOriE4DCBKvCGsL-EUJnDoD0lh5apR3RfYNkVNjBTTZvS8nrfx3kfGUfnjbtSOUV8HcHz71GKjFko_3ZrAJRG3m5FVhIGtbJRFSBbRwtT_LevogeaOeEIBqgAm-0yzct4G4ore7ernc4LmSzhOJudyhZ7KMm1HZhwrB8H1-YT_ONGFuFdO6Xg" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-body-sm font-body-sm leading-snug">
                                                    <span className="text-primary font-bold">Grace Hopper</span> created <span className="text-primary-fixed-dim">Task: Optimize Asset Loading</span>
                                                </p>
                                                <p className="text-on-surface-variant text-[10px] mt-xs">1 hour ago</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-sm">
                                            <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden bg-surface-variant">
                                                <img className="w-full h-full object-cover" alt="Steve Wozniak" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCH9TbwA2IlZqqs6xusl0tuWMW4vxjRcieDIgK_P9_wFHriGy5hYKaMP4l4JWJKHeHYOYfb0Q4BQnV1L_EU161UtjhuKDx7z_aIEkxOwOFIcFmaho83w4f7aLwljCFJsNxGKJZ1daxULdQWG1jCHrSZ6lHvieTzjM997xfJWPKnBOlfqP4pdq5uOLaCqv2UoILxwqNMSOOqIufJy_YiVL0_g-jFwVtA5j77Ni7rdIole67TviHw2K48Hw" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-body-sm font-body-sm leading-snug">
                                                    <span className="text-primary font-bold">Steve Wozniak</span> uploaded <span className="text-primary-fixed-dim">Logo_v3_Final.svg</span>
                                                </p>
                                                <p className="text-on-surface-variant text-[10px] mt-xs">3 hours ago</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tasks Tab */}
                    {activeTab === "tasks" && (
                        <div className="tab-pane block" id="section-tasks">
                            <div className="flex gap-lg overflow-x-auto pb-md scroll-hide h-full">
                                {/* Column: To Do */}
                                <div className="min-w-[320px] bg-surface-container-low/30 p-md rounded-xl flex flex-col">
                                    <div className="flex items-center justify-between mb-md">
                                        <div className="flex items-center gap-sm">
                                            <h4 className="font-label-md text-label-md text-on-surface uppercase tracking-wider">Backlog</h4>
                                            <span className="bg-surface-container-high px-xs rounded text-[10px] text-on-surface-variant font-bold">12</span>
                                        </div>
                                        <button type="button" className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors">more_horiz</button>
                                    </div>
                                    <div className="space-y-md flex-1 overflow-y-auto scroll-hide">
                                        <div className="bg-surface-container p-md rounded-lg border border-outline-variant/30 hover:border-primary-fixed-dim transition-all cursor-pointer group">
                                            <div className="flex justify-between mb-sm">
                                                <span className="px-xs py-[2px] rounded bg-tertiary-container/10 text-on-tertiary-container text-[10px] font-bold">Design</span>
                                                <span className="material-symbols-outlined text-on-surface-variant text-[16px] opacity-0 group-hover:opacity-100 transition-opacity">edit</span>
                                            </div>
                                            <h5 className="text-body-md font-bold text-primary mb-xs">Color Palette Refinement</h5>
                                            <p className="text-body-sm font-body-sm text-on-surface-variant line-clamp-2">Adjusting the semantic tokens for better contrast in dark mode...</p>
                                            <div className="mt-md flex items-center justify-between">
                                                <div className="flex -space-x-1">
                                                    <div className="w-6 h-6 rounded-full border border-background bg-slate-800"></div>
                                                </div>
                                                <span className="text-on-surface-variant text-[11px] flex items-center gap-xs">
                                                    <span className="material-symbols-outlined text-[14px]">chat_bubble</span> 3
                                                </span>
                                            </div>
                                        </div>
                                        <div className="bg-surface-container p-md rounded-lg border border-outline-variant/30 hover:border-primary-fixed-dim transition-all cursor-pointer">
                                            <div className="flex justify-between mb-sm">
                                                <span className="px-xs py-[2px] rounded bg-error-container/10 text-error text-[10px] font-bold">Critical</span>
                                            </div>
                                            <h5 className="text-body-md font-bold text-primary mb-xs">Security Audit: Auth Flow</h5>
                                            <p className="text-body-sm font-body-sm text-on-surface-variant">Reviewing the JWT rotation logic for the new admin panel.</p>
                                        </div>
                                    </div>
                                    <button type="button" className="mt-md w-full flex items-center justify-center gap-xs py-sm border border-dashed border-outline-variant rounded-lg text-on-surface-variant text-label-sm hover:text-primary-fixed-dim hover:border-primary-fixed-dim transition-all cursor-pointer">
                                        <span className="material-symbols-outlined text-[16px]">add</span> Add Task
                                    </button>
                                </div>
                                {/* Column: In Progress */}
                                <div className="min-w-[320px] bg-surface-container-low/30 p-md rounded-xl flex flex-col">
                                    <div className="flex items-center justify-between mb-md">
                                        <div className="flex items-center gap-sm">
                                            <h4 className="font-label-md text-label-md text-on-surface uppercase tracking-wider">Doing</h4>
                                            <span className="bg-primary-fixed-dim text-on-primary px-xs rounded text-[10px] font-bold">5</span>
                                        </div>
                                        <button type="button" className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors">more_horiz</button>
                                    </div>
                                    <div className="space-y-md">
                                        <div className="bg-surface-container p-md rounded-lg border border-primary-fixed-dim/40 shadow-[0_0_15px_rgba(182,255,51,0.05)]">
                                            <div className="flex justify-between mb-sm">
                                                <span className="px-xs py-[2px] rounded bg-secondary-container text-on-secondary-container text-[10px] font-bold uppercase">Dev</span>
                                            </div>
                                            <h5 className="text-body-md font-bold text-primary mb-xs">Responsive Navigation Shell</h5>
                                            <div className="w-full bg-surface-container-low h-1 rounded-full mb-md overflow-hidden">
                                                <div className="bg-primary-fixed-dim h-full w-2/3"></div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex -space-x-1">
                                                    <div className="w-6 h-6 rounded-full border border-background bg-slate-800"></div>
                                                    <div className="w-6 h-6 rounded-full border border-background bg-slate-700"></div>
                                                </div>
                                                <span className="text-on-surface-variant text-[11px]">65%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {/* Column: Review */}
                                <div className="min-w-[320px] bg-surface-container-low/30 p-md rounded-xl flex flex-col opacity-60">
                                    <div className="flex items-center justify-between mb-md">
                                        <div className="flex items-center gap-sm">
                                            <h4 className="font-label-md text-label-md text-on-surface uppercase tracking-wider">QA Review</h4>
                                            <span className="bg-surface-container-high px-xs rounded text-[10px] text-on-surface-variant font-bold">3</span>
                                        </div>
                                    </div>
                                    <div className="text-center py-xl">
                                        <span className="material-symbols-outlined text-[48px] text-on-surface-variant opacity-20">hourglass_empty</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Public Files Tab */}
                    {activeTab === "files" && (
                        <div className="tab-pane block" id="section-files">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                                {/* Preview Files */}
                                <div className="bg-surface-container-high p-lg rounded-xl glass-panel">
                                    <div className="flex items-center justify-between mb-lg">
                                        <div className="flex items-center gap-sm">
                                            <span className="material-symbols-outlined text-primary-fixed-dim">visibility</span>
                                            <h3 className="font-headline-md text-headline-md">Preview Files</h3>
                                        </div>
                                        <button type="button" className="text-label-sm text-primary-fixed-dim font-label-md uppercase tracking-wide hover:underline cursor-pointer">Upload</button>
                                    </div>
                                    <div className="space-y-sm">
                                        <div className="flex items-center justify-between p-sm hover:bg-surface-container transition-colors rounded-lg group">
                                            <div className="flex items-center gap-md">
                                                <div className="w-10 h-10 bg-error-container/20 flex items-center justify-center rounded-lg">
                                                    <span className="material-symbols-outlined text-error">picture_as_pdf</span>
                                                </div>
                                                <div>
                                                    <p className="font-body-md text-body-md text-primary">Marketing_Landing_Mockup.pdf</p>
                                                    <p className="text-on-surface-variant text-[11px]">Added by Grace • 14.2 MB</p>
                                                </div>
                                            </div>
                                            <button type="button" className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-opacity opacity-0 group-hover:opacity-100">download</button>
                                        </div>
                                        <div className="flex items-center justify-between p-sm hover:bg-surface-container transition-colors rounded-lg group">
                                            <div className="flex items-center gap-md">
                                                <div className="w-10 h-10 bg-primary-container/10 flex items-center justify-center rounded-lg">
                                                    <span className="material-symbols-outlined text-primary-fixed-dim">image</span>
                                                </div>
                                                <div>
                                                    <p className="font-body-md text-body-md text-primary">Hero_Section_Animation.mp4</p>
                                                    <p className="text-on-surface-variant text-[11px]">Added by Alan • 45.8 MB</p>
                                                </div>
                                            </div>
                                            <button type="button" className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-opacity opacity-0 group-hover:opacity-100">download</button>
                                        </div>
                                    </div>
                                </div>
                                {/* Input Files */}
                                <div className="bg-surface-container-high p-lg rounded-xl glass-panel">
                                    <div className="flex items-center justify-between mb-lg">
                                        <div className="flex items-center gap-sm">
                                            <span className="material-symbols-outlined text-primary-fixed-dim">move_to_inbox</span>
                                            <h3 className="font-headline-md text-headline-md">Input Files</h3>
                                        </div>
                                        <button type="button" className="text-label-sm text-primary-fixed-dim font-label-md uppercase tracking-wide hover:underline cursor-pointer">Upload</button>
                                    </div>
                                    <div className="space-y-sm">
                                        <div className="flex items-center justify-between p-sm hover:bg-surface-container transition-colors rounded-lg group">
                                            <div className="flex items-center gap-md">
                                                <div className="w-10 h-10 bg-secondary-container flex items-center justify-center rounded-lg">
                                                    <span className="material-symbols-outlined text-on-surface-variant">description</span>
                                                </div>
                                                <div>
                                                    <p className="font-body-md text-body-md text-primary">Brand_Guidelines_2024.docx</p>
                                                    <p className="text-on-surface-variant text-[11px]">Added by HR Team • 2.1 MB</p>
                                                </div>
                                            </div>
                                            <button type="button" className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-opacity opacity-0 group-hover:opacity-100">download</button>
                                        </div>
                                        <div className="flex items-center justify-between p-sm hover:bg-surface-container transition-colors rounded-lg group">
                                            <div className="flex items-center gap-md">
                                                <div className="w-10 h-10 bg-secondary-container flex items-center justify-center rounded-lg">
                                                    <span className="material-symbols-outlined text-on-surface-variant">folder_zip</span>
                                                </div>
                                                <div>
                                                    <p className="font-body-md text-body-md text-primary">Raw_Asset_Pack_v2.zip</p>
                                                    <p className="text-on-surface-variant text-[11px]">Added by Ada • 1.4 GB</p>
                                                </div>
                                            </div>
                                            <button type="button" className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-opacity opacity-0 group-hover:opacity-100">download</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Members Tab */}
                    {activeTab === "members" && (
                        <div className="tab-pane block" id="section-members">
                            <div className="bg-surface-container-high rounded-xl glass-panel overflow-hidden">
                                <table className="w-full text-left">
                                    <thead className="bg-surface-container-low">
                                        <tr>
                                            <th className="px-lg py-md font-label-sm text-label-sm uppercase text-on-surface-variant">Member</th>
                                            <th className="px-lg py-md font-label-sm text-label-sm uppercase text-on-surface-variant">Role</th>
                                            <th className="px-lg py-md font-label-sm text-label-sm uppercase text-on-surface-variant">Status</th>
                                            <th className="px-lg py-md font-label-sm text-label-sm uppercase text-on-surface-variant">Last Active</th>
                                            <th className="px-lg py-md"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-outline-variant/20">
                                        <tr className="hover:bg-surface-container transition-colors">
                                            <td className="px-lg py-md flex items-center gap-md">
                                                <div className="relative w-10 h-10 shrink-0">
                                                    <img className="w-full h-full rounded-full object-cover" alt="Alan Turing" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDqqPlcDFNyQ0MhTW5nw0XW-2zCyTcT5awZAyI2T2asdkvIK1TNqrDpjMGQvs7QfkG9FmwcPITCPgA12VhFLAZTs3U60wJbUIPHBWAeXsWUdWHGgNXZRsFMLY24AYwgZfB9BizPDQ3gW9foEa9PfXCJ1n-Fp_c6PpXiLWwsvAvvc5iMyYC_dfKYfPHVZeyYVnsAhaZJQRyjVt122hAlBiOP9DAMcx022DFtnUygUvLyBc74M6B5NeXuCQ" />
                                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-primary-fixed-dim border-2 border-surface-container rounded-full"></div>
                                                </div>
                                                <div>
                                                    <p className="font-body-md text-body-md text-primary font-bold">Alan Turing</p>
                                                    <p className="text-on-surface-variant text-[11px]">alan@spacers.io</p>
                                                </div>
                                            </td>
                                            <td className="px-lg py-md">
                                                <span className="px-sm py-base rounded-full border border-outline-variant text-[11px] font-label-sm">Tech Lead</span>
                                            </td>
                                            <td className="px-lg py-md">
                                                <span className="flex items-center gap-xs text-primary-fixed-dim text-label-sm">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed-dim"></span> Active
                                                </span>
                                            </td>
                                            <td className="px-lg py-md text-on-surface-variant font-body-sm text-body-sm">Just now</td>
                                            <td className="px-lg py-md text-right">
                                                <button type="button" className="material-symbols-outlined text-on-surface-variant">mail</button>
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-surface-container transition-colors">
                                            <td className="px-lg py-md flex items-center gap-md">
                                                <div className="relative w-10 h-10 shrink-0">
                                                    <img className="w-full h-full rounded-full object-cover" alt="Grace Hopper" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCJpzE24BKAI1bA5w1wAlv9QCEKbZYO3MJgBxhnyV5towTW_iMicq95We8z_OdaeACKdL9P-OLykg9vlvI5ohT8Mn0Z6ViXutpvNLj0r-G54HitrlUFVRFGkmWHDbmIBpuWcMk8qYdWfv_TX4yTnRWTlGMMThO5f6i6OF2uYItwJL1hmIxQdcPHtapFdAo5sL8FJTgqgi5iA5jcJcplEb8kDEA6ePDMMisGr7gAeYEgtE9ViO8UaiSuJA" />
                                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-primary-fixed-dim border-2 border-surface-container rounded-full"></div>
                                                </div>
                                                <div>
                                                    <p className="font-body-md text-body-md text-primary font-bold">Grace Hopper</p>
                                                    <p className="text-on-surface-variant text-[11px]">grace@spacers.io</p>
                                                </div>
                                            </td>
                                            <td className="px-lg py-md">
                                                <span className="px-sm py-base rounded-full border border-outline-variant text-[11px] font-label-sm">Senior UI Architect</span>
                                            </td>
                                            <td className="px-lg py-md">
                                                <span className="flex items-center gap-xs text-primary-fixed-dim text-label-sm">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed-dim"></span> Active
                                                </span>
                                            </td>
                                            <td className="px-lg py-md text-on-surface-variant font-body-sm text-body-sm">2h ago</td>
                                            <td className="px-lg py-md text-right">
                                                <button type="button" className="material-symbols-outlined text-on-surface-variant">mail</button>
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-surface-container transition-colors">
                                            <td className="px-lg py-md flex items-center gap-md">
                                                <div className="relative w-10 h-10 shrink-0">
                                                    <img className="w-full h-full rounded-full object-cover" alt="Ada Lovelace" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC6HJyICcrafKbZ4526d0McoWWk9zk1gS_77ATXdI_RBt1-yIw8oqXeQtQOBmWeMCD1VOEj4vadgNJIOBpgZcz0MFq39XQHwygnSf8P8BDtGJPl-_px_Hzj1Aj9bdsSy52YAxw7tkUS35sFst72NsoDh2SYewxg1bQq7k09-8Q0hmDJ1YBggl5GvEAYfalSQKeGvB5eaM-M4r-PWlWYBKsdBaF7a3X1k8DtiDR-wv1nw4MQURITpTmKNA" />
                                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-outline-variant border-2 border-surface-container rounded-full"></div>
                                                </div>
                                                <div>
                                                    <p className="font-body-md text-body-md text-primary font-bold">Ada Lovelace</p>
                                                    <p className="text-on-surface-variant text-[11px]">ada@spacers.io</p>
                                                </div>
                                            </td>
                                            <td className="px-lg py-md">
                                                <span className="px-sm py-base rounded-full border border-outline-variant text-[11px] font-label-sm">Project Manager</span>
                                            </td>
                                            <td className="px-lg py-md">
                                                <span className="flex items-center gap-xs text-on-surface-variant text-label-sm opacity-50">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span> Offline
                                                </span>
                                            </td>
                                            <td className="px-lg py-md text-on-surface-variant font-body-sm text-body-sm">Yesterday</td>
                                            <td className="px-lg py-md text-right">
                                                <button type="button" className="material-symbols-outlined text-on-surface-variant">mail</button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </main>
            {/* FAB for Tasks */}
            <button type="button" className="fixed bottom-lg right-lg w-14 h-14 bg-primary-fixed-dim text-on-primary rounded-full shadow-[0_8px_32px_rgba(182,255,51,0.3)] flex items-center justify-center hover:scale-105 transition-transform active:scale-95 group z-30 cursor-pointer">
                <span className="material-symbols-outlined text-[28px] font-bold">add</span>
                <span className="absolute right-full mr-md px-md py-sm bg-surface-container text-on-surface font-label-md text-label-md rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap border border-outline-variant">Quick Add Task</span>
            </button>
        </>
    )
}

export default ProjectPage