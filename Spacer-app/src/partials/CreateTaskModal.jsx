import { useState, useEffect, useRef } from "react";
import { supabase, getSessionUser } from "../supabase";

const STATUS_OPTIONS = [
    { value: "todo", label: "To-do" },
    { value: "in_progress", label: "In progress" },
    { value: "done", label: "Done" },
];

const PRIORITY_OPTIONS = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Normal" },
    { value: "high", label: "High" },
    { value: "urgent", label: "Urgent" },
];

const fieldClass = "w-full bg-[#14161b] border border-[#2D3139] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--primary-color)] transition-colors placeholder-[#8c947b]/60";

const Label = ({ htmlFor, children, isRequired = false }) => (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-white mb-2">
        {children}{isRequired && <span className="text-red-400"> *</span>}
    </label>
);

const CustomDropdown = ({ options, value, onChange, placeholder, icon = null, isDisabled = false }) => {
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
            <button
                type="button"
                disabled={isDisabled}
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full bg-[#14161b] border rounded-lg px-3 py-2.5 text-sm text-white flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isOpen ? "border-[var(--primary-color)]" : "border-[#2D3139] hover:border-[#3d424d]"}`}
            >
                {icon && <span className="material-symbols-outlined text-[16px] text-[#8c947b]">{icon}</span>}
                <span className={`flex-1 text-left truncate ${!selectedOption ? "text-[#8c947b]" : ""}`}>{selectedOption ? selectedOption.label : placeholder}</span>
                <span className={`material-symbols-outlined text-[#8c947b] text-[18px] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
            </button>
            {isOpen && (
                <div className="font-body-md absolute z-50 top-full mt-1 w-full min-w-[160px] bg-[#1c1f26] border border-[#2D3139] rounded-lg shadow-2xl max-h-60 overflow-y-auto p-1">
                    {options.length === 0 && <p className="px-3 py-2 text-xs text-[#8c947b]">Nothing to choose yet</p>}
                    {options.map((opt) => (
                        <button
                            type="button"
                            key={opt.value}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${String(value) === String(opt.value) ? "bg-[#252a33] text-white font-semibold" : "text-[#c2caae] hover:bg-[#252a33] hover:text-white"}`}
                            onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default function CreateTaskModal({ projectId, organizationId, teamSpaceId, initialStatus = "todo", initialDate = "", onClose, onCreated, isInline = false }) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [dueDate, setDueDate] = useState(String(initialDate || "").slice(0, 10));
    const [status, setStatus] = useState(STATUS_OPTIONS.some(o => o.value === initialStatus) ? initialStatus : "todo");
    const [priority, setPriority] = useState("medium");
    const [assigneeId, setAssigneeId] = useState("");
    const [teamSpaces, setTeamSpaces] = useState([]);
    const [selectedTeamSpaceId, setSelectedTeamSpaceId] = useState(teamSpaceId || "");
    const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
    const [projects, setProjects] = useState([]);
    const [users, setUsers] = useState([]);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    // Departments to choose from (row-level security keeps this to what the user can see)
    useEffect(() => {
        if (projectId || !organizationId) return;
        let active = true;
        supabase
            .from("team_spaces")
            .select("id, name")
            .eq("organization_id", organizationId)
            .order("name")
            .then(({ data, error: tsError }) => {
                if (tsError) console.warn("Error fetching departments for task modal:", tsError);
                if (!active) return;
                setTeamSpaces(data || []);
                if (!teamSpaceId && data?.length === 1) setSelectedTeamSpaceId(data[0].id);
            });
        return () => { active = false; };
    }, [projectId, organizationId, teamSpaceId]);

    // Projects in the chosen department
    useEffect(() => {
        if (projectId || !selectedTeamSpaceId) return;
        let active = true;
        supabase
            .from("project_spaces")
            .select("id, name")
            .eq("team_space_id", selectedTeamSpaceId)
            .order("name")
            .then(({ data, error: projError }) => {
                if (projError) console.warn("Error fetching projects for task modal:", projError);
                if (active) setProjects(data || []);
            });
        return () => { active = false; };
    }, [projectId, selectedTeamSpaceId]);

    useEffect(() => {
        const fetchTeamMembers = async () => {
            let activeTeamSpaceId = teamSpaceId || selectedTeamSpaceId;

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

            // Assignable = the project's department members + people added to this project directly
            const [{ data: deptMembers }, { data: projectMembers }] = await Promise.all([
                supabase
                    .from("memberships")
                    .select("user:users(id, name)")
                    .eq("team_space_id", activeTeamSpaceId),
                selectedProjectId
                    ? supabase
                        .from("project_members")
                        .select("user:users(id, name)")
                        .eq("project_id", selectedProjectId)
                    : Promise.resolve({ data: [] }),
            ]);

            const byId = new Map();
            [...(deptMembers || []), ...(projectMembers || [])]
                .map(m => m.user)
                .filter(Boolean)
                .forEach(u => byId.set(u.id, u));
            setUsers([...byId.values()]);
        };
        fetchTeamMembers();
    }, [teamSpaceId, selectedTeamSpaceId, selectedProjectId, organizationId]);

    const chooseTeamSpace = (id) => {
        setSelectedTeamSpaceId(id);
        setSelectedProjectId("");
        setProjects([]);
        setAssigneeId("");
    };

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
                status,
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
                    status
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
            className={`@container bg-[#191c21] border border-[#2D3139] flex flex-col text-white ${isInline ? "w-full h-full border-none rounded-none" : "w-full max-w-[600px] rounded-2xl shadow-2xl overflow-visible"}`}
            onClick={(e) => !isInline && e.stopPropagation()}
        >
            <div className={`px-6 pt-5 pb-4 border-b border-[#2D3139] flex justify-between items-start shrink-0 ${isInline ? "hidden" : ""}`}>
                <div>
                    <h2 className="text-base font-semibold text-white">Create Task</h2>
                    <p className="text-[#8c947b] text-xs mt-1">Add a task, choose where it belongs, and assign it to someone.</p>
                </div>
                <button type="button" aria-label="Close" className="text-[#8c947b] hover:text-white transition-colors cursor-pointer" onClick={onClose}>
                    <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>

            <div className="px-6 py-5 space-y-5">
                <div>
                    <Label htmlFor="task-title" isRequired>Task Name</Label>
                    <input id="task-title" className={fieldClass} placeholder="Enter the task name" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>

                <div>
                    <Label htmlFor="task-description">Task Description <span className="text-[#8c947b]">(optional)</span></Label>
                    <textarea
                        id="task-description"
                        className={`${fieldClass} min-h-[80px] resize-y`}
                        placeholder="Briefly describe what needs to be done and the expected outcome."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>

                {!projectId && (
                    <div className="grid grid-cols-1 @md:grid-cols-2 gap-4">
                        <div>
                            <Label>Team Space</Label>
                            <CustomDropdown
                                options={teamSpaces.map(ts => ({ value: ts.id, label: ts.name }))}
                                value={selectedTeamSpaceId}
                                onChange={chooseTeamSpace}
                                placeholder="Select a department"
                                isDisabled={Boolean(teamSpaceId)}
                            />
                        </div>
                        <div>
                            <Label isRequired>Project</Label>
                            <CustomDropdown
                                options={projects.map(p => ({ value: p.id, label: p.name }))}
                                value={selectedProjectId}
                                onChange={setSelectedProjectId}
                                placeholder={selectedTeamSpaceId ? "Select a project" : "Choose a department first"}
                                isDisabled={!selectedTeamSpaceId}
                            />
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 @lg:grid-cols-4 gap-3">
                    <div>
                        <Label isRequired>Status</Label>
                        <CustomDropdown options={STATUS_OPTIONS} value={status} onChange={setStatus} placeholder="Status" />
                    </div>
                    <div>
                        <Label>Assignee</Label>
                        <CustomDropdown
                            options={[{ value: "", label: "Unassigned" }, ...users.map(u => ({ value: u.id, label: u.name }))]}
                            value={assigneeId}
                            onChange={setAssigneeId}
                            placeholder="Assign to someone"
                            icon="person"
                        />
                    </div>
                    <div>
                        <Label htmlFor="task-due-date">Due Date</Label>
                        <input id="task-due-date" className={`${fieldClass} [color-scheme:dark]`} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    </div>
                    <div>
                        <Label>Priority</Label>
                        <CustomDropdown options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} placeholder="Priority" icon="flag" />
                    </div>
                </div>

                {error && (
                    <p className="text-xs text-red-400 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px]">error</span>{error}
                    </p>
                )}
            </div>

            <div className="px-6 py-4 border-t border-[#2D3139] flex justify-end gap-3">
                <button type="button" className="flex items-center gap-1 px-3 py-2 text-xs text-[#8c947b] hover:text-white transition-colors cursor-pointer" onClick={onClose}>
                    <span className="material-symbols-outlined text-[14px]">close</span> Cancel
                </button>
                <button
                    type="button"
                    className="flex items-center gap-1.5 px-4 py-2 btn-primary-accent rounded-lg text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
                    onClick={createTask}
                    disabled={saving}
                >
                    <span className="material-symbols-outlined text-[16px]">add_task</span>
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
