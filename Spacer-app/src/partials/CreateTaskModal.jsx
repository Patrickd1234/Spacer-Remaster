import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";

const CustomDropdown = ({ options, value, onChange, placeholder }) => {
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
                className={`w-full bg-surface-container-lowest border rounded-lg px-md py-sm font-body-md text-on-surface cursor-pointer flex justify-between items-center transition-all ${isOpen ? 'border-primary-container ring-1 ring-primary-container' : 'border-outline-variant hover:border-outline-variant/80'}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={!selectedOption ? "text-on-surface-variant/60" : ""}>{selectedOption ? selectedOption.label : placeholder}</span>
                <span className="material-symbols-outlined text-on-surface-variant text-[20px] transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    expand_more
                </span>
            </div>
            {isOpen && (
                <div className="absolute z-10 mt-xs w-full bg-surface-container border border-outline-variant rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)] max-h-60 overflow-y-auto overflow-x-hidden">
                    {options.map((opt) => (
                        <div 
                            key={opt.value}
                            className={`px-md py-[10px] cursor-pointer font-body-md transition-colors ${String(value) === String(opt.value) ? 'bg-primary-container/10 text-primary font-bold' : 'text-on-surface hover:bg-surface-container-high'}`}
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

export default function CreateTaskModal({ projectId, organizationId, teamSpaceId, initialStatus = "todo", onClose, onCreated }) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [priority, setPriority] = useState("medium");
    const [assigneeId, setAssigneeId] = useState("");
    
    const [users, setUsers] = useState([]);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchUsers = async () => {
            if (!organizationId) return;
            const { data, error } = await supabase
                .from("users")
                .select("id, name")
                .eq("organization_id", organizationId)
                .order("name");
                
            if (error) {
                console.error("Error fetching users:", error);
            } else {
                setUsers(data || []);
            }
        };
        fetchUsers();
    }, [organizationId]);

    const createTask = async () => {
        setError(null);

        if (!title.trim()) {
            setError("Please specify a task name.");
            return;
        }

        if (!projectId || !organizationId) {
            setError("Missing project or organization context.");
            return;
        }

        setSaving(true);
        const { data: userData } = await supabase.auth.getUser();
        
        const { data, error } = await supabase
            .from("tasks")
            .insert({
                project_id: projectId,
                organization_id: organizationId,
                title: title.trim(),
                description: description.trim() || null,
                due_date: dueDate || null,
                priority: priority,
                assignee_id: assigneeId || null,
                created_by: userData?.user?.id || null,
                status: initialStatus
            })
            .select()
            .single();
        
        setSaving(false);

        if (error) {
            setError(error.message);
            return;
        }

        // Log the creation activity
        const logEntry = {
            entity_type: "task",
            entity_id: data.id,
            actor_id: userData?.user?.id || null,
            action: "created",
            new_state: { project_id: projectId, title: data.title }
        };
        await supabase.from("activity_log").insert(logEntry);

        onCreated?.(data);
        onClose();
    };

    return (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-md bg-background/80 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-surface-container rounded-xl border border-outline-variant w-full max-w-lg shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface-container-high">
                    <div>
                        <h2 className="font-headline-lg text-headline-lg text-primary-container">Create New Task</h2>
                        <p className="font-body-sm text-on-surface-variant">Add a new actionable item to your project backlog.</p>
                    </div>
                    <button className="text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer" onClick={onClose}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-lg space-y-lg">
                    <div className="space-y-xs">
                        <label className="font-label-md text-label-md text-on-surface uppercase tracking-wider" htmlFor="task-title">
                            Task Name
                        </label>
                        <input
                            id="task-title"
                            className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm font-body-md text-on-surface focus:ring-1 focus:ring-primary-container focus:border-primary-container transition-all placeholder:text-on-surface-variant/40"
                            placeholder="e.g. Implement user authentication"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>

                    <div className="space-y-xs">
                        <label className="font-label-md text-label-md text-on-surface uppercase tracking-wider" htmlFor="task-description">
                            Description
                        </label>
                        <textarea
                            id="task-description"
                            className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm font-body-md text-on-surface focus:ring-1 focus:ring-primary-container focus:border-primary-container transition-all placeholder:text-on-surface-variant/40 min-h-[80px] resize-y"
                            placeholder="Add more details about this task..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    <div className="space-y-xs">
                        <label className="font-label-md text-label-md text-on-surface uppercase tracking-wider" htmlFor="task-deadline">
                            Deadline
                        </label>
                        <input
                            id="task-deadline"
                            className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm font-body-md text-on-surface focus:ring-1 focus:ring-primary-container focus:border-primary-container transition-all [color-scheme:dark]"
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                        />
                    </div>

                    <div className="flex gap-md">
                        <div className="space-y-xs flex-1">
                            <label className="font-label-md text-label-md text-on-surface uppercase tracking-wider">
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
                            />
                        </div>
                        
                        <div className="space-y-xs flex-1">
                            <label className="font-label-md text-label-md text-on-surface uppercase tracking-wider">
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
                            />
                        </div>
                    </div>

                    {error && <p className="font-body-sm text-red-400">{error}</p>}
                </div>

                <div className="p-lg pt-0 flex gap-md">
                    <button
                        className="flex-1 py-sm border border-outline-variant rounded-lg font-label-md text-label-md font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all cursor-pointer"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        className="flex-1 py-sm bg-primary-container text-on-primary-container rounded-lg font-label-md text-label-md font-bold hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer"
                        onClick={createTask}
                        disabled={saving}
                    >
                        {saving ? "Creating…" : "Create Task"}
                    </button>
                </div>
            </div>
        </div>
    );
}
