import { useEffect, useState } from "react"
import { supabase } from "../supabase"
import { createDepartment, countWords, DESCRIPTION_WORD_LIMIT } from "../createDepartment"
import { SearchField, PersonRow, SelectedPerson, PersonCheckCard, Chips } from "./PersonPicker"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const matchesPerson = (person, query) => {
    const q = query.trim().toLowerCase()
    return !q || (person.name || "").toLowerCase().includes(q) || (person.email || "").toLowerCase().includes(q)
}

const labelClass = "block text-xs font-medium text-white mb-2"
const inputClass = "w-full bg-[#14161b] border border-[#2D3139] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#8c947b]/60 focus:outline-none focus:border-[var(--primary-color)]"

function InvitePopover({ onInvite, onClose }) {
    const [email, setEmail] = useState("")
    const [error, setError] = useState("")

    const handleSend = () => {
        const value = email.trim().toLowerCase()
        if (!EMAIL_PATTERN.test(value)) {
            setError("Enter a valid email address.")
            return
        }
        onInvite(value)
    }

    return (
        <div className="mt-2 bg-[#191c21] border border-[#2D3139] rounded-xl p-4 shadow-2xl space-y-3">
            <div>
                <p className="text-sm font-semibold text-white">Invite Members</p>
                <p className="text-[11px] text-[#8c947b] mt-0.5">
                    Invite someone to join your organization. Once they accept, they can be assigned to departments and projects.
                </p>
            </div>
            <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError("") }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSend() } }}
                placeholder="Enter email"
                className={inputClass}
                autoFocus
            />
            {error && <p className="text-[11px] text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="flex items-center gap-1 px-3 py-1.5 text-xs text-[#8c947b] hover:text-white cursor-pointer">
                    <span className="material-symbols-outlined text-[14px]">close</span> Cancel
                </button>
                <button type="button" onClick={handleSend} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold btn-primary-accent cursor-pointer">
                    <span className="material-symbols-outlined text-[14px]">send</span> Send Invite
                </button>
            </div>
        </div>
    )
}

function InviteLink({ onClick }) {
    return (
        <p className="text-[11px] text-[#8c947b] mt-2">
            Can't find the right person?{" "}
            <button type="button" onClick={onClick} className="text-primary-fixed underline hover:no-underline cursor-pointer">Invite new members</button>
        </p>
    )
}

