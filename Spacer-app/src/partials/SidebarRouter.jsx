import { Component, Suspense, lazy, useState, useEffect, useRef } from "react";
import { supabase, getSessionUser } from "../supabase";
import WorkspaceSidebar from "./WorkspaceSidebar";
import { useRole } from "../RoleContext";
import { withDmAttachmentLinks } from "../dmAttachments";
import { dmReadStamp, latestDmPerContact, mapDmRow, mergeDmMessages } from "../dmThread";
import PlanetLoader from "../components/PlanetLoader";

// The chat window is downloaded the first time it opens, not with every page.
// Hovering or focusing a Messages button starts the download early.
const loadMessageHubWindow = () => import("./MessageHubWindow");
const MessageHubWindow = lazy(loadMessageHubWindow);

const CHAT_WINDOW_FRAME = "fixed z-[100] bottom-6 right-6 w-[360px] h-[480px] shadow-2xl border border-line bg-panel/95 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center gap-3 p-6 text-center";

// Shown in the chat window's place while it downloads
function ChatWindowLoading() {
    return (
        <div className={CHAT_WINDOW_FRAME}>
            <PlanetLoader label="Loading messages" className="text-[32px] text-accent" />
        </div>
    );
}

// If the chat window can't download (offline, or a new version was deployed),
// say so in its place rather than crashing the whole page
class ChatWindowBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error) {
        console.error("Message window failed to load:", error);
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div role="alert" className={CHAT_WINDOW_FRAME}>
                <p className="text-white font-semibold text-sm">Messages couldn't open</p>
                <p className="text-muted text-xs">Reload the page to try again.</p>
                <div className="flex gap-2">
                    <button type="button" onClick={() => window.location.reload()} className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent font-bold text-xs rounded-lg cursor-pointer">
                        Reload
                    </button>
                    <button type="button" onClick={this.props.onClose} className="px-3 py-1.5 border border-line text-white hover:bg-surface1 font-semibold text-xs rounded-lg cursor-pointer">
                        Close
                    </button>
                </div>
            </div>
        );
    }
}

// P-04: new messages arrive over Realtime (migration 20261126090000); this
// re-fetch only catches anything missed, and is skipped while the tab is hidden
const DM_POLL_FALLBACK_MS = 15000;
// Newest messages loaded for an open conversation
const DM_THREAD_LIMIT = 200;
// Newest messages read to build the inbox (each contact's latest message)
const DM_INBOX_LIMIT = 1000;

