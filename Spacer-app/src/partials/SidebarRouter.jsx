import { useState, useEffect, useRef } from "react";
import { supabase, getSessionUser } from "../supabase";
import WorkspaceSidebar from "./WorkspaceSidebar";
import GroupChat from "../components/GroupChat";
import { useRole } from "../RoleContext";
import { attachmentDisplay, dmAttachmentPath, formatFileSize, validateDmAttachment } from "../dmAttachmentFiles";
import { removeDmAttachment, uploadDmAttachment, withDmAttachmentLinks } from "../dmAttachments";
import UploadingBubble from "../components/UploadingBubble";
import PlanetLoader from "../components/PlanetLoader";

// How close (px) to the bottom of the DM list still counts as "at the bottom"
const NEAR_BOTTOM_PX = 120;

// direct_message_reactions rows -> [{ emoji, users: [userId, ...] }] as the chat UI expects
function groupReactions(rows) {
    const usersByEmoji = new Map();
    (rows || []).forEach(({ emoji, user_id }) => {
        usersByEmoji.set(emoji, [...(usersByEmoji.get(emoji) || []), user_id]);
    });
    return [...usersByEmoji.entries()].map(([emoji, users]) => ({ emoji, users }));
}

// When this browser last read a DM thread (drives the unread dot), kept in
// localStorage between visits. Outside the component: Date.now() is for event
// handlers only, never render.
function storeDmReadNow(otherUserId) {
    const at = Date.now();
    localStorage.setItem(`dm_last_read_${otherUserId}`, at);
    return at;
}

function storedDmRead(otherUserId) {
    return Number(localStorage.getItem(`dm_last_read_${otherUserId}`)) || 0;
}

