import { useCallback, useEffect, useId, useRef, useState } from "react"
import { getSessionUser } from "../supabase"
import { Avatar } from "../general/GeneralParts"
import { COMMENT_MAX, mentionQueryAt, insertMention, matchMentionables, timeAgo } from "./commentFormat"
import {
    fetchComments, addComment, editComment, deleteComment, canModerateComments, fetchMentionables, subscribeToComments,
} from "./commentsData"

const TEXTAREA_CLASS = "w-full bg-field border border-line focus:border-accent-ink rounded-lg px-3 py-2 text-[13px] text-white placeholder-muted focus:outline-none transition-colors resize-none"

// "@Full Name" of anyone in the organization shows highlighted
function CommentBody({ body, names }) {
    const mentioned = names.filter((n) => body.includes(`@${n}`)).sort((a, b) => b.length - a.length)
    if (mentioned.length === 0) return <p className="text-[13px] text-soft whitespace-pre-wrap break-words">{body}</p>
    const pattern = new RegExp(`(${mentioned.map((n) => `@${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).join("|")})`, "g")
    return (
        <p className="text-[13px] text-soft whitespace-pre-wrap break-words">
            {body.split(pattern).map((part, i) => (i % 2 === 1
                ? <span key={i} className="text-accent-ink font-medium">{part}</span>
                : part))}
        </p>
    )
}

// Textarea with @-mention suggestions. Enter sends (Shift+Enter for a new line).
function CommentEditor({ value, onChange, onSubmit, people, selfId, placeholder, isBusy, submitLabel, onCancel = null, autoFocus = false }) {
    const ref = useRef(null)
    const listId = useId()
    const [mention, setMention] = useState(null)
    const [activeIndex, setActiveIndex] = useState(0)
    const suggestions = mention ? matchMentionables(people, mention.query, selfId) : []

    const track = (text, caret) => {
        setMention(mentionQueryAt(text, caret))
        setActiveIndex(0)
    }
    const pick = (person) => {
        const { text, caret } = insertMention(value, mention, person.name)
        onChange(text)
        setMention(null)
        requestAnimationFrame(() => {
            ref.current?.focus()
            ref.current?.setSelectionRange(caret, caret)
        })
    }
    const handleKeyDown = (e) => {
        if (suggestions.length > 0) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault()
                const step = e.key === "ArrowDown" ? 1 : -1
                setActiveIndex((i) => (i + step + suggestions.length) % suggestions.length)
                return
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault()
                pick(suggestions[activeIndex])
                return
            }
            if (e.key === "Escape") {
                e.preventDefault()
                e.stopPropagation()
                setMention(null)
                return
            }
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            onSubmit()
        } else if (e.key === "Escape" && onCancel) {
            e.stopPropagation()
            onCancel()
        }
    }

    return (
        <div className="relative">
            <textarea
                ref={ref}
                rows={2}
                value={value}
                maxLength={COMMENT_MAX}
                autoFocus={autoFocus}
                placeholder={placeholder}
                aria-label={placeholder}
                aria-controls={suggestions.length ? listId : undefined}
                aria-expanded={suggestions.length > 0}
                onChange={(e) => { onChange(e.target.value); track(e.target.value, e.target.selectionStart) }}
                onClick={(e) => track(e.target.value, e.target.selectionStart)}
                onBlur={() => setMention(null)}
                onKeyDown={handleKeyDown}
                className={TEXTAREA_CLASS}
            />
            {suggestions.length > 0 && (
                <ul id={listId} role="listbox" className="absolute z-20 left-0 bottom-full mb-1 w-64 max-h-56 overflow-y-auto bg-raised border border-line rounded-xl shadow-2xl p-1">
                    {suggestions.map((person, index) => (
                        <li
                            key={person.id}
                            role="option"
                            aria-selected={index === activeIndex}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pick(person)}
                            onMouseEnter={() => setActiveIndex(index)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] text-white cursor-pointer ${index === activeIndex ? "bg-surface2" : ""}`}
                        >
                            <Avatar name={person.name} userId={person.id} size="xs" />
                            <span className="truncate">{person.name}</span>
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex items-center justify-between gap-2 mt-1.5">
                <span className="text-[11px] text-faint">Type @ to mention someone · Shift+Enter for a new line</span>
                <div className="flex items-center gap-2">
                    {onCancel && (
                        <button type="button" onClick={onCancel} className="px-2.5 py-1 rounded-md text-[12px] text-muted hover:text-white cursor-pointer">Cancel</button>
                    )}
                    <button
                        type="button"
                        onClick={onSubmit}
                        disabled={isBusy || !value.trim()}
                        className="px-3 py-1 rounded-md bg-accent hover:bg-accent-hover text-on-accent text-[12px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}