// When this browser last read a DM thread (drives the unread dot), kept in
// localStorage between visits. Outside the component: Date.now() is for event
// handlers only, never render. Never earlier than the newest message seen, so
// a computer clock running behind doesn't leave the thread "unread" (B-07).
function storeDmReadNow(otherUserId, latestCreatedAt) {
    const at = dmReadStamp(Date.now(), latestCreatedAt);
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
    const markDmRead = (otherUserId, latestCreatedAt) => {
        const at = storeDmReadNow(otherUserId, latestCreatedAt);
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
    // The open conversation, so a slow fetch for one opened earlier is ignored
    const openRecipientIdRef = useRef(null);
    // My messages shown but not yet saved, kept through re-fetches until saved
    const pendingDmIdsRef = useRef(new Set());

    // Open a conversation (or none). A different one starts empty, so the
    // previous conversation's messages never show under the new name.
    const selectRecipient = (recipient) => {
        const nextId = recipient?.user_id ?? null;
        if (nextId !== openRecipientIdRef.current) setChatMessages([]);
        openRecipientIdRef.current = nextId;
        setChatRecipient(recipient);
    };

    // Whether the chat window is open and not minimized (kept for async callbacks)
    const chatVisibleRef = useRef(false);
    useEffect(() => {
        chatVisibleRef.current = showChatModal && !isChatMinimized;
    }, [showChatModal, isChatMinimized]);

    // The newest message of a conversation, however it arrived (live, re-fetch):
    // it becomes the inbox's latest, and counts as read if that chat is on
    // screen (B-07)
    const noteLatestDm = (otherId, latest) => {
        if (!latest) return;
        const latestAt = new Date(latest.created_at).getTime();
        setDmLatestMessages(prev => {
            const known = prev[otherId];
            if (known && (known.id === latest.id || new Date(known.created_at).getTime() > latestAt)) return prev;
            return { ...prev, [otherId]: latest };
        });
        const isOnScreen = chatVisibleRef.current && openRecipientIdRef.current === otherId;
        if (isOnScreen && latestAt > dmLastRead(otherId)) markDmRead(otherId, latest.created_at);
    };

    // Un-minimizing an open conversation reads it, like opening it does
    const restoreChat = () => {
        setIsChatMinimized(false);
        if (chatRecipient) markDmRead(chatRecipient.user_id, chatMessages[chatMessages.length - 1]?.created_at);
    };

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
                    const { data: allDms, error: dmsError } = await supabase
                        .from("direct_messages")
                        .select("id, sender_id, receiver_id, created_at, content, file_attachment")
                        .or(`sender_id.eq.${authUser.id},receiver_id.eq.${authUser.id}`)
                        .order("created_at", { ascending: false })
                        .limit(DM_INBOX_LIMIT);
                    if (dmsError) console.error("Error loading the inbox:", dmsError);
                    setDmLatestMessages(latestDmPerContact(allDms, authUser.id));
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
            selectRecipient(member);
            setShowChatModal(true);
            setIsChatMinimized(false);
            await fetchChatMessages(member.user_id);

            markDmRead(member.user_id, dmLatestMessages[member.user_id]?.created_at);
        };
        window.addEventListener("open_coworker_chat", handleOpenChatEvent);
        return () => window.removeEventListener("open_coworker_chat", handleOpenChatEvent);
    }, [userId, orgUsers]);

    // Real-time synchronization effect when chat is active
    useEffect(() => {
        if (!showChatModal || !chatRecipient || !userId) return;

        // 1. Initial load
        fetchChatMessages(chatRecipient.user_id);

        // 2. Fallback re-fetch while the tab is visible, and on coming back to it (P-04)
        const refetchIfVisible = () => {
            if (document.visibilityState === "visible") fetchChatMessages(chatRecipient.user_id);
        };
        const intervalId = setInterval(refetchIfVisible, DM_POLL_FALLBACK_MS);
        document.addEventListener("visibilitychange", refetchIfVisible);

        // 3. Database Real-time postgres_changes listener. Inserts are mapped like
        // fetched rows, so attachments show and nothing appears twice (B-07).
        const recipientId = chatRecipient.user_id;
        const channel = supabase
            .channel(`dm_${userId}_${recipientId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "direct_messages",
                },
                async (payload) => {
                    const newMsg = payload.new;
                    const isBetween = (newMsg.sender_id === userId && newMsg.receiver_id === recipientId) ||
                                      (newMsg.sender_id === recipientId && newMsg.receiver_id === userId);
                    if (!isBetween) return;
                    const [msg] = await withDmAttachmentLinks([mapDmRow(newMsg)]);
                    if (openRecipientIdRef.current !== recipientId) return;
                    setChatMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
                    noteLatestDm(recipientId, msg);
                }
            )
            .subscribe();

        return () => {
            clearInterval(intervalId);
            document.removeEventListener("visibilitychange", refetchIfVisible);
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
                        setDmLatestMessages(prev => ({ ...prev, [otherId]: mapDmRow(newMsg) }));

                        const isCurrentlyOpen = showChatModal && !isChatMinimized && chatRecipient?.user_id === otherId;
                        if (isCurrentlyOpen) {
                            markDmRead(otherId, newMsg.created_at);
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
            // The newest messages only (P-04), shown oldest first
            const { data, error } = await supabase
                .from("direct_messages")
                .select("*, direct_message_reactions(emoji, user_id)")
                .or(`and(sender_id.eq.${userId},receiver_id.eq.${recipientId}),and(sender_id.eq.${recipientId},receiver_id.eq.${userId})`)
                .order("created_at", { ascending: false })
                .limit(DM_THREAD_LIMIT);

            if (error) console.error("Fetch direct messages error:", error);
            if (!error && data) {
                const fetched = await withDmAttachmentLinks(data.map(mapDmRow).reverse());
                // Another conversation was opened while this one loaded (B-07)
                if (openRecipientIdRef.current !== recipientId) return;
                setChatMessages(prev => mergeDmMessages(fetched, prev, pendingDmIdsRef.current));
                noteLatestDm(recipientId, fetched[fetched.length - 1]);
            }
        } catch (err) {
            console.error("Fetch direct messages error:", err);
        }
    };

    const handleOpenChat = async (recipient) => {
        selectRecipient(recipient);
        setShowChatModal(true);
        setIsChatMinimized(false);
        markDmRead(recipient.user_id, dmLatestMessages[recipient.user_id]?.created_at);
        await fetchChatMessages(recipient.user_id);
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

    // Everything the chat window reads or changes; its state lives here so it
    // survives the window closing, minimizing, or not being loaded yet
    const hubProps = {
        userId, orgUsers, chatPanelRef,
        isChatMinimized, setIsChatMinimized, restoreChat, setShowChatModal,
        chatRecipient, selectRecipient, activeGroupChat, setActiveGroupChat,
        getUnreadConversationsCount, searchQuery, setSearchQuery,
        dmLatestMessages, setDmLatestMessages, userGroups, groupUnreadCounts, setGroupUnreadCounts,
        dmLastRead, markDmRead, handleOpenChat,
        chatMessages, setChatMessages, fetchChatMessages, pendingDmIdsRef,
        messagesEndRef, isNearBottomRef,
        newMessage, setNewMessage, editingMessageId, setEditingMessageId, editingText, setEditingText,
        replyingToMessage, setReplyingToMessage, attachedFile, setAttachedFile, attachError, setAttachError,
        isSendingRef, dmUploading, setDmUploading, showAttachmentMenu, setShowAttachmentMenu,
        imageInputRef, docInputRef,
    };

    // The role (from RoleContext) decides which sidebar renders
    if (roleLoading) return null;

    // Every role shares one sidebar; it adapts to super admins itself
    const sidebarElement = (
        <WorkspaceSidebar
            {...props}
            unreadMessages={getUnreadConversationsCount()}
            isMessagesOpen={showChatModal && !isChatMinimized}
            onOpenMessages={() => { setShowChatModal(true); restoreChat(); }}
            onPreloadMessages={loadMessageHubWindow}
        />
    );

    return (
        <>
            {sidebarElement}

            {/* Floating Message Hub Button */}
            {!showChatModal && (
                <button
                    onClick={() => setShowChatModal(true)}
                    onPointerEnter={loadMessageHubWindow}
                    onFocus={loadMessageHubWindow}
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

            {/* Floating Message Hub Window, loaded the first time it opens */}
            {showChatModal && (
                <ChatWindowBoundary onClose={() => setShowChatModal(false)}>
                    <Suspense fallback={<ChatWindowLoading />}>
                        <MessageHubWindow {...hubProps} />
                    </Suspense>
                </ChatWindowBoundary>
            )}
        </>
    );
}
