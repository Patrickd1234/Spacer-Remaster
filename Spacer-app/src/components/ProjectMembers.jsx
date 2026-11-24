import { useState } from "react"
import { Link } from "react-router-dom"
import { ErrorNote } from "../general/GeneralParts"
import PlanetLoader from "./PlanetLoader"
import PersonPhoto from "../avatars/PersonPhoto"

// A project's Members tab. Two kinds of people show up: explicit project
// members, and people who are only here because a task is assigned to them.
// Removing someone is for project managers (project_members_delete allows
// can_manage_project), and anyone can leave a project they were added to.
// Project managers can also add someone who is only here through an assigned
// task as a full member in one click (project_members_insert).

const openChat = (person) =>
    window.dispatchEvent(new CustomEvent("open_coworker_chat", { detail: { user_id: person.id, name: person.name } }))

function MemberCard({ member, isExplicit, isMe, canManage, isAdding, onRemove, onAdd }) {
    const canRemove = isExplicit && (canManage || isMe)
    const canAdd = !isExplicit && canManage
    return (
        <div className="bg-raised border border-line rounded-xl p-4 flex flex-col gap-3 h-full transition-colors hover:border-line-strong">
            <div className="flex items-start justify-between gap-2">
                <div className="w-12 h-12 rounded-xl overflow-hidden border border-line bg-surface1 flex items-center justify-center text-muted font-bold text-lg uppercase">
                    <PersonPhoto userId={member.id} fallback={member.name?.charAt(0) || "?"} />
                </div>
                <span
                    title={isExplicit ? "Added to this project" : "On this project through an assigned task"}
                    className="px-1.5 py-0.5 rounded border border-line bg-panel text-soft text-[10px] font-semibold uppercase tracking-wide"
                >
                    {isExplicit ? "Member" : "Assigned"}
                </span>
            </div>
            <div className="min-w-0">
                <h4 className="text-white font-semibold truncate">{member.name || member.email}{isMe && <span className="text-muted font-normal"> (you)</span>}</h4>
                <p className="text-xs text-muted truncate">{member.job_title || member.email}</p>
            </div>
            <div className="mt-auto flex items-center gap-2">
                {!isMe && (
                    <button type="button" onClick={() => openChat(member)} className="flex-1 bg-surface1 text-white text-sm font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5 hover:bg-line transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-[16px]">chat_bubble</span>
                        Message
                    </button>
                )}
                <Link
                    to={`/general/directory?person=${member.id}`}
                    title="View profile"
                    aria-label={`View ${member.name || "their"} profile`}
                    className={`${isMe ? "flex-1 gap-1.5 text-sm font-semibold text-white" : "w-8"} h-8 bg-surface1 text-muted hover:text-white hover:bg-line rounded-lg flex items-center justify-center transition-colors`}
                >
                    <span className="material-symbols-outlined text-[16px]">person</span>
                    {isMe && "Your profile"}
                </Link>
                {canAdd && (
                    <button
                        type="button"
                        title="Add to project"
                        aria-label={`Add ${member.name || "them"} to the project`}
                        disabled={isAdding}
                        onClick={() => onAdd(member)}
                        className="w-8 h-8 bg-accent/10 text-accent-ink rounded-lg flex items-center justify-center hover:bg-accent/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                    >
                        {isAdding
                            ? <PlanetLoader className="text-[16px]" />
                            : <span className="material-symbols-outlined text-[16px]">person_add</span>}
                    </button>
                )}
                {canRemove && (
                    <button
                        type="button"
                        title={isMe ? "Leave project" : "Remove from project"}
                        aria-label={isMe ? "Leave project" : `Remove ${member.name || "member"} from project`}
                        onClick={() => onRemove(member, isMe)}
                        className="w-8 h-8 bg-red-950/20 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-950/40 transition-colors cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[16px]">{isMe ? "logout" : "person_remove"}</span>
                    </button>
                )}
            </div>
        </div>
    )
}

// Placeholder cards shaped like member cards, while the lists load
function MemberCardSkeleton() {
    return (
        <div className="bg-raised border border-line rounded-xl p-4 flex flex-col gap-3" aria-hidden="true">
            <div className="w-12 h-12 rounded-xl bg-line animate-pulse" />
            <div className="space-y-1.5">
                <div className="h-3.5 w-32 rounded bg-line animate-pulse" />
                <div className="h-3 w-24 rounded bg-line animate-pulse" />
            </div>
            <div className="h-8 rounded-lg bg-line animate-pulse" />
        </div>
    )
}

// projectMembers: project_members rows with `user`; assignedUsers: org users with tasks here.
// isLoading: those lists are still on their way, so an empty list isn't final.
// onRemove(userId) and onAdd(user) resolve to an error or null.
export default function ProjectMembers({ projectMembers, assignedUsers, currentUserId, canManage, isLoading = false, onRemove, onAdd }) {
    const [errorMsg, setErrorMsg] = useState("")
    const [addingId, setAddingId] = useState(null)
    const explicitIds = new Set(projectMembers.map((pm) => pm.user_id))
    const members = [
        ...projectMembers.map((pm) => pm.user).filter(Boolean),
        ...assignedUsers.filter((u) => !explicitIds.has(u.id)),
    ]

    const handleRemove = async (member, isMe) => {
        const question = isMe ? "Leave this project?" : `Remove ${member.name || "this member"} from the project?`
        if (!window.confirm(question)) return
        setErrorMsg("")
        const error = await onRemove(member.id)
        if (error) setErrorMsg(isMe ? "Couldn't leave the project." : "Couldn't remove them. Only project managers can remove members.")
    }

    const handleAdd = async (member) => {
        setErrorMsg("")
        setAddingId(member.id)
        const error = await onAdd(member)
        setAddingId(null)
        if (error) setErrorMsg(`Couldn't add ${member.name || "them"} to the project. Only project managers can add members.`)
    }

    // Show the whole list at once: added members arrive before people who are
    // only here through an assigned task, so a partial list would grow in place
    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="section-members" aria-busy="true" aria-label="Loading members">
                {[0, 1, 2].map((card) => <MemberCardSkeleton key={card} />)}
            </div>
        )
    }

    if (members.length === 0) {
        return (
            <div className="bg-raised rounded-xl p-8 flex flex-col items-center justify-center text-center border border-line" id="section-members">
                <span className="material-symbols-outlined text-4xl text-muted mb-2 opacity-50">group_off</span>
                <p className="text-white font-semibold mb-1">No members yet</p>
                <p className="text-sm text-muted max-w-md">Use the + button to add people, or assign them one of the project's tasks.</p>
            </div>
        )
    }

    return (
        <div className="space-y-3" id="section-members">
            {errorMsg && <ErrorNote>{errorMsg}</ErrorNote>}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {members.map((member) => (
                    <MemberCard
                        key={member.id}
                        member={member}
                        isExplicit={explicitIds.has(member.id)}
                        isMe={member.id === currentUserId}
                        canManage={canManage}
                        isAdding={addingId === member.id}
                        onRemove={handleRemove}
                        onAdd={handleAdd}
                    />
                ))}
            </div>
        </div>
    )
}
