import { useState } from 'react';
import { supabase } from '../supabase';
import AttachmentPreview from './AttachmentPreview';
import { safeHttpsUrl } from '../safeUrl';

export default function ChatMessage({ message, currentUserId, onReply, onDelete }) {
    const isMine = message.user_id === currentUserId;
    const [showReactions, setShowReactions] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    // The attachment open in the preview, or null
    const [previewFile, setPreviewFile] = useState(null);

    const handleReaction = async (emoji) => {
        // Optimistic update could go here
        try {
            const { data: existingReaction } = await supabase
                .from('message_reactions')
                .select('*')
                .eq('message_id', message.id)
                .eq('user_id', currentUserId)
                .eq('emoji', emoji)
                .maybeSingle();

            // Clicking an emoji I already reacted with removes my reaction
            const { error } = existingReaction
                ? await supabase
                    .from('message_reactions')
                    .delete()
                    .eq('id', existingReaction.id)
                : await supabase
                    .from('message_reactions')
                    .insert({
                        message_id: message.id,
                        user_id: currentUserId,
                        emoji
                    });
            if (error) throw error;
        } catch (error) {
            console.error('Error reacting to message:', error);
        }
        setShowReactions(false);
    };

    // Group reactions by emoji
    const reactionCounts = message.message_reactions?.reduce((acc, rxn) => {
        if (!acc[rxn.emoji]) acc[rxn.emoji] = { count: 0, users: [] };
        acc[rxn.emoji].count += 1;
        acc[rxn.emoji].users.push(rxn.user_id);
        return acc;
    }, {}) || {};

    const availableEmojis = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

    return (
        <div className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'} mb-4 group`}>
            <div className={`relative max-w-[70%] rounded-2xl px-4 py-2 ${
                isMine 
                    ? 'chat-bubble-mine rounded-tr-none' 
                    : 'bg-surface2 text-white rounded-tl-none border border-white/5'
            }`}>
                {!isMine && (
                    <div className="text-xs font-semibold mb-1 opacity-70">
                        {message.users?.name || 'Unknown User'}
                    </div>
                )}
                
                {/* Reply Context */}
                {message.parent_message_id && message.parent_message && (
                    <div className={`text-xs p-2 rounded mb-2 border-l-2 ${isMine ? 'bg-white/10 border-white/30' : 'bg-black/20 border-white/20'}`}>
                        <div className="font-semibold opacity-70">{message.parent_message.users?.name}</div>
                        <div className="truncate opacity-80">{message.parent_message.content}</div>
                    </div>
                )}

                {/* Attachments */}
                {message.message_attachments && message.message_attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                        {message.message_attachments.map(att => {
                            const icon = (
                                <span className="material-symbols-outlined text-sm">
                                    {att.file_type?.startsWith('image') ? 'image' : 'description'}
                                </span>
                            );
                            // signed_url is a short-lived link created when messages load;
                            // clicking opens a preview (with a download button)
                            const openPreview = () => setPreviewFile({ name: att.file_name, type: att.file_type, url: att.signed_url });
                            const thumbnailSrc = att.file_type?.startsWith('image/') ? safeHttpsUrl(att.signed_url) : null;
                            if (thumbnailSrc) {
                                return (
                                    <button
                                        type="button"
                                        key={att.id}
                                        onClick={openPreview}
                                        title="Open preview"
                                        className="block rounded-lg overflow-hidden cursor-zoom-in hover:opacity-90 transition-opacity"
                                    >
                                        <img
                                            src={thumbnailSrc}
                                            alt={att.file_name}
                                            loading="lazy"
                                            className="max-h-[160px] max-w-[220px] object-cover"
                                        />
                                    </button>
                                );
                            }
                            return att.signed_url ? (
                                <button
                                    type="button"
                                    key={att.id}
                                    onClick={openPreview}
                                    title="Open preview"
                                    className={`flex items-center gap-2 p-2 rounded text-sm text-left cursor-pointer ${isMine ? 'bg-white/10 hover:bg-white/20' : 'bg-white/5 hover:bg-white/10'} transition-colors`}
                                >
                                    {icon}
                                    <span className="truncate max-w-[150px]">{att.file_name}</span>
                                </button>
                            ) : (
                                <div
                                    key={att.id}
                                    title="This file is no longer available"
                                    className="flex items-center gap-2 p-2 rounded text-sm bg-white/5 opacity-60"
                                >
                                    {icon}
                                    <span className="truncate max-w-[150px]">{att.file_name}</span>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="text-sm whitespace-pre-wrap break-words">
                    {message.content}
                </div>

                {/* Meta */}
                <div className={`text-[10px] mt-1 ${isMine ? 'text-white/70 text-right' : 'text-white/50 text-right'}`}>
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>

                {/* Reactions Display */}
                {Object.keys(reactionCounts).length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-2 -mb-4 ${isMine ? 'justify-end' : 'justify-start'}`}>
                        {Object.entries(reactionCounts).map(([emoji, data]) => {
                            const hasReacted = data.users.includes(currentUserId);
                            return (
                                <button
                                    key={emoji}
                                    onClick={() => handleReaction(emoji)}
                                    title={hasReacted ? 'Remove your reaction' : `React with ${emoji}`}
                                    className={`text-xs px-2 py-0.5 rounded-full border ${
                                        hasReacted 
                                            ? 'bg-[var(--primary-color)]/20 border-accent-ink text-accent-ink' 
                                            : 'bg-black/30 border-white/10 text-white/70 hover:bg-black/50'
                                    }`}
                                >
                                    {emoji} {data.count}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Hover Actions (stay visible while a delete is being confirmed) */}
                <div className={`absolute top-0 ${isMine ? 'right-full mr-2' : 'left-full ml-2'} ${confirmingDelete ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity flex gap-1 bg-panel rounded-lg border border-white/10 p-1 shadow-lg`}>
                    <button 
                        onClick={() => setShowReactions(!showReactions)}
                        className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white"
                        title="React"
                    >
                        <span className="material-symbols-outlined text-sm">add_reaction</span>
                    </button>
                    <button 
                        onClick={() => onReply(message)}
                        className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white"
                        title="Reply"
                    >
                        <span className="material-symbols-outlined text-sm">reply</span>
                    </button>
                    {/* My own messages: first click asks, second deletes */}
                    {isMine && onDelete && (confirmingDelete ? (
                        <>
                            <button
                                type="button"
                                onClick={() => { setConfirmingDelete(false); onDelete(message); }}
                                className="px-1.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold whitespace-nowrap"
                            >
                                Delete?
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmingDelete(false)}
                                className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white"
                                title="Keep message"
                            >
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setConfirmingDelete(true)}
                            className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-red-400"
                            title="Delete message"
                        >
                            <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                    ))}

                    {/* Reaction Picker Popup */}
                    {showReactions && (
                        <div className={`absolute top-full mt-1 ${isMine ? 'right-0' : 'left-0'} flex gap-1 bg-surface2 p-2 rounded-lg shadow-xl border border-white/10 z-10`}>
                            {availableEmojis.map(emoji => (
                                <button
                                    key={emoji}
                                    onClick={() => handleReaction(emoji)}
                                    className="hover:scale-125 transition-transform text-lg"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <AttachmentPreview file={previewFile} onClose={() => setPreviewFile(null)} />
        </div>
    );
}
