import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase, getSessionUser } from "../supabase";
import Select from "../components/Select";
import { useRole } from "../RoleContext";
import { projectDepartmentIds } from "../projectPermissions";
import { addableDepartments, teamLeadOptions, departmentLeadOptions } from "../projectDepartments";
import { validateDepartmentDates } from "../crossDepartment";
import { isMissingSchema } from "../crossDepartmentData";
import ProjectDepartmentCard from "./ProjectDepartmentCard";

const fieldClass = "w-full bg-canvas border border-line rounded-lg px-md py-sm text-sm text-white focus:outline-none focus:border-accent-ink/50 transition-all placeholder:text-muted/40";
const SectionLabel = ({ children }) => <p className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">{children}</p>;
const FieldLabel = ({ htmlFor, children }) => <label htmlFor={htmlFor} className="block text-xs text-muted mb-1.5">{children}</label>;

// Picks that no longer fit: the lead falls back to the first allowed department,
// others drop out when not allowed or repeated. leadId undefined = use the default.
function normalizeDepartments(picked, allowedTeamSpaces) {
    const allowed = new Set(allowedTeamSpaces.map((t) => String(t.id)));
    const [first, ...rest] = picked;
    const leadId = first && allowed.has(String(first.teamSpaceId)) ? first.teamSpaceId : allowedTeamSpaces[0]?.id;
    if (!leadId) return [];
    const seen = new Set([String(leadId)]);
    const extras = rest.filter((d) => {
        const ok = allowed.has(String(d.teamSpaceId)) && !seen.has(String(d.teamSpaceId));
        seen.add(String(d.teamSpaceId));
        return ok;
    });
    return [{ ...(first || { dueDate: "" }), teamSpaceId: leadId }, ...extras];
}

