import { dmAttachmentName } from "./dmAttachmentFiles.js";

// Pure helpers for one direct-message conversation (B-07). The same mapping is
// used for fetched rows and for live inserts, so both look alike in the chat.

// direct_message_reactions rows -> [{ emoji, users: [userId, ...] }] as the chat UI expects
function groupReactions(rows) {
    const usersByEmoji = new Map();
    (rows || []).forEach(({ emoji, user_id }) => {
        usersByEmoji.set(emoji, [...(usersByEmoji.get(emoji) || []), user_id]);
    });
    return [...usersByEmoji.entries()].map(([emoji, users]) => ({ emoji, users }));
}

// A direct_messages row (fetched or from Realtime) -> the chat's message shape
export function mapDmRow(m) {
    const attachment = m.file_attachment;
    return {
        id: m.id,
        sender_id: m.sender_id,
        receiver_id: m.receiver_id,
        content: m.content,
        created_at: m.created_at,
        replyToId: m.reply_to_id ?? null,
        fileAttachment: attachment ? { ...attachment, name: dmAttachmentName(attachment.name) } : null,
        pinned: m.pinned || false,
        reactions: groupReactions(m.direct_message_reactions),
    };
}

const byTime = (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

// The conversation after a fetch: the fetched messages, plus any of mine still
// being sent (pendingIds) that the database doesn't have yet. One copy each.
export function mergeDmMessages(fetched, current, pendingIds) {
    const fetchedIds = new Set(fetched.map((m) => m.id));
    const stillSending = current.filter((m) => pendingIds.has(m.id) && !fetchedIds.has(m.id));
    return [...fetched, ...stillSending].sort(byTime);
}

// When to record a conversation as read: now, or the newest message's server
// time if this computer's clock is behind (otherwise it stays "unread").
export function dmReadStamp(now, latestCreatedAt) {
    const latest = latestCreatedAt ? new Date(latestCreatedAt).getTime() : 0;
    return Math.max(now, Number.isFinite(latest) ? latest : 0);
}

// Rows newest first -> { otherUserId: newest message with them }
export function latestDmPerContact(rows, myId) {
    const latest = {};
    (rows || []).forEach((row) => {
        const otherId = row.sender_id === myId ? row.receiver_id : row.sender_id;
        if (!latest[otherId]) latest[otherId] = mapDmRow(row);
    });
    return latest;
}
