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
            const { data, error } = await supabase.from("team_spaces").select("*").order("name");
            if (error) {
                console.log(error);
            } else {
                setTeamSpaces(data || []);
                if (data && data.length > 0) setTeamSpaceId(data[0].id);
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
        const { data, error } = await supabase
            .from("project_spaces")
            .insert({ team_space_id: teamSpaceId, name: name.trim() })
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-md bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-[#191c21] rounded-xl border border-[#2D3139] w-full max-w-lg shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-lg border-b border-[#2D3139]/30 flex justify-between items-center bg-[#1C1F26]">
                    <div>
                        <h2 className="font-headline-lg text-headline-lg text-[#aff82a] font-bold">Create New Project</h2>
                        <p className="font-body-sm text-[#8c947b]">Define the parameters for your new mission.</p>
                    </div>
                    <button className="text-[#8c947b] hover:text-white transition-colors cursor-pointer" onClick={onClose}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-lg space-y-lg">
                    <div className="space-y-xs">
                        <label className="font-label-md text-label-md text-[#8c947b] uppercase tracking-wider">
                            Team Space
                        </label>
                        <select
                            className="w-full bg-[#0F1115] border border-[#2D3139] rounded-lg px-md py-sm font-body-md text-white focus:outline-none focus:border-[#aff82a]/50 transition-all"
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
                        <label className="font-label-md text-label-md text-[#8c947b] uppercase tracking-wider" htmlFor="proj-name">
                            Project Name
                        </label>
                        <div className="relative group">
                            <input
                                id="proj-name"
                                className="w-full bg-[#0F1115] border border-[#2D3139] rounded-lg px-md py-sm font-body-md text-white focus:outline-none focus:border-[#aff82a]/50 transition-all placeholder:text-[#8c947b]/40"
                                placeholder="e.g. Operation Nightfall"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-xs">
                        <label className="font-label-md text-label-md text-[#8c947b] uppercase tracking-wider" htmlFor="deadline">
                            Deadline
                        </label>
                        <input
                            id="deadline"
                            className="w-full bg-[#0F1115] border border-[#2D3139] rounded-lg px-md py-sm font-body-md text-white focus:outline-none focus:border-[#aff82a]/50 transition-all [color-scheme:dark]"
                            type="date"
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                        />
                        <p className="text-[11px] text-[#8c947b]/60">
                            Not saved yet — there's no deadline column on projects. Let me know if you want one added.
                        </p>
                    </div>

                    {error && <p className="font-body-sm text-red-400">{error}</p>}
                </div>

                <div className="p-lg pt-0 flex gap-md">
                    <button
                        className="flex-1 py-sm border border-[#2D3139] rounded-lg font-label-md text-label-md font-bold text-[#8c947b] hover:text-white hover:bg-[#2D3139] transition-all cursor-pointer"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        className="flex-1 py-sm bg-[#aff82a] text-[#1C1F26] rounded-lg font-label-md text-label-md font-bold hover:bg-[#9de022] transition-all disabled:opacity-50 cursor-pointer"
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