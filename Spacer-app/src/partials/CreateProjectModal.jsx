import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase, getSessionUser } from "../supabase";
import Select from "../components/Select";
import { useRole } from "../RoleContext";
import { departmentLeadOptions } from "../projectDepartments";
import { isMissingSchema } from "../crossDepartmentData";
import CollabProjectModal from "./CollabProjectModal";

const fieldClass = "w-full bg-canvas border border-line rounded-lg px-md py-sm text-sm text-white focus:outline-none focus:border-accent-ink/50 transition-all placeholder:text-muted/40";
const Label = ({ htmlFor, children }) => (
    <label className="font-label-md text-xs text-muted uppercase tracking-wider" htmlFor={htmlFor}>{children}</label>
);

// Create a project in one department. "Collab" switches to CollabProjectModal for
// a project shared by several departments, keeping what was typed here.
export default function CreateProjectModal({ onClose, onCreated }) {
    const { can } = useRole();
    const [isCollab, setIsCollab] = useState(false);
    const [teamSpaces, setTeamSpaces] = useState([]);
    const [pickedTeamSpaceId, setTeamSpaceId] = useState("");
    // Memberships of the chosen department: { team_space_id, role, users: { id, name } }
    const [memberRows, setMemberRows] = useState([]);
    const [pickedTeamLeadId, setTeamLeadId] = useState("");
    const [sessionUserId, setSessionUserId] = useState(null);
    const [name, setName] = useState("");
    const [deadline, setDeadline] = useState("");
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

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

    // Only departments the database lets this user create projects in
    const allowedTeamSpaces = teamSpaces.filter((t) => can("project.create", t.id));
    const teamSpaceId = allowedTeamSpaces.some((t) => t.id === pickedTeamSpaceId)
        ? pickedTeamSpaceId
        : allowedTeamSpaces[0]?.id ?? "";

    useEffect(() => {
        if (!teamSpaceId) return;
        let active = true;
        supabase
            .from("memberships")
            .select("team_space_id, role, users(id, name)")
            .eq("team_space_id", teamSpaceId)
            .then(({ data, error: membersError }) => {
                if (!active) return;
                if (membersError) console.error("Loading department members failed:", membersError);
                else setMemberRows(data || []);
            });
        return () => { active = false; };
    }, [teamSpaceId]);

    // Team lead: anyone in the department; you by default, else the first person
    const teamLeads = departmentLeadOptions(memberRows, teamSpaceId).options;
    const teamLeadId = teamLeads.some((u) => u.id === pickedTeamLeadId)
        ? pickedTeamLeadId
        : teamLeads.some((u) => u.id === sessionUserId) ? sessionUserId : teamLeads[0]?.id ?? "";

    const createProject = async () => {
        setError(null);
        if (!name.trim()) {
            setError("Please specify a project name.");
            return;
        }
        if (!teamSpaceId) {
            setError("You can only create projects in a department where you're a team lead or admin.");
            return;
        }

        setSaving(true);
        const { data, error: projectError } = await supabase
            .from("project_spaces")
            .insert({ team_space_id: teamSpaceId, name: name.trim(), team_lead: teamLeadId || null, ...(deadline ? { due_date: deadline } : {}) })
            .select()
            .single();
        if (projectError) {
            setSaving(false);
            setError(projectError.message);
            return;
        }

        // The team lead is a member of the project, which also sends them the
        // "added to a project" email and notification
        if (teamLeadId) {
            const { error: memberError } = await supabase.from("project_members").insert({ project_id: data.id, user_id: teamLeadId });
            if (memberError) console.error("Adding the team lead to the project failed:", memberError);
        }
        // Its department is its lead department (before that migration there's nothing to save)
        const { error: departmentError } = await supabase.from("project_departments").insert({
            project_id: data.id, team_space_id: teamSpaceId, lead_id: teamLeadId || null,
            due_date: deadline || null, is_lead_department: true,
        });
        if (departmentError && !isMissingSchema(departmentError)) console.error("Saving the project's department failed:", departmentError);

        const { error: logError } = await supabase.from("activity_log").insert({
            entity_type: "project", entity_id: data.id, actor_id: sessionUserId, action: "created",
            new_state: { project_name: data.name, team_space_id: data.team_space_id },
        });
        if (logError) console.error("Error logging project creation:", logError);

        setSaving(false);
        onCreated?.(data);
        onClose();
    };

    if (isCollab) {
        return (
            <CollabProjectModal
                initialName={name}
                initialDeadline={deadline}
                initialLeadDepartmentId={teamSpaceId}
                onBack={() => setIsCollab(false)}
                onClose={onClose}
                onCreated={onCreated}
            />
        );
    }

    // Opened on <body>, above everything: from the header (a lower layer than the
    // sidebar) it would otherwise sit under the sidebar
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-md bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-raised rounded-xl border border-line w-full max-w-lg shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="p-lg border-b border-line/30 flex justify-between items-center bg-surface1">
                    <div>
                        <h2 className="font-headline-lg text-xl text-accent-ink font-bold">Create New Project</h2>
                        <p className="text-xs text-muted">Define the parameters for your new mission.</p>
                    </div>
                    <button type="button" aria-label="Close" className="text-muted hover:text-white transition-colors cursor-pointer" onClick={onClose}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-lg space-y-lg">
                    <div className="space-y-xs">
                        <Label>Team Space</Label>
                        <Select className={fieldClass} value={teamSpaceId} onChange={(e) => setTeamSpaceId(e.target.value)}>
                            {allowedTeamSpaces.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                        </Select>
                    </div>

                    <div className="space-y-xs">
                        <Label>Team Lead</Label>
                        <Select className={fieldClass} value={teamLeadId} onChange={(e) => setTeamLeadId(e.target.value)}>
                            {teamLeads.length === 0 && <option value="">No Team Leads available</option>}
                            {teamLeads.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                        </Select>
                    </div>

                    <div className="space-y-xs">
                        <Label htmlFor="proj-name">Project Name</Label>
                        <input id="proj-name" className={fieldClass} placeholder="e.g. Operation Nightfall" type="text" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>

                    <div className="space-y-xs">
                        <Label htmlFor="deadline">
                            Deadline <span className="normal-case tracking-normal text-muted/60">(optional)</span>
                        </Label>
                        <input id="deadline" className={`${fieldClass} [color-scheme:dark]`} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                    </div>

                    {error && <p className="text-xs text-red-400">{error}</p>}
                </div>

                <div className="p-lg pt-0 flex gap-md">
                    <button
                        type="button"
                        onClick={() => setIsCollab(true)}
                        title="Work on this project with other departments"
                        className="flex items-center justify-center gap-1.5 px-md py-sm border border-accent-ink/40 rounded-lg font-label-md text-xs font-bold text-accent-ink hover:bg-accent/10 transition-all cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[16px]">handshake</span>
                        Collab
                    </button>
                    <button type="button" className="flex-1 py-sm border border-line rounded-lg font-label-md text-xs font-bold text-muted hover:text-white hover:bg-line transition-all cursor-pointer" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="flex-1 py-sm bg-accent text-on-accent rounded-lg font-label-md text-xs font-bold hover:bg-accent-hover transition-all disabled:opacity-50 cursor-pointer"
                        onClick={createProject}
                        disabled={saving}
                    >
                        {saving ? "Creating…" : "Create Project"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
