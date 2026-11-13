import { useState, useEffect } from "react";
import { supabase, getSessionUser } from "../supabase";
import Select from "../components/Select";
import { useRole } from "../RoleContext";

export default function CreateProjectModal({ onClose, onCreated }) {
    const { can } = useRole();
    const [teamSpaces, setTeamSpaces] = useState([]);
    const [pickedTeamSpaceId, setTeamSpaceId] = useState("");
    const [teamLeads, setTeamLeads] = useState([]);
    const [teamLeadId, setTeamLeadId] = useState("");
    const [name, setName] = useState("");
    const [deadline, setDeadline] = useState("");
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchTeams = async () => {
            const authData = { user: await getSessionUser() };
            const userId = authData?.user?.id;
            if (!userId) return;

            const { data: userProfile } = await supabase
                .from("users")
                .select("organization_id")
                .eq("id", userId)
                .single();

            const orgId = userProfile?.organization_id;
            if (!orgId) return;

            const { data, error } = await supabase
                .from("team_spaces")
                .select("*")
                .eq("organization_id", orgId)
                .order("name");

            if (error) {
                console.error("Loading departments failed:", error);
            } else {
                setTeamSpaces(data || []);
            }
        };
        fetchTeams();
    }, []);

    // Only departments the database lets this user create projects in
    const allowedTeamSpaces = teamSpaces.filter((t) => can("project.create", t.id));
    const teamSpaceId = allowedTeamSpaces.some((t) => t.id === pickedTeamSpaceId)
        ? pickedTeamSpaceId
        : allowedTeamSpaces[0]?.id ?? "";

    useEffect(() => {
        const fetchMembers = async () => {
            if (!teamSpaceId) {
                setTeamLeads([]);
                setTeamLeadId("");
                return;
            }
            const authData = { user: await getSessionUser() };
            const userId = authData?.user?.id;

            const { data: membersData, error: membersError } = await supabase
                .from("memberships")
                .select("users(id, name)")
                .eq("team_space_id", teamSpaceId);
            
            if (!membersError && membersData) {
                const usersList = membersData
                    .map(m => m.users)
                    .filter(Boolean)
                    .sort((a, b) => a.name.localeCompare(b.name));
                
                setTeamLeads(usersList);
                if (userId && usersList.some(u => u.id === userId)) {
                    setTeamLeadId(userId);
                } else if (usersList.length > 0) {
                    setTeamLeadId(usersList[0].id);
                } else {
                    setTeamLeadId("");
                }
            }
        };
        fetchMembers();
    }, [teamSpaceId]);

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
        const insertPayload = { team_space_id: teamSpaceId, name: name.trim(), team_lead: teamLeadId || null };
        if (deadline) insertPayload.due_date = deadline;

        const { data, error } = await supabase
            .from("project_spaces")
            .insert(insertPayload)
            .select()
            .single();

        if (error) {
            setSaving(false);
            setError(error.message);
            return;
        }

        // The team lead is a member of the project, which also sends them the
        // "added to a project" email and notification (migration 20261031100000)
        if (teamLeadId) {
            const { error: memberError } = await supabase.from("project_members").insert({ project_id: data.id, user_id: teamLeadId });
            if (memberError) console.error("Adding the team lead to the project failed:", memberError);
        }
        setSaving(false);

        try {
            const userData = { user: await getSessionUser() };
            const { error: insertError } = await supabase.from('activity_log').insert({
                entity_type: 'project',
                entity_id: data.id,
                actor_id: userData?.user?.id || null,
                action: 'created',
                new_state: { project_name: data.name, team_space_id: data.team_space_id }
            });
            if (insertError) console.error('Error logging project creation:', insertError);
        } catch (logError) {
            console.error('Error logging project creation:', logError);
        }

        onCreated?.(data);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-md bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-raised rounded-xl border border-line w-full max-w-lg shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-lg border-b border-line/30 flex justify-between items-center bg-surface1">
                    <div>
                        <h2 className="font-headline-lg text-xl text-accent-ink font-bold">Create New Project</h2>
                        <p className="text-xs text-muted">Define the parameters for your new mission.</p>
                    </div>
                    <button className="text-muted hover:text-white transition-colors cursor-pointer" onClick={onClose}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-lg space-y-lg">
                    <div className="space-y-xs">
                        <label className="font-label-md text-xs text-muted uppercase tracking-wider">
                            Team Space
                        </label>
                        <Select
                            className="w-full bg-canvas border border-line rounded-lg px-md py-sm text-sm text-white focus:outline-none focus:border-accent-ink/50 transition-all"
                            value={teamSpaceId}
                            onChange={(e) => setTeamSpaceId(e.target.value)}
                        >
                            {allowedTeamSpaces.map((team) => (
                                <option key={team.id} value={team.id}>
                                    {team.name}
                                </option>
                            ))}
                        </Select>
                    </div>

                    <div className="space-y-xs">
                        <label className="font-label-md text-xs text-muted uppercase tracking-wider">
                            Team Lead
                        </label>
                        <Select
                            className="w-full bg-canvas border border-line rounded-lg px-md py-sm text-sm text-white focus:outline-none focus:border-accent-ink/50 transition-all"
                            value={teamLeadId}
                            onChange={(e) => setTeamLeadId(e.target.value)}
                        >
                            {teamLeads.length === 0 && <option value="">No Team Leads available</option>}
                            {teamLeads.map((user) => (
                                <option key={user.id} value={user.id}>{user.name}</option>
                            ))}
                        </Select>
                    </div>

                    <div className="space-y-xs">
                        <label className="font-label-md text-xs text-muted uppercase tracking-wider" htmlFor="proj-name">
                            Project Name
                        </label>
                        <div className="relative group">
                            <input
                                id="proj-name"
                                className="w-full bg-canvas border border-line rounded-lg px-md py-sm text-sm text-white focus:outline-none focus:border-accent-ink/50 transition-all placeholder:text-muted/40"
                                placeholder="e.g. Operation Nightfall"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-xs">
                        <label className="font-label-md text-xs text-muted uppercase tracking-wider" htmlFor="deadline">
                            Deadline <span className="normal-case tracking-normal text-muted/60">(optional)</span>
                        </label>
                        <input
                            id="deadline"
                            className="w-full bg-canvas border border-line rounded-lg px-md py-sm text-sm text-white focus:outline-none focus:border-accent-ink/50 transition-all [color-scheme:dark]"
                            type="date"
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                        />
                    </div>

                    {error && <p className="text-xs text-red-400">{error}</p>}
                </div>

                <div className="p-lg pt-0 flex gap-md">
                    <button
                        className="flex-1 py-sm border border-line rounded-lg font-label-md text-xs font-bold text-muted hover:text-white hover:bg-line transition-all cursor-pointer"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        className="flex-1 py-sm bg-accent text-on-accent rounded-lg font-label-md text-xs font-bold hover:bg-accent-hover transition-all disabled:opacity-50 cursor-pointer"
                        onClick={createProject}
                        disabled={saving}
                    >
                        {saving ? "Creating…" : "Create Project"}
                    </button>
                </div>
            </div>
        </div>
    );
}