export default function SidebarRouter(props) {
    // Read times marked in this session. Being state, marking one re-renders the
    // unread dots; a bare localStorage write wouldn't once the component is compiled.
    const [dmReadAt, setDmReadAt] = useState({});
    const markDmRead = (otherUserId) => {
        const at = storeDmReadNow(otherUserId);
        setDmReadAt(prev => ({ ...prev, [otherUserId]: at }));
    };
    const dmLastRead = (otherUserId) => dmReadAt[otherUserId] ?? storedDmRead(otherUserId);
    // Role comes from RoleContext, which handles users with several memberships
    const { roleLoading } = useRole();
    const [userId, setUserId] = useState(null);
    const [orgUsers, setOrgUsers] = useState([]);

    // Chat widget state hooks
    const [showChatModal, setShowChatModal] = useState(false);
    const [chatRecipient, setChatRecipient] = useState(null); // For DMs
    const [activeGroupChat, setActiveGroupChat] = useState(null); // For Groups
    const [userGroups, setUserGroups] = useState([]);
    const [groupUnreadCounts, setGroupUnreadCounts] = useState({});
    const [dmLatestMessages, setDmLatestMessages] = useState({});
    const [searchQuery, setSearchQuery] = useState("");
    
    const [chatMessages, setChatMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [isChatMinimized, setIsChatMinimized] = useState(false);
    const chatPanelRef = useRef(null);
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [editingText, setEditingText] = useState("");
    const [replyingToMessage, setReplyingToMessage] = useState(null);
    const [attachedFile, setAttachedFile] = useState(null);
    const [attachError, setAttachError] = useState("");
    const isSendingRef = useRef(false);
    // The attachment being uploaded, shown as a pending bubble until the message appears
    const [dmUploading, setDmUploading] = useState(null);
    const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);

    const imageInputRef = useRef(null);
    const docInputRef = useRef(null);
    const messagesEndRef = useRef(null);
    const isNearBottomRef = useRef(true);
    const lastMessageCountRef = useRef(0);
    const lastScrolledChatRef = useRef(null);


    // Initial role and coworkers load
    useEffect(() => {
        const initRouterAndChat = async () => {
            try {
                const authUser = await getSessionUser();
                if (!authUser) return;
                setUserId(authUser.id);

                // Coworkers for the Message Hub
                const coworkerWork = (async () => {
                    const { data: userProfile } = await supabase
                        .from("users")
                        .select("organization_id")
                        .eq("id", authUser.id)
                        .maybeSingle();
                    if (!userProfile?.organization_id) return;

                    const { data: coworkers } = await supabase
                        .from("users")
                        .select("id, name, email")
                        .eq("organization_id", userProfile.organization_id);
                    if (coworkers) {
                        setOrgUsers(coworkers
                            .filter(u => u.id !== authUser.id)
                            .map(u => ({ ...u, user_id: u.id })));
                    }
                })();

                // All DMs for this user, to find the latest message per contact
                const dmWork = (async () => {
                    const { data: allDms } = await supabase
                        .from("direct_messages")
                        .select("id, sender_id, receiver_id, created_at, content")
                        .or(`sender_id.eq.${authUser.id},receiver_id.eq.${authUser.id}`)
                        .order("created_at", { ascending: false });

                    const dmsMap = {};
                    (allDms || []).forEach(msg => {
                        const otherId = msg.sender_id === authUser.id ? msg.receiver_id : msg.sender_id;
                        if (!dmsMap[otherId]) dmsMap[otherId] = msg;
                    });
                    setDmLatestMessages(dmsMap);
                })();

                // Groups, then the latest message of every group in parallel
                const groupWork = (async () => {
                    const { data: memberChannels } = await supabase
                        .from("chat_channel_members")
                        .select("channel_id")
                        .eq("user_id", authUser.id);

                    const channelIds = (memberChannels || []).map(mc => mc.channel_id);

                    let groupQuery = supabase.from("chat_channels").select("id, name, is_private, created_at");
                    if (channelIds.length > 0) {
                        groupQuery = groupQuery.or(`is_private.eq.false,id.in.(${channelIds.join(',')})`);
                    } else {
                        groupQuery = groupQuery.eq('is_private', false);
                    }

                    const { data: groups } = await groupQuery;
                    if (!groups) return;
                    setUserGroups(groups);

                    const latestMessages = await Promise.all(groups.map(group =>
                        supabase
                            .from('messages')
                            .select('created_at')
                            .eq('channel_id', group.id)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .maybeSingle()
                            .then(({ data }) => data)
                    ));

                    const unreadMap = {};
                    const groupsWithLatest = groups.map((group, i) => {
                        const latestMsg = latestMessages[i];
                        if (!latestMsg) return { ...group, latest_message_at: group.created_at }; // Fallback
                        const lastRead = localStorage.getItem(`group_last_read_${group.id}`);
                        if (!lastRead || new Date(latestMsg.created_at).getTime() > Number(lastRead)) {
                            unreadMap[group.id] = true;
                        }
                        return { ...group, latest_message_at: latestMsg.created_at };
                    });
                    setUserGroups(groupsWithLatest);
                    setGroupUnreadCounts(unreadMap);
                })();

                const results = await Promise.allSettled([coworkerWork, dmWork, groupWork]);
                results
                    .filter(r => r.status === "rejected")
                    .forEach(r => console.error("SidebarRouter init error:", r.reason));
            } catch (err) {
                console.error("SidebarRouter init error:", err);
            }
        };
        initRouterAndChat();
    }, []);

    // A click anywhere outside the open chat closes it. The conversation stays
    // selected, so the chat button reopens it. Buttons elsewhere that open a chat
    // ("Message") still work: this runs on pointerdown, before their click.
    useEffect(() => {
        if (!showChatModal || isChatMinimized) return undefined;
        const handlePointerDown = (e) => {
            if (chatPanelRef.current && !chatPanelRef.current.contains(e.target)) setShowChatModal(false);
        };
        document.addEventListener("pointerdown", handlePointerDown);
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [showChatModal, isChatMinimized]);

    // Listen to custom open chat event from other pages
    useEffect(() => {
        if (!userId) return;
        const handleOpenChatEvent = async (e) => {
            const member = e.detail;
            setChatRecipient(member);
            setShowChatModal(true);
            setIsChatMinimized(false);
            await fetchChatMessages(member.user_id);

            markDmRead(member.user_id);
        };
        window.addEventListener("open_coworker_chat", handleOpenChatEvent);
        return () => window.removeEventListener("open_coworker_chat", handleOpenChatEvent);
    }, [userId, orgUsers]);

    // Real-time synchronization effect when chat is active
    useEffect(() => {
        if (!showChatModal || !chatRecipient || !userId) return;

        // 1. Initial load
        fetchChatMessages(chatRecipient.user_id);

        // 2. Database Polling fallback (every 3 seconds)
        const intervalId = setInterval(() => {
            fetchChatMessages(chatRecipient.user_id);
        }, 3000);

        // 3. Database Real-time postgres_changes listener
        const channel = supabase
            .channel(`dm_${userId}_${chatRecipient.user_id}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "direct_messages",
                },
                (payload) => {
                    const newMsg = payload.new;
                    const isBetween = (newMsg.sender_id === userId && newMsg.receiver_id === chatRecipient.user_id) ||
                                      (newMsg.sender_id === chatRecipient.user_id && newMsg.receiver_id === userId);
                    if (isBetween) {
                        setChatMessages(prev => {
                            if (prev.some(m => m.id === newMsg.id)) return prev;
                            return [...prev, newMsg];
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            clearInterval(intervalId);
            supabase.removeChannel(channel);
        };
    }, [showChatModal, chatRecipient, userId]);

    // Auto-scroll to the bottom when a chat opens, or when a new message arrives
    // while the user is already at the bottom (or sent it). Messages are re-fetched
    // every few seconds, so scrolling on every change would yank the user down
    // while they read older messages.
    useEffect(() => {
        if (!showChatModal || !chatRecipient) {
            lastScrolledChatRef.current = null;
            return;
        }

        const isNewChat = lastScrolledChatRef.current !== chatRecipient.user_id;
        if (isNewChat) isNearBottomRef.current = true;
        const lastMessage = chatMessages[chatMessages.length - 1];
        const hasNewMessage = chatMessages.length > lastMessageCountRef.current;
        const sentByMe = lastMessage?.sender_id === userId;

        lastScrolledChatRef.current = chatRecipient.user_id;
        lastMessageCountRef.current = chatMessages.length;

        if (isNewChat || (hasNewMessage && (isNearBottomRef.current || sentByMe))) {
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: isNewChat ? "auto" : "smooth" });
            }, 80);
        }
    }, [chatMessages, showChatModal, chatRecipient, userId]);

    const handleMessagesScroll = (e) => {
        const el = e.currentTarget;
        isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    };

    // Global real-time listener for incoming messages to update unread badge counts in real time
    useEffect(() => {
        if (!userId) return;

        const globalMsgChannel = supabase
            .channel(`global_dms_${userId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "direct_messages",
                },
                (payload) => {
                    const newMsg = payload.new;
                    if (newMsg.receiver_id === userId || newMsg.sender_id === userId) {
                        const otherId = newMsg.sender_id === userId ? newMsg.receiver_id : newMsg.sender_id;
                        setDmLatestMessages(prev => ({ ...prev, [otherId]: newMsg }));
                        
                        const isCurrentlyOpen = showChatModal && !isChatMinimized && chatRecipient?.user_id === otherId;
                        if (isCurrentlyOpen) {
                            markDmRead(otherId);
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(globalMsgChannel);
        };
    }, [userId, showChatModal, isChatMinimized, chatRecipient]);

    // Global real-time listener for group messages
    useEffect(() => {
        if (userGroups.length === 0) return;

        const groupIds = userGroups.map(g => g.id);
        const groupChannel = supabase
            .channel(`global_groups_${userId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                },
                (payload) => {
                    const newMsg = payload.new;
                    if (groupIds.includes(newMsg.channel_id)) {
                        // Update the latest message timestamp for the group
                        setUserGroups(prev => prev.map(g => 
                            g.id === newMsg.channel_id ? { ...g, latest_message_at: newMsg.created_at } : g
                        ));
                        
                        if (newMsg.sender_id !== userId) {
                            const isCurrentlyOpen = showChatModal && !isChatMinimized && activeGroupChat?.id === newMsg.channel_id;
                            if (!isCurrentlyOpen) {
                                setGroupUnreadCounts(prev => ({ ...prev, [newMsg.channel_id]: true }));
                            } else {
                                // Update last read timestamp since we are actively looking at it
                                localStorage.setItem(`group_last_read_${newMsg.channel_id}`, Date.now());
                            }
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(groupChannel);
        };
    }, [userGroups, showChatModal, isChatMinimized, activeGroupChat, userId]);

    // Chat operations
    async function fetchChatMessages(recipientId) {
        if (!userId || !recipientId) return;
        try {
            const { data, error } = await supabase
                .from("direct_messages")
                .select("*, direct_message_reactions(emoji, user_id)")
                .or(`and(sender_id.eq.${userId},receiver_id.eq.${recipientId}),and(sender_id.eq.${recipientId},receiver_id.eq.${userId})`)
                .order("created_at", { ascending: true });

            if (error) console.error("Fetch direct messages error:", error);
            if (!error && data) {
                const mappedData = data.map(m => ({
                    id: m.id,
                    sender_id: m.sender_id,
                    receiver_id: m.receiver_id,
                    content: m.content,
                    created_at: m.created_at,
                    replyToId: m.reply_to_id,
                    fileAttachment: m.file_attachment,
                    pinned: m.pinned || false,
                    reactions: groupReactions(m.direct_message_reactions)
                }));
                setChatMessages(await withDmAttachmentLinks(mappedData));
            }
        } catch (err) {
            console.error("Fetch direct messages error:", err);
        }
    };

    const handleOpenChat = async (recipient) => {
        setChatRecipient(recipient);
        setShowChatModal(true);
        setIsChatMinimized(false);
        markDmRead(recipient.user_id);
        await fetchChatMessages(recipient.user_id);
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() && !attachedFile) return;
        if (!chatRecipient || !userId) return;
        // A second Enter while a file uploads would send it twice
        if (isSendingRef.current) return;
        isSendingRef.current = true;

        const msgContent = newMessage.trim();
        const fileToSend = attachedFile;
        const messageId = crypto.randomUUID();
        setAttachError("");

        // Upload first: the message must never point at a file that isn't there.
        // The row stores only where the file is, not the file itself.
        let fileAttachment = null;
        if (fileToSend) {
            setDmUploading({ name: fileToSend.name, type: fileToSend.type });
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            const path = dmAttachmentPath(userId, messageId, fileToSend.name);
            const uploadError = await uploadDmAttachment(path, fileToSend.file);
            setDmUploading(null);
            if (uploadError) {
                console.error("DM attachment upload failed:", uploadError);
                setAttachError(`Could not upload ${fileToSend.name}. Please try again.`);
                isSendingRef.current = false;
                return;
            }
            fileAttachment = { name: fileToSend.name, size: fileToSend.size, type: fileToSend.type, path };
        }
        setNewMessage("");
        isSendingRef.current = false;

        const [newMsgObj] = await withDmAttachmentLinks([{
            id: messageId,
            sender_id: userId,
            receiver_id: chatRecipient.user_id,
            content: msgContent,
            created_at: new Date().toISOString(),
            replyToId: replyingToMessage ? replyingToMessage.id : null,
            replyToContent: replyingToMessage ? replyingToMessage.content : null,
            replyToSenderName: replyingToMessage ? (replyingToMessage.sender_id === userId ? "You" : chatRecipient.name) : null,
            fileAttachment
        }]);

        setChatMessages(prev => [...prev, newMsgObj]);
        setDmLatestMessages(prev => ({ ...prev, [chatRecipient.user_id]: newMsgObj }));
        setReplyingToMessage(null);
        setAttachedFile(null);

        try {
            const { error } = await supabase
                .from("direct_messages")
                .insert({
                    id: messageId,
                    sender_id: userId,
                    receiver_id: chatRecipient.user_id,
                    content: msgContent,
                    reply_to_id: newMsgObj.replyToId,
                    file_attachment: fileAttachment
                });

            if (error) throw error;
        } catch (err) {
            // Not saved: take the message back out and give the text back (B-04)
            console.warn("Error sending message to DB:", err);
            if (fileAttachment) removeDmAttachment(fileAttachment.path);
            setChatMessages(prev => prev.filter(m => m.id !== messageId));
            setNewMessage(current => current || msgContent);
            setAttachError("Your message wasn't sent. Please try again.");
        }
    };

    const handleEditMessage = async (msgId, newText) => {
        if (!newText.trim() || !chatRecipient || !userId) return;
        const previousMessages = chatMessages;
        try {
            const updatedMessages = chatMessages.map(msg => {
                if (msg.id === msgId) {
                    return { ...msg, content: newText.trim(), edited: true };
                }
                return msg;
            });
            setChatMessages(updatedMessages);
            setEditingMessageId(null);
            setEditingText("");

            const { data, error } = await supabase
                .from("direct_messages")
                .update({ content: newText.trim(), edited: true })
                .eq("id", msgId)
                .select("id");
            if (error) throw error;
            // Row-level security can quietly update nothing
            if (!data?.length) throw new Error("Message not updated");
        } catch (err) {
            // Not saved: show the message as it was (B-04)
            console.warn("Edit message error:", err);
            setChatMessages(previousMessages);
            setAttachError("Your edit wasn't saved. Please try again.");
        }
    };

    const handleDeleteMessage = async (msgId) => {
        if (!chatRecipient || !userId) return;
        const previousMessages = chatMessages;
        try {
            const attachmentPath = chatMessages.find(m => m.id === msgId)?.fileAttachment?.path;
            const updatedMessages = chatMessages.filter(m => m.id !== msgId);
            setChatMessages(updatedMessages);

            const { data, error } = await supabase
                .from("direct_messages")
                .delete()
                .eq("id", msgId)
                .select("id");
            if (error) throw error;
            // Row-level security can quietly delete nothing
            if (!data?.length) throw new Error("Message not deleted");
            if (attachmentPath) await removeDmAttachment(attachmentPath);
        } catch (err) {
            // Not deleted: put the message back (B-04)
            console.warn("Delete message error:", err);
            setChatMessages(previousMessages);
            setAttachError("The message couldn't be deleted. Please try again.");
        }
    };

    const handleTogglePinMessage = async (msgId) => {
        if (!chatRecipient || !userId) return;
        try {
            let nextPinnedState = false;
            const updatedMessages = chatMessages.map(msg => {
                if (msg.id === msgId) {
                    nextPinnedState = !msg.pinned;
                    return { ...msg, pinned: nextPinnedState };
                }
                return msg;
            });
            setChatMessages(updatedMessages);

            // Either participant may pin; the database function changes only the pin
            const { error } = await supabase.rpc("toggle_dm_pin", { p_message_id: msgId });
            if (error) {
                console.error("Toggle pin message error:", error);
                fetchChatMessages(chatRecipient.user_id);
            }
        } catch (err) {
            console.warn("Toggle pin message error:", err);
        }
    };

    const handleAddReaction = async (msgId, emoji) => {
        if (!chatRecipient || !userId) return;
        try {
            const updatedMessages = chatMessages.map(msg => {
                if (msg.id === msgId) {
                    const existingReactions = msg.reactions || [];
                    let cleanedReactions = existingReactions.map(r => {
                        return {
                            ...r,
                            users: r.users.filter(uid => uid !== userId)
                        };
                    }).filter(r => r.users.length > 0);
                    
                    const hadThisEmoji = existingReactions.some(r => r.emoji === emoji && r.users.includes(userId));
                    
                    if (!hadThisEmoji) {
                        const matchIdx = cleanedReactions.findIndex(r => r.emoji === emoji);
                        if (matchIdx > -1) {
                            cleanedReactions[matchIdx].users.push(userId);
                        } else {
                            cleanedReactions.push({ emoji, users: [userId] });
                        }
                    }
                    return { ...msg, reactions: cleanedReactions };
                }
                return msg;
            });
            setChatMessages(updatedMessages);

            // One reaction per person per message: clear mine, then add the new one
            // unless the same emoji was clicked again (which just removes it)
            const original = chatMessages.find(m => m.id === msgId);
            const isRemovingSameEmoji = (original?.reactions || [])
                .some(r => r.emoji === emoji && r.users.includes(userId));

            const { error: deleteError } = await supabase
                .from("direct_message_reactions")
                .delete()
                .eq("message_id", msgId)
                .eq("user_id", userId);
            const { error: insertError } = isRemovingSameEmoji
                ? { error: null }
                : await supabase
                    .from("direct_message_reactions")
                    .insert({ message_id: msgId, user_id: userId, emoji });

            if (deleteError || insertError) {
                console.error("Add reaction error:", deleteError || insertError);
                fetchChatMessages(chatRecipient.user_id);
            }
        } catch (err) {
            console.warn("Add reaction error:", err);
        }
    };

    const handleAttachFile = (e) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // picking the same file again should fire onChange
        if (!file) return;

        const invalid = validateDmAttachment(file);
        setAttachError(invalid || "");
        if (invalid) return;
        setAttachedFile({ file, name: file.name, size: formatFileSize(file.size), type: file.type });
    };

    const getUnreadConversationsCount = () => {
        let count = 0;
        // Count unread DMs
        orgUsers.forEach(member => {
            if (member.user_id === userId) return;
            const latestMsg = dmLatestMessages[member.user_id];
            if (latestMsg && latestMsg.receiver_id === userId) {
                if (new Date(latestMsg.created_at).getTime() > dmLastRead(member.user_id)) {
                    count++;
                }
            }
        });
        
        // Count unread Groups
        Object.values(groupUnreadCounts).forEach(isUnread => {
            if (isUnread) count++;
        });
        
        return count;
    };

    // The role (from RoleContext) decides which sidebar renders
    if (roleLoading) return null;

    // Every role shares one sidebar; it adapts to super admins itself
    const sidebarElement = (
        <WorkspaceSidebar
            {...props}
            unreadMessages={getUnreadConversationsCount()}
            isMessagesOpen={showChatModal && !isChatMinimized}
            onOpenMessages={() => { setShowChatModal(true); setIsChatMinimized(false); }}
        />
    );

    return (
        <>
            {sidebarElement}

            {/* Floating Message Hub Button */}
            {!showChatModal && (
                <button
                    onClick={() => setShowChatModal(true)}
                    className="fixed bottom-6 right-6 z-[100] w-14 h-14 rounded-full btn-primary-accent shadow-2xl flex items-center justify-center cursor-pointer transition-all hover:scale-105 active:scale-95 group"
                >
                    <span className="material-symbols-outlined text-2xl">forum</span>
                    {getUnreadConversationsCount() > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-[#ffffff] font-extrabold text-[10px] min-w-[20px] h-[20px] rounded-full flex items-center justify-center px-1 border-2 border-panel animate-bounce">
                            {getUnreadConversationsCount()}
                        </span>
                    )}
                </button>
            )}

            {/* Floating Message Hub Window */}
            {showChatModal && (
                <div 
                    ref={chatPanelRef}
                    className={`fixed z-[100] transition-all duration-300 shadow-2xl border border-line bg-panel/95 backdrop-blur-md rounded-2xl flex flex-col overflow-hidden ${
                        isChatMinimized 
                            ? 'bottom-6 right-6 w-[280px] h-[48px]' 
                            : 'bottom-6 right-6 w-[360px] h-[480px]'
                    }`}
                >
                    {/* Header */}
                    <div 
                        onClick={() => isChatMinimized && setIsChatMinimized(false)}
                        className={`px-4 py-3 border-b border-line flex items-center justify-between bg-black/20 ${isChatMinimized ? 'cursor-pointer hover:bg-black/30' : ''}`}
                    >
                        <div className="flex items-center gap-2 overflow-hidden">
                            {(chatRecipient || activeGroupChat) && !isChatMinimized ? (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setChatRecipient(null);
                                        setActiveGroupChat(null);
                                    }}
                                    className="text-muted hover:text-white cursor-pointer mr-1 flex items-center"
                                >
                                    <span className="material-symbols-outlined text-base">arrow_back</span>
                                </button>
                            ) : null}
                            
                            <div className="w-5 h-5 rounded-full bg-faint/20 text-accent-ink flex items-center justify-center font-bold text-[10px]">
                                {chatRecipient ? (chatRecipient.name || "?").charAt(0).toUpperCase() : (activeGroupChat ? "#" : "M")}
                            </div>
                            
                            <h4 className="text-white font-semibold text-xs truncate flex items-center gap-1.5">
                                {chatRecipient ? (chatRecipient.name || "Team Member") : activeGroupChat ? activeGroupChat.name : (
                                    <>
                                        Messages
                                        {getUnreadConversationsCount() > 0 && (
                                            <span className="bg-red-500 text-[#ffffff] font-extrabold text-[9px] min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-1">
                                                {getUnreadConversationsCount()}
                                            </span>
                                        )}
                                    </>
                                )}
                            </h4>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsChatMinimized(!isChatMinimized);
                                }}
                                className="text-muted hover:text-white cursor-pointer p-0.5 flex items-center justify-center transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">{isChatMinimized ? "open_in_full" : "minimize"}</span>
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowChatModal(false);
                                    setChatRecipient(null);
                                    setActiveGroupChat(null);
                                }}
                                className="text-muted hover:text-white cursor-pointer p-0.5 flex items-center justify-center transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                    </div>

                    {!isChatMinimized && (
                        <>
                            {!chatRecipient && !activeGroupChat ? (
                                /* UNIFIED INBOX LISTING */
                                <div className="flex-1 flex flex-col overflow-hidden bg-black/5">
                                    <div className="p-3 border-b border-line bg-black/10">
                                        <div className="relative mb-2">
                                            <input 
                                                type="text"
                                                placeholder="Search people or groups..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="w-full bg-panel border border-white/10 rounded text-white text-xs px-3 py-1.5 focus:outline-none focus:border-accent-ink"
                                            />
                                        </div>
                                        <p className="text-[10px] text-muted font-bold uppercase tracking-wider">Inbox</p>
                                    </div>
                                    <div className="flex-1 overflow-y-auto divide-y divide-line/40 scrollbar-thin">
                                        {(() => {
                                            const lowerQuery = searchQuery.toLowerCase();
                                            
                                            // Process Coworkers (DMs)
                                            let dmList = orgUsers.map(member => {
                                                const latestMsg = dmLatestMessages[member.user_id];
                                                return { ...member, latestMsg, isGroup: false };
                                            });

                                            // Filter Coworkers
                                            if (lowerQuery) {
                                                dmList = dmList.filter(m => (m.name || "").toLowerCase().includes(lowerQuery) || (m.email || "").toLowerCase().includes(lowerQuery));
                                            } else {
                                                dmList = dmList.filter(m => !!m.latestMsg);
                                            }

                                            // Process Groups
                                            let groupList = userGroups.map(g => ({ ...g, isGroup: true }));
                                            if (lowerQuery) {
                                                groupList = groupList.filter(g => (g.name || "").toLowerCase().includes(lowerQuery));
                                            }

                                            // Combine and sort
                                            const combinedList = [...groupList, ...dmList].sort((a, b) => {
                                                const timeA = a.isGroup ? new Date(a.latest_message_at || a.created_at || 0).getTime() : (a.latestMsg ? new Date(a.latestMsg.created_at).getTime() : 0);
                                                const timeB = b.isGroup ? new Date(b.latest_message_at || b.created_at || 0).getTime() : (b.latestMsg ? new Date(b.latestMsg.created_at).getTime() : 0);
                                                return timeB - timeA;
                                            });

                                            if (combinedList.length === 0) {
                                                return <p className="text-xs text-muted italic text-center py-8">{lowerQuery ? "No results found" : "No active chats. Search to start one!"}</p>;
                                            }

                                            return combinedList.map(item => {
                                                if (item.isGroup) {
                                                    const isUnread = groupUnreadCounts[item.id];
                                                    return (
                                                        <div 
                                                            key={`group_${item.id}`}
                                                            onClick={() => {
                                                                localStorage.setItem(`group_last_read_${item.id}`, Date.now());
                                                                setGroupUnreadCounts(prev => ({ ...prev, [item.id]: false }));
                                                                setActiveGroupChat(item);
                                                            }}
                                                            className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer"
                                                        >
                                                            <div className="flex items-center gap-3 overflow-hidden flex-1">
                                                                <div className="w-8 h-8 rounded-xl bg-[var(--primary-color)]/20 flex items-center justify-center font-bold text-accent-ink text-xs uppercase shrink-0">
                                                                    <span className="material-symbols-outlined text-[16px]">tag</span>
                                                                </div>
                                                                <div className="overflow-hidden flex-1">
                                                                    <div className="flex items-center justify-between gap-1">
                                                                        <p className="text-white font-semibold text-xs truncate">{item.name}</p>
                                                                    </div>
                                                                    <p className="text-[10px] text-muted truncate mt-0.5">Group Channel</p>
                                                                </div>
                                                            </div>
                                                            {isUnread && (
                                                                <span className="ml-2 bg-primary-accent text-on-accent font-extrabold text-[9px] w-2 h-2 rounded-full flex items-center justify-center shrink-0"></span>
                                                            )}
                                                        </div>
                                                    );
                                                } else {
                                                    const lastMsg = item.latestMsg;
                                                    let isUnread = false;
                                                    if (lastMsg && lastMsg.receiver_id === userId) {
                                                        if (new Date(lastMsg.created_at).getTime() > dmLastRead(item.user_id)) {
                                                            isUnread = true;
                                                        }
                                                    }

                                                    return (
                                                        <div 
                                                            key={`dm_${item.user_id}`}
                                                            onClick={() => {
                                                                markDmRead(item.user_id);
                                                                handleOpenChat(item);
                                                            }}
                                                            className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer"
                                                        >
                                                            <div className="flex items-center gap-3 overflow-hidden flex-1">
                                                                <div className="w-8 h-8 rounded-xl bg-line flex items-center justify-center font-bold text-white text-xs uppercase shrink-0">
                                                                    {(item.name || "?").charAt(0)}
                                                                </div>
                                                                <div className="overflow-hidden flex-1">
                                                                    <div className="flex items-center justify-between gap-1">
                                                                        <p className="text-white font-semibold text-xs truncate">{item.name || "User"}</p>
                                                                        {lastMsg && (
                                                                            <span className="text-[9px] text-muted shrink-0">
                                                                                {new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-[10px] text-muted truncate mt-0.5">
                                                                        {lastMsg ? (
                                                                            lastMsg.fileAttachment ? "📎 Attached file" : lastMsg.content
                                                                        ) : (
                                                                            item.email
                                                                        )}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            {isUnread && (
                                                                <span className="ml-2 bg-primary-accent text-on-accent font-extrabold text-[9px] w-2 h-2 rounded-full flex items-center justify-center shrink-0">
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                            });
                                        })()}
                                    </div>
                                </div>
                            ) : chatRecipient ? (
                                /* ACTIVE DM CONVERSATION VIEW */
                                <div className="flex-1 flex flex-col overflow-hidden">

                                    {/* Chat Messages Log */}
                                    <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin" onScroll={handleMessagesScroll}>
                                        {chatMessages.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-center p-4">
                                                <span className="material-symbols-outlined text-muted text-3xl mb-1">forum</span>
                                                <p className="text-white font-medium text-xs">No messages yet</p>
                                                <p className="text-[10px] text-muted mt-0.5">Send a message to start.</p>
                                            </div>
                                        ) : (
                                            [...chatMessages]
                                                .sort((a, b) => {
                                                    // Pinned messages first
                                                    if (a.pinned && !b.pinned) return -1;
                                                    if (!a.pinned && b.pinned) return 1;
                                                    // Oldest messages first (chronological order)
                                                    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
                                                    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
                                                    return timeA - timeB;
                                                })
                                                .map((msg) => {
                                                const isMe = msg.sender_id === userId;
                                                const isEditing = editingMessageId === msg.id;

                                                return (
                                                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group relative mb-2`}>
                                                        
                                                        {/* Pinned Message Indicator */}
                                                        {msg.pinned && (
                                                            <div className={`flex items-center gap-0.5 text-[8px] mb-1 text-primary-accent font-bold ${isMe ? 'justify-end' : ''}`}>
                                                                <span className="material-symbols-outlined text-[9px] rotate-45 text-primary-accent">push_pin</span>
                                                                <span>PINNED MESSAGE</span>
                                                            </div>
                                                        )}

                                                        {/* Quoted Message Link */}
                                                        {msg.replyToId && (
                                                            <div className={`flex items-center gap-1 text-[9px] mb-1 opacity-75 ${isMe ? 'justify-end text-primary-accent' : 'text-muted'}`}>
                                                                <span className="material-symbols-outlined text-[10px]">reply</span>
                                                                <span>Quoting {msg.replyToSenderName || 'Member'}: "{msg.replyToContent}"</span>
                                                            </div>
                                                        )}

                                                        {/* Actions Hover Menu */}
                                                        {!isEditing && (
                                                            <div className={`opacity-0 group-hover:opacity-100 flex items-center gap-1.5 absolute -top-5 z-20 transition-opacity bg-surface1 border border-line rounded-lg px-1.5 py-0.5 ${isMe ? 'right-0' : 'left-0'}`}>
                                                                {isMe && (
                                                                    <>
                                                                        <button 
                                                                            onClick={() => { setEditingMessageId(msg.id); setEditingText(msg.content); }}
                                                                            className="text-muted hover:text-white cursor-pointer p-0.5 flex items-center justify-center"
                                                                            title="Edit"
                                                                        >
                                                                            <span className="material-symbols-outlined text-[13px]">edit</span>
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => handleDeleteMessage(msg.id)}
                                                                            className="text-muted hover:text-red-400 cursor-pointer p-0.5 flex items-center justify-center"
                                                                            title="Delete"
                                                                        >
                                                                            <span className="material-symbols-outlined text-[13px]">delete</span>
                                                                        </button>
                                                                    </>
                                                                )}
                                                                <button 
                                                                    onClick={() => setReplyingToMessage(msg)}
                                                                    className="text-muted hover:text-white cursor-pointer p-0.5 flex items-center justify-center"
                                                                    title="Quote Reply"
                                                                >
                                                                    <span className="material-symbols-outlined text-[13px]">reply</span>
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleTogglePinMessage(msg.id)}
                                                                    className={`cursor-pointer p-0.5 flex items-center justify-center transition-colors ${msg.pinned ? 'text-primary-accent hover:text-white' : 'text-muted hover:text-white'}`}
                                                                    title={msg.pinned ? "Unpin Message" : "Pin Message"}
                                                                >
                                                                    <span className="material-symbols-outlined text-[13px]">{msg.pinned ? "keep_off" : "push_pin"}</span>
                                                                </button>
                                                                {['👍', '❤️', '🔥', '😂'].map(emoji => (
                                                                    <button 
                                                                        key={emoji}
                                                                        onClick={() => handleAddReaction(msg.id, emoji)}
                                                                        className="hover:scale-125 transition-transform text-xs cursor-pointer"
                                                                    >
                                                                        {emoji}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Message bubble */}
                                                        <div className={`rounded-2xl px-3 py-2 text-xs relative ${
                                                            isMe 
                                                                ? 'chat-bubble-mine font-medium rounded-tr-none' 
                                                                : 'bg-line text-white rounded-tl-none'
                                                        } ${isMe ? '' : 'order-1'} ${msg.pinned ? 'ring-1 ring-primary-accent border border-primary-accent/40' : ''}`}>
                                                            
                                                            {/* Attached File */}
                                                            {msg.fileAttachment && (() => {
                                                                // Signed storage link, or a checked legacy data URL; unsafe ones aren't rendered
                                                                const { imageSrc, downloadHref } = attachmentDisplay(msg.fileAttachment);
                                                                return (
                                                                <div className="mb-2 p-1.5 rounded-lg bg-black/20 border border-white/5 max-w-[240px]">
                                                                    {imageSrc ? (
                                                                        <img
                                                                            src={imageSrc}
                                                                            alt={msg.fileAttachment.name}
                                                                            className="max-h-[140px] rounded object-cover max-w-full"
                                                                        />
                                                                    ) : (
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="material-symbols-outlined text-lg">description</span>
                                                                            <div className="overflow-hidden">
                                                                                <p className="truncate font-semibold text-[10px]">{msg.fileAttachment.name}</p>
                                                                                <p className="text-[8px] opacity-75">{msg.fileAttachment.size}</p>
                                                                            </div>
                                                                            {downloadHref && (
                                                                                <a
                                                                                    href={downloadHref}
                                                                                    download={msg.fileAttachment.name || "attachment"}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className="ml-auto text-primary-accent hover:underline flex items-center justify-center p-1"
                                                                                >
                                                                                    <span className="material-symbols-outlined text-base">download</span>
                                                                                </a>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                );
                                                            })()}

                                                            {isEditing ? (
                                                                <div className="flex flex-col gap-1 w-48">
                                                                    <textarea
                                                                        value={editingText}
                                                                        onChange={(e) => setEditingText(e.target.value)}
                                                                        className="w-full bg-canvas border border-line text-white p-1.5 rounded text-[11px] focus:outline-none"
                                                                        rows={2}
                                                                    />
                                                                    <div className="flex justify-end gap-1.5">
                                                                        <button 
                                                                            onClick={() => { setEditingMessageId(null); setEditingText(""); }}
                                                                            className="text-[10px] text-neutral-400 hover:text-white px-1.5 py-0.5 rounded cursor-pointer"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => handleEditMessage(msg.id, editingText)}
                                                                            className="text-[10px] bg-white text-canvas font-semibold px-2 py-0.5 rounded hover:bg-white/80 cursor-pointer"
                                                                        >
                                                                            Save
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <p className="whitespace-pre-wrap break-all leading-normal">{msg.content}</p>
                                                            )}

                                                            {/* Reaction Badges */}
                                                            {msg.reactions && msg.reactions.length > 0 && (
                                                                <div className="absolute -bottom-2.5 right-2 flex items-center gap-0.5 bg-surface1 border border-line rounded-full px-1.5 py-0.5 shadow-md scale-90 select-none">
                                                                    {msg.reactions.map((r, idx) => (
                                                                        <span key={idx} className="text-[10px] flex items-center gap-0.5" title={`${r.users.length} reaction(s)`}>
                                                                            <span>{r.emoji}</span>
                                                                            {r.users.length > 1 && <span className="text-[8px] text-muted font-bold">{r.users.length}</span>}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Timestamp and Edited tag */}
                                                        <span className="text-[8px] text-muted mt-1 opacity-75">
                                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            {msg.edited && <span className="ml-1 italic font-medium text-primary-accent">(edited)</span>}
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        )}
                                        {dmUploading && <UploadingBubble files={[dmUploading]} compact />}
                                        <div ref={messagesEndRef} />
                                    </div>

                                    {/* Quote Reply Banner */}
                                    {replyingToMessage && (
                                        <div className="px-3 py-1.5 bg-black/40 border-t border-line flex items-center justify-between text-[10px] text-primary-accent">
                                            <div className="flex items-center gap-1.5 overflow-hidden">
                                                <span className="material-symbols-outlined text-xs">reply</span>
                                                <span className="truncate">Replying to: "{replyingToMessage.content}"</span>
                                            </div>
                                            <button 
                                                onClick={() => setReplyingToMessage(null)}
                                                className="text-muted hover:text-white cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-xs">close</span>
                                            </button>
                                        </div>
                                    )}

                                    {attachError && (
                                        <div role="alert" className="px-3 py-2 bg-red-500/10 border-t border-red-500/20 text-[10px] text-red-400">
                                            {attachError}
                                        </div>
                                    )}

                                    {/* Attachment Preview */}
                                    {attachedFile && (
                                        <div className="px-3 py-2 bg-black/40 border-t border-line flex items-center justify-between text-[10px] text-primary-accent">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <span className="material-symbols-outlined text-xs flex-shrink-0">
                                                    {attachedFile.type.startsWith("image/") ? "image" : "description"}
                                                </span>
                                                <span className="truncate font-medium">{attachedFile.name}</span>
                                                <span className="text-[8px] text-muted">({attachedFile.size})</span>
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => setAttachedFile(null)}
                                                className="text-muted hover:text-white cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-xs">close</span>
                                            </button>
                                        </div>
                                    )}

                                    {/* Input Footer */}
                                    <form onSubmit={handleSendMessage} className="p-3 border-t border-line bg-black/20 flex gap-2 items-center relative">
                                        {/* Hidden input tags */}
                                        <input 
                                            type="file" 
                                            ref={imageInputRef} 
                                            accept="image/jpeg,image/png,image/gif,image/webp"
                                            onChange={(e) => { handleAttachFile(e); setShowAttachmentMenu(false); }} 
                                            className="hidden" 
                                        />
                                        <input 
                                            type="file" 
                                            ref={docInputRef} 
                                            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv" 
                                            onChange={(e) => { handleAttachFile(e); setShowAttachmentMenu(false); }} 
                                            className="hidden" 
                                        />

                                        {/* Attachment Popover Toggle */}
                                        <div className="relative flex-shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                                                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-base">attach_file</span>
                                            </button>

                                            {/* WhatsApp-like Popover Menu */}
                                            {showAttachmentMenu && (
                                                <>
                                                    {/* Overlay to close popover */}
                                                    <div 
                                                        className="fixed inset-0 z-40" 
                                                        onClick={() => setShowAttachmentMenu(false)}
                                                    />
                                                    <div className="absolute bottom-10 left-0 bg-raised border border-line rounded-2xl p-2 w-48 shadow-2xl z-50 flex flex-col gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => { imageInputRef.current?.click(); }}
                                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-left text-xs font-semibold text-white transition-colors cursor-pointer"
                                                        >
                                                            <span className="material-symbols-outlined text-[#ff5722] text-lg">image</span>
                                                            <span>Photos & Videos</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { docInputRef.current?.click(); }}
                                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-left text-xs font-semibold text-white transition-colors cursor-pointer"
                                                        >
                                                            <span className="material-symbols-outlined text-[#2196f3] text-lg">description</span>
                                                            <span>Document</span>
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <input
                                            type="text"
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            placeholder={attachedFile ? "Add a caption..." : `Message ${chatRecipient.name ? chatRecipient.name.split(' ')[0] : 'member'}...`}
                                            className="flex-1 bg-canvas border border-line rounded-xl px-3 py-2 text-white text-xs focus:ring-1 focus:ring-primary-accent focus:outline-none"
                                        />
                                        <button
                                            type="submit"
                                            disabled={Boolean(dmUploading)}
                                            aria-label={dmUploading ? "Uploading" : "Send"}
                                            className="w-8 h-8 bg-primary-accent text-on-accent hover:opacity-90 rounded-xl flex items-center justify-center transition-all flex-shrink-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            {dmUploading
                                                ? <PlanetLoader className="text-base" />
                                                : <span className="material-symbols-outlined text-base">send</span>}
                                        </button>
                                    </form>
                                </div>
                            ) : activeGroupChat ? (
                                /* ACTIVE GROUP CONVERSATION VIEW */
                                <div className="flex-1 flex flex-col overflow-hidden relative">
                                    <GroupChat 
                                        currentUserId={userId} 
                                        members={orgUsers} 
                                        fabMode={true} 
                                        activeChannelFromFab={activeGroupChat} 
                                    />
                                </div>
                            ) : null}
                        </>
                    )}
                </div>
            )}
        </>
    );
}