// Collab: create a project shared by several departments (design: Cross-Department
// Projects, screen 1), opened from the Create Project form's Collab button. The
// first department leads; each has its own lead and due date, none due after the
// overall deadline. Starts from what was typed there; `onBack` returns to it.
export default function CollabProjectModal({ initialName = "", initialDeadline = "", initialLeadDepartmentId = "", onBack, onClose, onCreated }) {
    const { isSuperAdmin, departments: myDepartments } = useRole();
    const [teamSpaces, setTeamSpaces] = useState([]);
    const [memberRows, setMemberRows] = useState([]);
    const [sessionUserId, setSessionUserId] = useState(null);
    const [name, setName] = useState(initialName);
    const [deadline, setDeadline] = useState(initialDeadline);
    const [pickedProjectLeadId, setProjectLeadId] = useState("");
    const [picked, setPicked] = useState(() => (initialLeadDepartmentId ? [{ teamSpaceId: initialLeadDepartmentId, dueDate: initialDeadline }] : []));
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    // Set when the project saved but its departments did not: no second create
    const [isCreated, setIsCreated] = useState(false);

    useEffect(() => {
        const fetchTeams = async () => {
            const user = await getSessionUser();
            if (!user?.id) return;
            setSessionUserId(user.id);
            const { data: profile } = await supabase.from("users").select("organization_id").eq("id", user.id).single();
            if (!profile?.organization_id) return;
            const { data, error: teamsError } = await supabase
                .from("team_spaces").select("*").eq("organization_id", profile.organization_id).order("name");
            if (teamsError) console.error("Loading departments failed:", teamsError);
            else setTeamSpaces(data || []);
        };
        fetchTeams();
    }, []);

    // Only departments the database lets this user add: any for super admins,
    // otherwise those where they're team lead or admin
    const allowedIds = new Set(projectDepartmentIds(myDepartments));
    const allowedTeamSpaces = isSuperAdmin ? teamSpaces : teamSpaces.filter((t) => allowedIds.has(String(t.id)));
    const departments = normalizeDepartments(picked, allowedTeamSpaces);
    const pickedIds = departments.map((d) => d.teamSpaceId);
    const pickedKey = pickedIds.join(",");
    const nameOf = (id) => teamSpaces.find((t) => String(t.id) === String(id))?.name || "Department";

    useEffect(() => {
        if (!pickedKey) return;
        let active = true;
        supabase
            .from("memberships")
            .select("team_space_id, role, users(id, name)")
            .in("team_space_id", pickedKey.split(","))
            .then(({ data, error: membersError }) => {
                if (!active) return;
                if (membersError) console.error("Loading department members failed:", membersError);
                else setMemberRows(data || []);
            });
        return () => { active = false; };
    }, [pickedKey]);

    // Each department's lead: the one picked, or its first team lead
    const leadChoices = (teamId) => departmentLeadOptions(memberRows, teamId);
    const resolvedLeadId = (dept) => {
        const { options, defaultId } = leadChoices(dept.teamSpaceId);
        if (dept.leadId === "" || options.some((o) => o.id === dept.leadId)) return dept.leadId;
        return defaultId;
    };

    // Overall project lead: anyone in the picked departments; you, then the first person
    const projectLeads = teamLeadOptions(memberRows, teamSpaces, pickedIds);
    const projectLeadId = projectLeads.some((u) => u.id === pickedProjectLeadId)
        ? pickedProjectLeadId
        : projectLeads.some((u) => u.id === sessionUserId) ? sessionUserId : projectLeads[0]?.id ?? "";

    const update = (index, changes) => setPicked(departments.map((d, i) => (i === index ? { ...d, ...changes } : d)));
    const remove = (index) => setPicked(departments.filter((_, i) => i !== index));
    const canAddDepartment = addableDepartments(allowedTeamSpaces, pickedIds[0], pickedIds.slice(1)).length > 0;
    const addDepartment = () => {
        const next = addableDepartments(allowedTeamSpaces, pickedIds[0], pickedIds.slice(1))[0];
        if (next) setPicked([...departments, { teamSpaceId: next.id, dueDate: deadline }]);
    };
    // A new overall deadline fills in departments that have no due date yet
    const changeDeadline = (value) => {
        setDeadline(value);
        setPicked(departments.map((d) => (d.dueDate ? d : { ...d, dueDate: value })));
    };

    const validate = () => {
        if (!name.trim()) return "Please specify a project name.";
        if (departments.length === 0) return "You can only create projects in a department where you're a team lead or admin.";
        if (!deadline) return "Please pick the overall deadline.";
        return validateDepartmentDates(deadline, departments.map((d) => ({ name: nameOf(d.teamSpaceId), due_date: d.dueDate })));
    };

    // Saves every department; before the migration, only the extra ones as plain links
    const saveDepartments = async (projectId) => {
        const rows = departments.map((d, i) => ({
            project_id: projectId, team_space_id: d.teamSpaceId, lead_id: resolvedLeadId(d) || null,
            due_date: d.dueDate, is_lead_department: i === 0,
        }));
        const { error: saveError } = await supabase.from("project_departments").insert(rows);
        if (!isMissingSchema(saveError)) return saveError;
        const extras = rows.slice(1).map(({ project_id, team_space_id }) => ({ project_id, team_space_id }));
        if (extras.length === 0) return null;
        return (await supabase.from("project_departments").insert(extras)).error;
    };

    const createProject = async () => {
        setError(null);
        const problem = validate();
        if (problem) { setError(problem); return; }

        setSaving(true);
        const { data, error: projectError } = await supabase
            .from("project_spaces")
            .insert({ team_space_id: pickedIds[0], name: name.trim(), team_lead: projectLeadId || null, due_date: deadline })
            .select()
            .single();
        if (projectError) {
            setSaving(false);
            setError(projectError.message);
            return;
        }

        // The project lead and department leads join the project, which also sends
        // them the "added to a project" email and notification
        const leadIds = [...new Set([projectLeadId, ...departments.map(resolvedLeadId)].filter(Boolean))];
        if (leadIds.length > 0) {
            const { error: memberError } = await supabase.from("project_members").insert(leadIds.map((user_id) => ({ project_id: data.id, user_id })));
            if (memberError) console.error("Adding the leads to the project failed:", memberError);
        }

        const departmentsError = await saveDepartments(data.id);
        setSaving(false);
        if (departmentsError) {
            // The project exists, so keep it and say which part didn't save
            console.error("Adding the departments failed:", departmentsError);
            setError("The project was created, but its departments couldn't be added.");
            setIsCreated(true);
            onCreated?.(data);
            return;
        }

        const { error: logError } = await supabase.from("activity_log").insert({
            entity_type: "project", entity_id: data.id, actor_id: sessionUserId, action: "created",
            new_state: { project_name: data.name, team_space_id: data.team_space_id },
        });
        if (logError) console.error("Error logging project creation:", logError);

        onCreated?.(data, pickedIds.slice(1));
        onClose();
    };

    // Opened on <body>, above everything: from the header (a lower layer than the
    // sidebar) it would otherwise sit under the sidebar
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-md bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-raised rounded-xl border border-line w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-lg pt-lg pb-md flex justify-between items-start">
                    <div>
                        <button type="button" onClick={onBack} className="mb-2 flex items-center gap-1 text-xs text-muted hover:text-white transition-colors cursor-pointer">
                            <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back
                        </button>
                        <h2 className="text-xl text-white font-bold">Collab project</h2>
                        <p className="text-xs text-muted mt-1">Add every department that will work on it. One of them leads.</p>
                    </div>
                    <button type="button" aria-label="Close" className="text-muted hover:text-white transition-colors cursor-pointer" onClick={onClose}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="px-lg pb-lg overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-lg">
                    <div className="space-y-md">
                        <SectionLabel>Project</SectionLabel>
                        <div>
                            <FieldLabel htmlFor="proj-name">Project name</FieldLabel>
                            <input id="proj-name" className={fieldClass} placeholder="e.g. Q4 Customer Onboarding Revamp" type="text" value={name} onChange={(e) => setName(e.target.value)} />
                        </div>
                        <div>
                            <FieldLabel htmlFor="deadline">Overall deadline</FieldLabel>
                            <input id="deadline" className={`${fieldClass} [color-scheme:dark]`} type="date" value={deadline} onChange={(e) => changeDeadline(e.target.value)} />
                            <p className="text-[11px] text-muted mt-1.5">Every department due date must fall on or before this.</p>
                        </div>
                        <div>
                            <FieldLabel>Project lead (overall)</FieldLabel>
                            <Select className={fieldClass} value={projectLeadId} onChange={(e) => setProjectLeadId(e.target.value)}>
                                {projectLeads.length === 0 && <option value="">No one available yet</option>}
                                {projectLeads.map((user) => <option key={user.id} value={user.id}>{user.label}</option>)}
                            </Select>
                        </div>
                        <div className="rounded-xl border border-line bg-panel p-md">
                            <p className="text-xs font-semibold text-white">Who can see it</p>
                            <p className="text-xs text-muted mt-1 leading-relaxed">
                                Members of {departments.length === 1 ? "this department" : `these ${departments.length} departments`} see this project. Everyone else does not.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-md">
                        <SectionLabel>Departments ({departments.length})</SectionLabel>
                        {departments.map((dept, index) => (
                            <ProjectDepartmentCard
                                key={`${index}-${dept.teamSpaceId}`}
                                department={{ ...dept, leadId: resolvedLeadId(dept) }}
                                // Its own pick plus any department not already on the project
                                choices={addableDepartments(allowedTeamSpaces, pickedIds[0], pickedIds.slice(1), dept.teamSpaceId)}
                                leadOptions={leadChoices(dept.teamSpaceId).options}
                                isLead={index === 0}
                                maxDate={deadline}
                                onChange={(changes) => update(index, changes)}
                                onRemove={() => remove(index)}
                            />
                        ))}
                        <button
                            type="button"
                            onClick={addDepartment}
                            disabled={!canAddDepartment}
                            title={canAddDepartment ? "Add a department that will work on this project" : "No other departments you can add"}
                            className="w-full py-2.5 rounded-xl border border-dashed border-line text-accent-ink text-xs font-bold hover:bg-accent/5 hover:border-accent-ink/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                            + Add department
                        </button>
                    </div>
                </div>

                <div className="px-lg py-md border-t border-line flex items-center gap-md">
                    <p className={`flex-1 text-[11px] ${error ? "text-red-400" : "text-muted"}`}>
                        {error || (departments.length > 1 ? "Give departments that depend on another's hand-off a later due date." : "Add more departments if other teams will work on it.")}
                    </p>
                    <button type="button" className="px-md py-sm border border-line rounded-lg text-xs font-bold text-muted hover:text-white hover:bg-line transition-all cursor-pointer" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="px-md py-sm bg-accent text-on-accent rounded-lg text-xs font-bold hover:bg-accent-hover transition-all disabled:opacity-50 cursor-pointer"
                        onClick={isCreated ? onClose : createProject}
                        disabled={saving}
                    >
                        {isCreated ? "Done" : saving ? "Creating…" : "Create project"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
