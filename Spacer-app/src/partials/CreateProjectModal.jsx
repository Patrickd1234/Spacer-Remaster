import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase, getSessionUser } from "../supabase";
import Select from "../components/Select";
import { useRole } from "../RoleContext";
import { addableDepartments, departmentLeadOptions, applyDepartmentChange, resolveDepartmentLead } from "../projectDepartments";
import { normalizeDepartments, newProjectProblem, createProjectArgs, applyDeadlineChange } from "../newProject";
import { createProject, fetchOrganizationDepartments } from "../crossDepartmentData";
import { announceProjectCreated } from "../appEvents";
import ProjectDepartmentCard from "./ProjectDepartmentCard";

const fieldClass = "w-full bg-canvas border border-line rounded-lg px-md py-sm text-sm text-white focus:outline-none focus:border-accent-ink/50 transition-all placeholder:text-muted/40";
const addButtonClass = "w-full py-2.5 rounded-xl border border-dashed border-line text-accent-ink text-xs font-bold hover:bg-accent/5 hover:border-accent-ink/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";
const nameOfTeam = (teamSpaces, id) => teamSpaces.find((t) => String(t.id) === String(id))?.name || "Department";
const joinNames = (names) => (names.length <= 1 ? names[0] || "" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
const footerHint = (isShared, invitedNames) => {
    if (invitedNames.length > 0) return `${joinNames(invitedNames)} will be invited and join once their lead accepts.`;
    return isShared ? "Give departments that depend on another's hand-off a later due date." : "";
};
const SectionLabel = ({ children }) => <p className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">{children}</p>;
const FieldLabel = ({ htmlFor, children }) => <label htmlFor={htmlFor} className="block text-xs text-muted mb-1.5">{children}</label>;

// Every department of the organization, the ones the user may create
// projects in (the others can only be invited), and who the user is
function useOrganizationDepartments() {
    const { can } = useRole();
    const [teamSpaces, setTeamSpaces] = useState([]);
    const [sessionUserId, setSessionUserId] = useState(null);
    useEffect(() => {
        let active = true;
        const load = async () => {
            const [user, { data }] = await Promise.all([getSessionUser(), fetchOrganizationDepartments()]);
            if (!active) return;
            setSessionUserId(user?.id ?? null);
            setTeamSpaces(data);
        };
        load();
        return () => { active = false; };
    }, []);
    return { teamSpaces, creatableTeamSpaces: teamSpaces.filter((t) => can("project.create", t.id)), sessionUserId };
}

// Members of the given departments: { team_space_id, role, users: { id, name } }
function useDepartmentMembers(departmentKey) {
    const [rows, setRows] = useState([]);
    useEffect(() => {
        if (!departmentKey) return undefined;
        let active = true;
        supabase
            .from("memberships")
            .select("team_space_id, role, users(id, name)")
            .in("team_space_id", departmentKey.split(","))
            .then(({ data, error }) => {
                if (!active) return;
                if (error) console.error("Loading department members failed:", error);
                else setRows(data || []);
            });
        return () => { active = false; };
    }, [departmentKey]);
    return rows;
}

// Create a project. It starts in one department; "+ Work with another
// department" makes it a Collab project shared by several, the first one
// leading. A department the user can't create projects in is invited and
// joins once its lead accepts. Everything is saved in one transaction
// (create_project()).
export default function CreateProjectModal({ onClose }) {
    const { teamSpaces, creatableTeamSpaces, sessionUserId } = useOrganizationDepartments();
    const [name, setName] = useState("");
    const [deadline, setDeadline] = useState("");
    const [pickedProjectLeadId, setProjectLeadId] = useState("");
    const [picked, setPicked] = useState([]);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    const creatableIds = new Set(creatableTeamSpaces.map((t) => String(t.id)));
    const departments = normalizeDepartments(picked, creatableTeamSpaces, teamSpaces)
        .map((d, index) => ({ ...d, isInvite: index > 0 && !creatableIds.has(String(d.teamSpaceId)) }));
    const isShared = departments.length > 1;
    const pickedIds = departments.map((d) => d.teamSpaceId);
    const leadTeamId = pickedIds[0] ?? "";
    const nameOf = (id) => nameOfTeam(teamSpaces, id);
    const joinedExtraIds = departments.filter((d, i) => i > 0 && !d.isInvite).map((d) => d.teamSpaceId);
    const invitedNames = departments.filter((d) => d.isInvite).map((d) => nameOf(d.teamSpaceId));
    // An invited department's members aren't readable; its own lead picks who leads it
    const memberRows = useDepartmentMembers(departments.filter((d) => !d.isInvite).map((d) => d.teamSpaceId).join(","));
    const leadChoices = (teamId) => departmentLeadOptions(memberRows, teamId);
    const resolvedLeadId = (dept) => resolveDepartmentLead(dept.leadId, leadChoices(dept.teamSpaceId));

    // Project lead: someone in the lead department; you by default, else the first person
    const projectLeads = leadChoices(leadTeamId).options;
    const projectLeadId = projectLeads.some((u) => u.id === pickedProjectLeadId)
        ? pickedProjectLeadId
        : projectLeads.some((u) => u.id === sessionUserId) ? sessionUserId : projectLeads[0]?.id ?? "";

    const update = (index, changes) => setPicked(departments.map((d, i) => (i === index ? applyDepartmentChange(d, changes) : d)));
    const remove = (index) => setPicked(departments.filter((_, i) => i !== index));
    // The lead department must be one you can create projects in; the others can be any
    const choicesFor = (index, teamId) => addableDepartments(index === 0 ? creatableTeamSpaces : teamSpaces, leadTeamId, pickedIds.slice(1), teamId);
    const nextDepartment = addableDepartments(teamSpaces, leadTeamId, pickedIds.slice(1))[0];
    const addDepartment = () => {
        if (nextDepartment) setPicked([...departments, { teamSpaceId: nextDepartment.id, dueDate: deadline }]);
    };
    // Department dates that followed the deadline (or no longer fit) move with it
    const changeDeadline = (value) => {
        setPicked(applyDeadlineChange(departments, deadline, value));
        setDeadline(value);
    };

    const submit = async () => {
        setError(null);
        const problem = newProjectProblem({ name, deadline, departments, nameOf });
        if (problem) { setError(problem); return; }
        setSaving(true);
        const args = createProjectArgs({ name, deadline, projectLeadId, departments: departments.map((d) => ({ ...d, leadId: resolvedLeadId(d) })) });
        const { data, error: createError } = await createProject(args);
        setSaving(false);
        if (createError) { setError(createError); return; }
        // Invited departments aren't on it until they accept
        announceProjectCreated(data.project, joinedExtraIds);
        onClose();
    };

    const projectFields = (
        <div className="space-y-md">
            {isShared && <SectionLabel>Project</SectionLabel>}
            <div>
                <FieldLabel htmlFor="proj-name">Project name</FieldLabel>
                <input id="proj-name" className={fieldClass} placeholder="e.g. Operation Nightfall" type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
                <FieldLabel htmlFor="deadline">
                    {isShared ? "Overall deadline" : <>Deadline <span className="text-muted/60">(optional)</span></>}
                </FieldLabel>
                <input id="deadline" className={`${fieldClass} [color-scheme:dark]`} type="date" value={deadline} onChange={(e) => changeDeadline(e.target.value)} />
                {isShared && <p className="text-[11px] text-muted mt-1.5">Every department due date must fall on or before this.</p>}
            </div>
            <div>
                <FieldLabel htmlFor="proj-lead">Project lead</FieldLabel>
                <Select id="proj-lead" className={fieldClass} value={projectLeadId} onChange={(e) => setProjectLeadId(e.target.value)}>
                    {projectLeads.length === 0 && <option value="">No one in {nameOf(leadTeamId)} yet</option>}
                    {projectLeads.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </Select>
                {isShared && <p className="text-[11px] text-muted mt-1.5">From {nameOf(leadTeamId)}, the lead department.</p>}
            </div>
            {isShared && (
                <div className="rounded-xl border border-line bg-panel p-md">
                    <p className="text-xs font-semibold text-white">Who can see it</p>
                    <p className="text-xs text-muted mt-1 leading-relaxed">
                        People in these {departments.length} departments can open it{invitedNames.length > 0 && " (an invited one once it accepts)"}. It&apos;s listed in the sidebar for their team leads and for anyone added to it or given a task in it.
                    </p>
                </div>
            )}
        </div>
    );

    const singleDepartment = (
        <div className="space-y-sm">
            <FieldLabel htmlFor="proj-department">Department</FieldLabel>
            <Select id="proj-department" className={fieldClass} value={leadTeamId} onChange={(e) => update(0, { teamSpaceId: e.target.value })}>
                {creatableTeamSpaces.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </Select>
            <button type="button" onClick={addDepartment} disabled={!nextDepartment} title={nextDepartment ? "Share this project with another department" : "Your organization has no other department"} className={addButtonClass}>
                + Work with another department
            </button>
        </div>
    );

    const sharedDepartments = (
        <div className="space-y-md">
            <SectionLabel>Departments ({departments.length})</SectionLabel>
            {departments.map((dept, index) => (
                <ProjectDepartmentCard
                    key={`${index}-${dept.teamSpaceId}`}
                    department={{ ...dept, leadId: resolvedLeadId(dept) }}
                    // Its own pick plus any department not already on the project
                    choices={choicesFor(index, dept.teamSpaceId)}
                    leadOptions={leadChoices(dept.teamSpaceId).options}
                    isLead={index === 0}
                    isInvite={dept.isInvite}
                    maxDate={deadline}
                    onChange={(changes) => update(index, changes)}
                    onRemove={() => remove(index)}
                />
            ))}
            <button type="button" onClick={addDepartment} disabled={!nextDepartment} title={nextDepartment ? "Add a department that will work on this project" : "Every department is already on it"} className={addButtonClass}>
                + Add department
            </button>
        </div>
    );

    // Opened on <body>, above everything: from the header (a lower layer than the
    // sidebar) it would otherwise sit under the sidebar
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-md bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className={`bg-raised rounded-xl border border-line w-full ${isShared ? "max-w-4xl" : "max-w-lg"} max-h-[92vh] flex flex-col shadow-2xl overflow-hidden`} onClick={(e) => e.stopPropagation()}>
                <div className="px-lg pt-lg pb-md flex justify-between items-start border-b border-line/30">
                    <div>
                        <h2 className="text-xl text-accent-ink font-bold">{isShared ? "Create Collab Project" : "Create New Project"}</h2>
                        <p className="text-xs text-muted mt-1">
                            {isShared ? "Shared by several departments. The first one leads." : "It belongs to one department. You can bring in others."}
                        </p>
                    </div>
                    <button type="button" aria-label="Close" className="text-muted hover:text-white transition-colors cursor-pointer" onClick={onClose}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className={`p-lg overflow-y-auto grid grid-cols-1 gap-lg ${isShared ? "md:grid-cols-2" : ""}`}>
                    {projectFields}
                    {isShared ? sharedDepartments : singleDepartment}
                </div>

                <div className="px-lg py-md border-t border-line flex items-center gap-md">
                    <p role={error ? "alert" : undefined} className={`flex-1 text-[11px] ${error ? "text-red-400" : "text-muted"}`}>
                        {error || footerHint(isShared, invitedNames)}
                    </p>
                    <button type="button" className="px-md py-sm border border-line rounded-lg text-xs font-bold text-muted hover:text-white hover:bg-line transition-all cursor-pointer" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="button" className="px-md py-sm bg-accent text-on-accent rounded-lg text-xs font-bold hover:bg-accent-hover transition-all disabled:opacity-50 cursor-pointer" onClick={submit} disabled={saving}>
                        {saving ? "Creating…" : "Create project"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
