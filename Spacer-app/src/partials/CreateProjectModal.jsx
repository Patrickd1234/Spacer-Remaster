import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export default function CreateProjectModal({ onClose, onCreated }) {
    const [teamSpaces, setTeamSpaces] = useState([]);
    const [teamSpaceId, setTeamSpaceId] = useState("");
    const [name, setName] = useState("");
    const [deadline, setDeadline] = useState("");
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchTeams = async () => {
            const userId = localStorage.getItem("userId");
            if (!userId) return;

            const { data: memberData, error: memberError } = await supabase
                .from("memberships")
                .select("team_space_id, role")
                .eq("user_id", userId);

            const isSuperAdmin = memberData?.some(m => m.role === 'superadmin' || m.role === 'super_admin');

            if (isSuperAdmin) {
                const { data, error } = await supabase.from("team_spaces").select("*").order("name");
                if (!error) {
                    setTeamSpaces(data || []);
                    if (data && data.length > 0) setTeamSpaceId(data[0].id);
                }
            } else if (!memberError && memberData && memberData.length > 0) {
                const teamIds = memberData.map(m => m.team_space_id);
                const { data, error } = await supabase
                    .from("team_spaces")
                    .select("*")
                    .in("id", teamIds)
                    .order("name");
                if (!error) {
                    setTeamSpaces(data || []);
                    if (data && data.length > 0) setTeamSpaceId(data[0].id);
                }
            } else {
                setTeamSpaces([]);
            }
        };
        fetchTeams();
    }, []);

    const createProject = async () => {
        setError(null);

        if (!name.trim()) {
            setError("Please specify a project name.");
            return;
        }
        if (!teamSpaceId) {
            setError("You need to belong to a Team Space before creating a project.");
            return;
        }

        setSaving(true);
        const insertPayload = { team_space_id: teamSpaceId, name: name.trim() };
        if (deadline) {
            insertPayload.deadline = deadline;
        }

        const { data, error } = await supabase
            .from("project_spaces")
            .insert(insertPayload)
            .select()
            .single();
        setSaving(false);

        if (error) {
            setError(error.message);
            return;
        }

        onCreated?.(data);
        onClose();
    };

    return (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-md" onClick={onClose}>
            <div
                className="bg-surface-container rounded-xl border border-outline-variant w-full max-w-lg shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface-container-high">
                    <div>
                        <h2 className="font-headline-lg text-headline-lg text-primary-container">Create New Project</h2>
                        <p className="font-body-sm text-on-surface-variant">Define the parameters for your new mission.</p>
                    </div>
                    <button className="text-on-surface-variant hover:text-on-surface transition-colors" onClick={onClose}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-lg space-y-lg">
                    <div className="space-y-xs">
                        <label className="font-label-md text-label-md text-on-surface uppercase tracking-wider">
                            Team Space
                        </label>
                        <select
                            className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm font-body-md text-on-surface focus:ring-1 focus:ring-primary-container focus:border-primary-container transition-all"
                            value={teamSpaceId}
                            onChange={(e) => setTeamSpaceId(e.target.value)}
                        >
                            {teamSpaces.length === 0 && <option value="">No Team Spaces available</option>}
                            {teamSpaces.map((ts) => (
                                <option key={ts.id} value={ts.id}>{ts.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-xs">
                        <label className="font-label-md text-label-md text-on-surface uppercase tracking-wider" htmlFor="proj-name">
                            Project Name
                        </label>
                        <div className="relative group">
                            <input
                                id="proj-name"
                                className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm font-body-md text-on-surface focus:ring-1 focus:ring-primary-container focus:border-primary-container transition-all placeholder:text-on-surface-variant/40"
                                placeholder="e.g. Operation Nightfall"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-xs">
                        <label className="font-label-md text-label-md text-on-surface uppercase tracking-wider" htmlFor="deadline">
                            Deadline
                        </label>
                        <input
                            id="deadline"
                            className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm font-body-md text-on-surface focus:ring-1 focus:ring-primary-container focus:border-primary-container transition-all [color-scheme:dark]"
                            type="date"
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                        />
                        <p className="text-[11px] text-on-surface-variant/60">
                            Please ensure the "deadline" column exists in your "project_spaces" database table to save this field.
                        </p>
                    </div>

                    {error && <p className="font-body-sm text-red-400">{error}</p>}
                </div>

                <div className="p-lg pt-0 flex gap-md">
                    <button
                        className="flex-1 py-sm border border-outline-variant rounded-lg font-label-md text-label-md font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        className="flex-1 py-sm bg-primary-container text-on-primary-container rounded-lg font-label-md text-label-md font-bold hover:opacity-90 transition-all disabled:opacity-50"
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