// `canAssignPeople`: only super admins can add people to a department they don't
// belong to yet (the edge function enforces this), so others get name + description only.
export default function CreateDepartmentModal({ organizationId, canAssignPeople, onClose, onCreated, onFailed }) {
    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [orgUsers, setOrgUsers] = useState([])
    const [lead, setLead] = useState(null)
    const [leadQuery, setLeadQuery] = useState("")
    const [isLeadListOpen, setIsLeadListOpen] = useState(false)
    const [memberIds, setMemberIds] = useState([])
    const [memberQuery, setMemberQuery] = useState("")
    const [isMemberGridOpen, setIsMemberGridOpen] = useState(false)
    const [invitedEmails, setInvitedEmails] = useState([])
    const [isInviteOpen, setIsInviteOpen] = useState(false)
    const [formError, setFormError] = useState("")
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        if (!canAssignPeople || !organizationId) return
        let active = true
        supabase
            .from("users")
            .select("id, name, email")
            .eq("organization_id", organizationId)
            .order("name")
            .then(({ data, error }) => {
                if (error) console.error("Loading organization members failed:", error)
                if (active) setOrgUsers(data || [])
            })
        return () => { active = false }
    }, [canAssignPeople, organizationId])

    useEffect(() => {
        const handleKey = (e) => { if (e.key === "Escape" && !isSaving) onClose() }
        window.addEventListener("keydown", handleKey)
        return () => window.removeEventListener("keydown", handleKey)
    }, [onClose, isSaving])

    const wordCount = countWords(description)
    const leadOptions = orgUsers.filter((u) => matchesPerson(u, leadQuery))
    const memberOptions = orgUsers.filter((u) => u.id !== lead?.id && matchesPerson(u, memberQuery))
    const selectedMembers = orgUsers.filter((u) => memberIds.includes(u.id) && u.id !== lead?.id)
    const chipLabels = [
        ...selectedMembers.map((u) => ({ key: u.id, text: u.name || u.email })),
        ...invitedEmails.map((email) => ({ key: email, text: email })),
    ]

    const toggleMember = (person) =>
        setMemberIds((ids) => ids.includes(person.id) ? ids.filter((id) => id !== person.id) : [...ids, person.id])

    const removeChip = (key) => {
        setMemberIds((ids) => ids.filter((id) => id !== key))
        setInvitedEmails((emails) => emails.filter((email) => email !== key))
    }

    const handleInvite = (email) => {
        const existing = orgUsers.find((u) => u.email?.toLowerCase() === email)
        if (existing) {
            if (existing.id !== lead?.id && !memberIds.includes(existing.id)) setMemberIds((ids) => [...ids, existing.id])
        } else if (!invitedEmails.includes(email)) {
            setInvitedEmails((emails) => [...emails, email])
        }
        setIsInviteOpen(false)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!name.trim()) return setFormError("Enter a department name.")
        if (wordCount > DESCRIPTION_WORD_LIMIT) return setFormError(`Keep the description to ${DESCRIPTION_WORD_LIMIT} words.`)
        if (canAssignPeople && !lead) return setFormError("Choose a department lead.")
        if (!organizationId) return setFormError("Your organization couldn't be loaded. Refresh and try again.")

        setFormError("")
        setIsSaving(true)
        const result = await createDepartment({
            organizationId,
            name,
            description,
            leadEmail: lead?.email,
            memberEmails: [...selectedMembers.map((u) => u.email), ...invitedEmails],
        })
        setIsSaving(false)

        if (result.error) onFailed(result.error)
        else onCreated(result)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <form onSubmit={handleSubmit} className="bg-[#191c21] rounded-2xl w-full max-w-[640px] max-h-[92vh] flex flex-col border border-[#2D3139] shadow-2xl">
                <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[#2D3139]">
                    <div>
                        <h3 className="text-base font-semibold text-white">Create Department</h3>
                        <p className="text-xs text-[#8c947b] mt-1">Create a new department by assigning a lead and organizing members.</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="text-[#8c947b] hover:text-white cursor-pointer">
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <div className="px-6 py-5 space-y-5 overflow-y-auto">
                    <p className="text-sm font-semibold text-white">Department Details</p>

                    <div>
                        <label htmlFor="dept-name" className={labelClass}>Department Name <span className="text-red-400">*</span></label>
                        <input id="dept-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Development" maxLength={80} className={inputClass} />
                    </div>

                    <div>
                        <label htmlFor="dept-description" className={labelClass}>
                            Department Description <span className={wordCount > DESCRIPTION_WORD_LIMIT ? "text-red-400" : "text-[#8c947b]"}>({wordCount}/{DESCRIPTION_WORD_LIMIT} words)</span>
                        </label>
                        <textarea id="dept-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this department do?" className={`${inputClass} resize-none`} />
                    </div>

                    {canAssignPeople && (
                        <>
                            <div>
                                <p className={labelClass}>Department Lead <span className="text-red-400">*</span></p>
                                {lead ? (
                                    <SelectedPerson person={lead} onClear={() => setLead(null)} />
                                ) : (
                                    <>
                                        <SearchField
                                            value={leadQuery}
                                            onChange={(v) => { setLeadQuery(v); setIsLeadListOpen(true) }}
                                            onFocus={() => setIsLeadListOpen(true)}
                                            placeholder="Search organization members by name or email"
                                            isOpen={isLeadListOpen}
                                            onToggle={() => setIsLeadListOpen((open) => !open)}
                                        />
                                        {isLeadListOpen && (
                                            <div className="mt-2 max-h-48 overflow-y-auto bg-[#14161b] border border-[#2D3139] rounded-lg p-1">
                                                {leadOptions.length === 0
                                                    ? <p className="text-xs text-[#8c947b] px-3 py-3">No matching members.</p>
                                                    : leadOptions.map((person) => (
                                                        <PersonRow key={person.id} person={person} onSelect={(p) => { setLead(p); setLeadQuery(""); setIsLeadListOpen(false) }} />
                                                    ))}
                                            </div>
                                        )}
                                    </>
                                )}
                                <InviteLink onClick={() => setIsInviteOpen(true)} />
                            </div>

                            <div>
                                <p className={labelClass}>Department Members</p>
                                <SearchField
                                    value={memberQuery}
                                    onChange={(v) => { setMemberQuery(v); setIsMemberGridOpen(true) }}
                                    onFocus={() => setIsMemberGridOpen(true)}
                                    placeholder="Search organization members by name or email"
                                    isOpen={isMemberGridOpen}
                                    onToggle={() => setIsMemberGridOpen((open) => !open)}
                                />
                                <div className="mt-2"><Chips labels={chipLabels} onRemove={removeChip} /></div>
                                {isMemberGridOpen && (
                                    <div className="mt-2 max-h-64 overflow-y-auto bg-[#14161b] border border-[#2D3139] rounded-lg p-2">
                                        {memberOptions.length === 0
                                            ? <p className="text-xs text-[#8c947b] px-2 py-3">No matching members.</p>
                                            : (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                    {memberOptions.map((person) => (
                                                        <PersonCheckCard key={person.id} person={person} isChecked={memberIds.includes(person.id)} onToggle={toggleMember} />
                                                    ))}
                                                </div>
                                            )}
                                    </div>
                                )}
                                {isInviteOpen
                                    ? <InvitePopover onInvite={handleInvite} onClose={() => setIsInviteOpen(false)} />
                                    : <InviteLink onClick={() => setIsInviteOpen(true)} />}
                            </div>
                        </>
                    )}

                    {formError && (
                        <p className="text-xs text-red-400 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px]">error</span>{formError}
                        </p>
                    )}
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#2D3139]">
                    <button type="button" onClick={onClose} disabled={isSaving} className="flex items-center gap-1 px-3 py-2 text-xs text-[#8c947b] hover:text-white cursor-pointer disabled:opacity-50">
                        <span className="material-symbols-outlined text-[14px]">close</span> Cancel
                    </button>
                    <button type="submit" disabled={isSaving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold btn-primary-accent cursor-pointer disabled:opacity-50">
                        <span className="material-symbols-outlined text-[16px]">domain_add</span>
                        {isSaving ? "Creating…" : "Create Department"}
                    </button>
                </div>
            </form>
        </div>
    )
}