function CommentItem({ comment, selfId, canModerate, people, names, onSaved, onDeleted, onError }) {
    const [draft, setDraft] = useState(null)
    const [isBusy, setIsBusy] = useState(false)
    const isMine = Boolean(selfId) && comment.author_id === selfId
    const authorName = comment.author?.name || "Former member"

    const save = async () => {
        if (!draft.trim() || draft.trim() === comment.body) {
            setDraft(null)
            return
        }
        setIsBusy(true)
        const { data, error } = await editComment(comment.id, draft)
        setIsBusy(false)
        if (error) return onError("Your edit wasn't saved. Please try again.")
        onSaved(data)
        setDraft(null)
    }
    const remove = async () => {
        if (!window.confirm("Delete this comment?")) return
        setIsBusy(true)
        const { error } = await deleteComment(comment.id)
        setIsBusy(false)
        if (error) return onError("The comment wasn't deleted. Please try again.")
        onDeleted(comment.id)
    }

    return (
        <li className="group flex gap-2.5">
            <Avatar name={authorName} userId={comment.author_id} size="sm" />
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                    <span className="font-semibold text-white">{isMine ? "You" : authorName}</span>
                    <time dateTime={comment.created_at} title={new Date(comment.created_at).toLocaleString()} className="text-muted">{timeAgo(comment.created_at)}</time>
                    {comment.edited_at && <span className="text-faint" title={`Edited ${new Date(comment.edited_at).toLocaleString()}`}>edited</span>}
                    {(isMine || canModerate) && draft === null && (
                        <span className="ml-auto flex gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            {isMine && <button type="button" onClick={() => setDraft(comment.body)} className="text-muted hover:text-white cursor-pointer">Edit</button>}
                            <button type="button" onClick={remove} disabled={isBusy} className="text-muted hover:text-red-400 cursor-pointer">Delete</button>
                        </span>
                    )}
                </p>
                {draft === null
                    ? <CommentBody body={comment.body} names={names} />
                    : (
                        <div className="mt-1">
                            <CommentEditor
                                value={draft}
                                onChange={setDraft}
                                onSubmit={save}
                                onCancel={() => setDraft(null)}
                                people={people}
                                selfId={selfId}
                                placeholder="Edit your comment"
                                isBusy={isBusy}
                                submitLabel={isBusy ? "Saving…" : "Save"}
                                autoFocus
                            />
                        </div>
                    )}
            </div>
        </li>
    )
}

// The conversation on a task: everyone who can see the task reads and adds
// comments; changes from others appear live.
// `showHeading` false when a surrounding tab already says "Comments"
export default function TaskComments({ taskId, showHeading = true }) {
    const [comments, setComments] = useState(null)
    const [loadError, setLoadError] = useState(false)
    const [actionError, setActionError] = useState("")
    const [selfId, setSelfId] = useState(null)
    const [people, setPeople] = useState([])
    const [canModerate, setCanModerate] = useState(false)
    const [draft, setDraft] = useState("")
    const [isSending, setIsSending] = useState(false)
    const names = people.map((p) => p.name).filter(Boolean)

    const load = useCallback(async () => {
        const { data, error } = await fetchComments(taskId)
        setLoadError(Boolean(error))
        setComments(data)
    }, [taskId])

    useEffect(() => {
        if (!taskId) return
        let active = true
        Promise.all([fetchComments(taskId), getSessionUser(), fetchMentionables(), canModerateComments(taskId)])
            .then(([commentsResult, user, peopleResult, moderateResult]) => {
                if (!active) return
                setLoadError(Boolean(commentsResult.error))
                setComments(commentsResult.data)
                setSelfId(user?.id ?? null)
                setPeople(peopleResult.data)
                setCanModerate(moderateResult.data)
            })
        const unsubscribe = subscribeToComments(taskId, () => { if (active) load() })
        return () => {
            active = false
            unsubscribe()
        }
    }, [taskId, load])

    const send = async () => {
        if (!draft.trim() || !selfId || isSending) return
        setIsSending(true)
        setActionError("")
        const { data, error } = await addComment(taskId, selfId, draft)
        setIsSending(false)
        if (error) {
            setActionError("Your comment wasn't posted. Please try again.")
            return
        }
        setComments((prev) => (prev?.some((c) => c.id === data.id) ? prev : [...(prev || []), data]))
        setDraft("")
    }

    const replaceComment = (saved) => setComments((prev) => prev.map((c) => (c.id === saved.id ? saved : c)))
    const dropComment = (id) => setComments((prev) => prev.filter((c) => c.id !== id))

    return (
        <section aria-label="Comments" className="space-y-3">
            {showHeading && (
                <h4 className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">forum</span>
                    Comments{comments?.length ? ` (${comments.length})` : ""}
                </h4>
            )}
            {comments === null && <p className="text-[12px] text-muted">Loading comments…</p>}
            {loadError && (
                <p role="alert" className="text-[12px] text-red-400">
                    Couldn't load comments. <button type="button" onClick={load} className="underline hover:no-underline cursor-pointer">Try again</button>
                </p>
            )}
            {comments?.length === 0 && !loadError && <p className="text-[12px] text-muted">No comments yet. Start the conversation.</p>}
            {comments?.length > 0 && (
                <ul className="space-y-3">
                    {comments.map((comment) => (
                        <CommentItem
                            key={comment.id}
                            comment={comment}
                            selfId={selfId}
                            canModerate={canModerate}
                            people={people}
                            names={names}
                            onSaved={replaceComment}
                            onDeleted={dropComment}
                            onError={setActionError}
                        />
                    ))}
                </ul>
            )}
            {actionError && <p role="alert" className="text-[12px] text-red-400">{actionError}</p>}
            <CommentEditor
                value={draft}
                onChange={setDraft}
                onSubmit={send}
                people={people}
                selfId={selfId}
                placeholder="Write a comment…"
                isBusy={isSending || !selfId}
                submitLabel={isSending ? "Posting…" : "Comment"}
            />
        </section>
    )
}
