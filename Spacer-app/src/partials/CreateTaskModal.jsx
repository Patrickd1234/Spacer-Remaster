import { useState, useEffect, useRef } from "react";
import { supabase, getSessionUser } from "../supabase";

const CustomDropdown = ({ options, value, onChange, placeholder, direction = "down" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedOption = options.find(opt => String(opt.value) === String(value));

    return (
        <div className="relative" ref={dropdownRef}>
            <div 
                className={`w-full bg-[#111318] border rounded-xl px-4 py-3 text-sm text-white cursor-pointer flex justify-between items-center transition-all ${isOpen ? 'border-[var(--primary-color)] ring-1 ring-[var(--primary-color)]' : 'border-[#2D3139] hover:border-[#424934]'}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={!selectedOption ? "text-[#8c947b]" : ""}>{selectedOption ? selectedOption.label : placeholder}</span>
                <span className="material-symbols-outlined text-[#8c947b] text-[20px] transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    expand_more
                </span>
            </div>
            {isOpen && (
                <div className={`absolute z-50 w-full bg-[#1c1f26] border border-[#2D3139] rounded-xl shadow-2xl max-h-60 overflow-y-auto ${direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                    {options.map((opt) => (
                        <div 
                            key={opt.value}
                            className={`px-4 py-2.5 cursor-pointer text-sm transition-colors ${String(value) === String(opt.value) ? 'bg-[#5b644d] text-white font-semibold' : 'text-white hover:bg-[#2D3139]'}`}
                            onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                            }}
                        >
                            {opt.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default function CreateTaskModal({ projectId, organizationId, teamSpaceId, initialStatus = "todo", initialDate = "", onClose, onCreated, isInline = false }) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [dueDate, setDueDate] = useState(initialDate);
    const [priority, setPriority] = useState("medium");
    const [assigneeId, setAssigneeId] = useState("");
    const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
    const [projects, setProjects] = useState([]);
    
    const [users, setUsers] = useState([]);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!projectId && organizationId) {
            const fetchProjects = async () => {
                try {
                    // Try querying team_spaces -> project_spaces first (which matches the Spacer schema)
                    const { data: teamSpaces } = await supabase
                        .from("team_spaces")
                        .select("id")
                        .eq("organization_id", organizationId);
                        
                    if (teamSpaces && teamSpaces.length > 0) {
                        const teamIds = teamSpaces.map(ts => ts.id);
                        const { data, error } = await supabase
                            .from("project_spaces")
                            .select("id, name")
                            .in("team_space_id", teamIds);
                        
                        if (!error && data) {
                            setProjects(data.map(p => ({ id: p.id, title: p.name || p.title })));
                            return;
                        }
                    }
                    
                    // Fallback to plain project_spaces select
                    const { data: fallbackSpaces } = await supabase
                        .from("project_spaces")
                        .select("id, name");
                    if (fallbackSpaces) {
                        setProjects(fallbackSpaces.map(p => ({ id: p.id, title: p.name || p.title })));
                        return;
                    }

                    // Fallback to legacy projects table
                    const { data } = await supabase.from("projects").select("id, title").eq("organization_id", organizationId);
                    if (data) setProjects(data);
                } catch (err) {
                    console.warn("Error fetching projects for modal:", err);
                }
            };
            fetchProjects();
        }
    }, [projectId, organizationId]);

    useEffect(() => {
        const fetchTeamMembers = async () => {
            let activeTeamSpaceId = teamSpaceId;
            
            if (!activeTeamSpaceId && selectedProjectId) {
                const { data: projData } = await supabase
                    .from("project_spaces")
                    .select("team_space_id")
                    .eq("id", selectedProjectId)
                    .maybeSingle();
                if (projData?.team_space_id) {
                    activeTeamSpaceId = projData.team_space_id;
                }
            }

            if (!activeTeamSpaceId) {
                if (organizationId) {
                    const { data } = await supabase
                        .from("users")
                        .select("id, name")
                        .eq("organization_id", organizationId);
                    if (data) {
                        setUsers(data);
                    }
                }
                return;
            }

            const { data } = await supabase
                .from("memberships")
                .select("user:users(id, name)")
                .eq("team_space_id", activeTeamSpaceId);
            if (data) {
                const members = data.map(m => m.user).filter(Boolean);
                setUsers(members);
            }
        };
        fetchTeamMembers();
    }, [teamSpaceId, selectedProjectId, organizationId]);

    const createTask = async () => {
        setError(null);

        if (!title.trim()) {
            setError("Please specify a task name.");
            return;
        }

        const finalProjectId = projectId || selectedProjectId;

        if (!finalProjectId || !organizationId) {
            setError("Please select a project.");
            return;
        }

        setSaving(true);
        const userData = { user: await getSessionUser() };
        
        const { data, error } = await supabase
            .from("tasks")
            .insert({
                project_id: finalProjectId,
                organization_id: organizationId,
                title: title.trim(),
                description: description.trim() || null,
                due_date: dueDate || null,
                priority: priority,
                assignee_id: assigneeId || null,
                created_by: userData?.user?.id || null,
                status: 'todo'
            })
            .select()
            .single();
        
        setSaving(false);

        if (error) {
            setError(error.message);
            return;
        }

        try {
            await supabase.from("activity_log").insert({
                entity_type: "task",
                entity_id: data.id,
                actor_id: userData?.user?.id || null,
                action: "created",
                new_state: {
                    project_id: finalProjectId,
                    title: data.title,
                    assignee_id: assigneeId || null,
                    priority,
                    status: initialStatus
                }
            });
        } catch (logError) {
            console.error("Error logging task creation:", logError);
        }

        onCreated?.(data);
        onClose();
    };

    const content = (
        <div
            className={`bg-[#191c21] rounded-2xl border border-[#2D3139] flex flex-col text-white ${isInline ? 'w-full h-full border-none rounded-none' : 'w-full max-w-lg shadow-2xl overflow-visible'}`}
            onClick={(e) => !isInline && e.stopPropagation()}
        >
            <div className={`p-6 border-b border-[#2D3139] flex justify-between items-center bg-[#181a20] rounded-t-2xl shrink-0 ${isInline ? 'hidden' : ''}`}>
                <div>
                    <h2 className="text-xl font-bold text-white">Create New Task</h2>
                    <p className="text-[#8c947b] text-xs mt-0.5">Add a new actionable item to your project backlog.</p>
                </div>
                <button className="text-[#8c947b] hover:text-white transition-colors cursor-pointer" onClick={onClose}>
                    <span className="material-symbols-outlined">close</span>
                </button>
            </div>

            <div className="p-6 space-y-5">
                {!projectId && (
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-[#8c947b] uppercase tracking-wider">
                            Project
                        </label>
                        <CustomDropdown 
                            options={projects.map(p => ({ value: p.id, label: p.title }))}
                            value={selectedProjectId}
                            onChange={setSelectedProjectId}
                            placeholder="Select a project"
                        />
                    </div>
                )}

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#8c947b] uppercase tracking-wider" htmlFor="task-title">
                        Task Name
                    </label>
                    <input
                        id="task-title"
                        className="w-full bg-[#111318] border border-[#2D3139] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[var(--primary-color)] transition-all placeholder-[#8c947b]"
                        placeholder="e.g. Implement user authentication"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#8c947b] uppercase tracking-wider" htmlFor="task-description">
                        Description
                    </label>
                    <textarea
                        id="task-description"
                        className="w-full bg-[#111318] border border-[#2D3139] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[var(--primary-color)] transition-all placeholder-[#8c947b] min-h-[80px] resize-y"
                        placeholder="Add more details about this task..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#8c947b] uppercase tracking-wider" htmlFor="task-deadline">
                        Deadline
                    </label>
                    <input
                        id="task-deadline"
                        className="w-full bg-[#111318] border border-[#2D3139] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[var(--primary-color)] transition-all [color-scheme:dark]"
                        type="datetime-local"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                    />
                </div>

                <div className="flex gap-4">
                    <div className="space-y-1.5 flex-1">
                        <label className="text-xs font-semibold text-[#8c947b] uppercase tracking-wider">
                            Assignee
                        </label>
                        <CustomDropdown 
                            options={[
                                { value: "", label: "Unassigned" },
                                ...users.map(u => ({ value: u.id, label: u.name }))
                            ]}
                            value={assigneeId}
                            onChange={setAssigneeId}
                            placeholder="Select assignee"
                            direction="up"
                        />
                    </div>
                    
                    <div className="space-y-1.5 flex-1">
                        <label className="text-xs font-semibold text-[#8c947b] uppercase tracking-wider">
                            Priority
                        </label>
                        <CustomDropdown 
                            options={[
                                { value: "low", label: "Low" },
                                { value: "medium", label: "Medium" },
                                { value: "high", label: "High" },
                                { value: "urgent", label: "Urgent" }
                            ]}
                            value={priority}
                            onChange={setPriority}
                            placeholder="Select priority"
                            direction="up"
                        />
                    </div>
                </div>

                {error && <p className="text-xs text-red-400">{error}</p>}
            </div>

            <div className="p-6 pt-0 flex gap-3">
                <button
                    className="flex-1 py-3 border border-[#2D3139] bg-[#181a20] rounded-xl text-xs font-semibold text-[#8c947b] hover:text-white transition-all cursor-pointer"
                    onClick={onClose}
                >
                    Cancel
                </button>
                <button
                    className="flex-1 py-3 btn-primary-accent rounded-xl text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
                    onClick={createTask}
                    disabled={saving}
                >
                    {saving ? "Creating…" : "Create Task"}
                </button>
            </div>
        </div>
    );

    if (isInline) return content;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            {content}
        </div>
    );
}
