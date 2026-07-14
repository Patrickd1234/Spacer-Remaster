import { Link } from "react-router-dom"
import { supabase } from "../supabase";
import { useState, useEffect } from "react";
import CreateProjectModal from "./CreateProjectModal";

export default function Sidebar() {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [projects, setProjects] = useState([]);
    useEffect(() => {
        const fetchProjects = async () => {
            const { data, error } = await supabase.from("project_spaces").select("*");
            if (error) {
                console.log(error);
            } else {
                setProjects(data);
            }
        };
        fetchProjects();
    }, []);

    const addProject = async () => {
    const { data, error } = await supabase.from("project_spaces").insert({
        name: window.prompt("Enter new project name:")
    })
    if (error) {
        console.log(error)
    } else {
        console.log(data)
    }

    }
    return (
        <aside className="fixed left-0 top-0 h-full w-sidebar-width border-r border-outline-variant bg-surface-container-lowest flex flex-col py-lg z-50">
            <div className="px-lg mb-xl">
                <div className="flex items-center gap-sm mb-xs">
                    <div className="w-8 h-8 rounded bg-primary-container flex items-center justify-center">
                        <span className="material-symbols-outlined text-on-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>circle</span>
                    </div>
                    <h1 className="font-headline-lg text-headline-lg font-bold text-on-background">Spacers</h1>
                </div>
                <div className="flex items-center justify-between group cursor-pointer">
                    <p className="font-label-md text-label-md text-on-surface-variant">Switch Workspace</p>
                    <span className="material-symbols-outlined text-on-surface-variant text-sm">unfold_more</span>
                </div>
            </div>
            <button className="mx-lg mb-lg py-sm px-md bg-primary-container text-on-primary-container font-semibold rounded-lg flex items-center justify-center gap-sm hover:scale-[0.98] transition-transform" onClick={() => setShowCreateModal(true)}>
    <span className="material-symbols-outlined">add</span>
    <span className="font-label-md">New Project</span>
</button>
            <nav className="flex-1 overflow-y-auto px-2">
                <div className="mb-md">
                    <Link to="/" className="relative bg-primary-container text-on-primary-container font-semibold rounded-lg mx-2 my-1 flex items-center gap-md px-md py-sm">
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>home</span>
                        <span className="font-body-md">Home</span>
                    </Link>
                    <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer group">
                        <span className="material-symbols-outlined">chat</span>
                        <span className="font-body-md">Messages</span>
                    </div>
                    <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer">
                        <span className="material-symbols-outlined">groups</span>
                        <span className="font-body-md">Department</span>
                    </div>
                    <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer">
                        <span className="material-symbols-outlined">calendar_today</span>
                        <span className="font-body-md">Calendar</span>
                    </div>
                </div>
                {/* PROJECTS SECTION */}
                <div className="mt-lg px-2">
                    <p className="px-md font-label-md text-on-surface-variant uppercase tracking-wider mb-sm">Projects</p>
                    <div className="space-y-0.5">
                        {projects.map((project) => (
                            <div
                                key={project.id}
                                className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 transition-colors flex items-center justify-between px-md py-sm cursor-pointer group" onClick={() => console.log("Open project", project.id)}>
                                <div className="flex items-center gap-md">
                                    <span className="font-body-md">{project.name}</span>
                                </div>
                                <span className="material-symbols-outlined text-on-surface-variant text-sm group-hover:text-on-surface">chevron_right</span>
                            </div>
                        ))}
                    </div>
                </div>
            </nav>
            <div className="mt-auto px-2 border-t border-outline-variant pt-md">
                <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer">
                    <span className="material-symbols-outlined">menu_book</span>
                    <span className="font-label-md">Knowledge Base</span>
                </div>
                <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer">
                    <span className="material-symbols-outlined">bar_chart</span>
                    <span className="font-label-md">Reports</span>
                </div>
                <div className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface rounded-lg mx-2 my-1 transition-colors flex items-center gap-md px-md py-sm cursor-pointer">
                    <span className="material-symbols-outlined">settings</span>
                    <span className="font-label-md">Settings</span>
                </div>
            </div>
            {showCreateModal && (
    <CreateProjectModal
        onClose={() => setShowCreateModal(false)}
        onCreated={(project) => setProjects((prev) => [...prev, project])}
    />
)}
        </aside>
    )
}