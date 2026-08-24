import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import ChatMessage from './ChatMessage';

export default function GroupChat({ projectId, departmentId, currentUserId, members = [], fabMode = false, activeChannelFromFab = null }) {
    const [channels, setChannels] = useState([]);
    const [activeChannel, setActiveChannel] = useState(activeChannelFromFab || null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    
    // Creating channel
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newChannelName, setNewChannelName] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [createError, setCreateError] = useState('');

    // Members View state
    const [showMembersModal, setShowMembersModal] = useState(false);
    const [showAddMemberModal, setShowAddMemberModal] = useState(false);
    const [newMembersToAdd, setNewMembersToAdd] = useState([]);
    
    // Settings state
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [editChannelName, setEditChannelName] = useState('');

    const [activeChannelMembers, setActiveChannelMembers] = useState([]);
    const [fileError, setFileError] = useState('');

    // Reply state
    const [replyingTo, setReplyingTo] = useState(null);

    // Attachments
    const [attachments, setAttachments] = useState([]);
    const fileInputRef = useRef(null);

    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!fabMode) {
            fetchChannels();
        } else {
            setLoading(false);
        }
    }, [projectId, departmentId, fabMode]);

    // Sync from FAB
    useEffect(() => {
        if (fabMode && activeChannelFromFab) {
            setActiveChannel(activeChannelFromFab);
        }
    }, [fabMode, activeChannelFromFab]);

    // Fetch messages when active channel changes
    useEffect(() => {
        if (activeChannel) {
            fetchMessages(activeChannel.id);
            fetchChannelMembers(activeChannel);
            const unsubscribe = subscribeToMessages(activeChannel.id);
            return () => {
                if (unsubscribe) unsubscribe();
            };
        } else {
            setMessages([]);
            setActiveChannelMembers([]);
        }
    }, [activeChannel]);

    const fetchChannelMembers = async (channel) => {
        if (!channel.is_private) {
            // Public channels include all members passed in
            setActiveChannelMembers(members);
            return;
        }
        try {
            const { data, error } = await supabase
                .from('chat_channel_members')
                .select('user_id')
                .eq('channel_id', channel.id);
            if (error) throw error;
            const userIds = new Set(data.map(d => d.user_id));
            const channelUsers = members.filter(m => userIds.has(m.id || m.user_id));
            setActiveChannelMembers(channelUsers);
        } catch (error) {
            console.error('Error fetching channel members:', error);
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchChannels = async () => {
        try {
            let query = supabase.from('chat_channels').select('*');
            if (projectId) query = query.eq('project_id', projectId);
            if (departmentId) query = query.eq('department_id', departmentId);

            const { data, error } = await query;
            if (error) throw error;
            
            // Note: In a real app, you'd also filter by `chat_channel_members` for private channels
            setChannels(data || []);
            if (data?.length > 0 && !activeChannel) {
                setActiveChannel(data[0]);
            }
            setLoading(false);
        } catch (error) {
            console.error('Error fetching channels:', error);
            // Fallback for mock db if tables don't exist
            setLoading(false);
        }
    };

    const fetchMessages = async (channelId) => {
        try {
            const { data, error } = await supabase
                .from('messages')
                .select(`
                    *,
                    users ( id, name, email ),
                    message_reactions ( id, user_id, emoji ),
                    message_attachments ( id, file_url, file_type, file_name ),
                    parent_message:parent_message_id ( id, content, users(name) )
                `)
                .eq('channel_id', channelId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setMessages(data || []);
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    };

    const subscribeToMessages = (channelId) => {
        try {
            const channel = supabase
                .channel(`messages:${channelId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'messages',
                        filter: `channel_id=eq.${channelId}`
                    },
                    (payload) => {
                        fetchMessages(channelId); // Re-fetch to get relations easily
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'message_reactions'
                    },
                    (payload) => {
                        fetchMessages(channelId);
                    }
                )
                .subscribe();
            
            return () => {
                supabase.removeChannel(channel);
            };
        } catch (error) {
            console.error('Realtime subscription error:', error);
            return null;
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() && attachments.length === 0) return;
        if (!activeChannel) return;

        const content = newMessage;
        const parent_id = replyingTo?.id || null;
        const currentAttachments = [...attachments];

        setNewMessage('');
        setReplyingTo(null);
        setAttachments([]);

        try {
            // 1. Insert message
            const { data: msgData, error: msgError } = await supabase
                .from('messages')
                .insert({
                    channel_id: activeChannel.id,
                    user_id: currentUserId,
                    content,
                    parent_message_id: parent_id
                })
                .select()
                .single();

            if (msgError) throw msgError;

            // 2. Insert attachments
            if (currentAttachments.length > 0) {
                const attInserts = currentAttachments.map(att => ({
                    message_id: msgData.id,
                    file_url: att.url,
                    file_name: att.name,
                    file_type: att.type
                }));
                
                await supabase.from('message_attachments').insert(attInserts);
            }

            // Manually update UI if realtime is mocked
            fetchMessages(activeChannel.id);

        } catch (error) {
            console.error('Error sending message:', error);
        }
    };

    const handleFileSelect = (e) => {
        setFileError('');
        const files = Array.from(e.target.files);
        
        const MAX_SIZE_MB = 5;
        const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'];
        
        const validFiles = [];
        for (const file of files) {
            if (!ALLOWED_TYPES.includes(file.type)) {
                setFileError(`Invalid file type: ${file.name}. Only images, PDFs, and text files are allowed.`);
                return;
            }
            if (file.size > MAX_SIZE_MB * 1024 * 1024) {
                setFileError(`File too large: ${file.name}. Maximum size is ${MAX_SIZE_MB}MB.`);
                return;
            }
            validFiles.push(file);
        }

        const newAtts = validFiles.map(file => ({
            file,
            name: file.name,
            type: file.type,
            // For mock demo purposes, create local object URL
            url: URL.createObjectURL(file) 
        }));
        setAttachments(prev => [...prev, ...newAtts]);
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const createChannel = async () => {
        if (!newChannelName.trim()) return;
        setCreateError('');
        try {
            const { data, error } = await supabase
                .from('chat_channels')
                .insert({
                    name: newChannelName,
                    project_id: projectId || null,
                    department_id: departmentId || null,
                    is_private: isPrivate
                })
                .select()
                .single();

            if (error) throw error;

            // Add members if private
            if (isPrivate && selectedMembers.length > 0) {
                const memberInserts = [
                    { channel_id: data.id, user_id: currentUserId }, // Add self
                    ...selectedMembers.map(uid => ({ channel_id: data.id, user_id: uid }))
                ];
                await supabase.from('chat_channel_members').insert(memberInserts);
            }

            setChannels(prev => [...prev, data]);
            setActiveChannel(data);
            setShowCreateModal(false);
            setNewChannelName('');
            setIsPrivate(false);
            setSelectedMembers([]);
        } catch (error) {
            console.error('Error creating channel:', error);
            setCreateError(error.message || 'An unknown error occurred');
        }
    };

    const handleAddMembersToChannel = async () => {
        if (!activeChannel || !activeChannel.is_private || newMembersToAdd.length === 0) return;
        try {
            const memberInserts = newMembersToAdd.map(uid => ({
                channel_id: activeChannel.id,
                user_id: uid
            }));
            await supabase.from('chat_channel_members').insert(memberInserts);
            
            // Refresh members list
            fetchChannelMembers(activeChannel);
            setShowAddMemberModal(false);
            setNewMembersToAdd([]);
        } catch (error) {
            console.error('Error adding members:', error);
            alert('Failed to add members: ' + error.message);
        }
    };

    const handleRenameChannel = async () => {
        if (!activeChannel || !editChannelName.trim()) return;
        try {
            const { error } = await supabase
                .from('chat_channels')
                .update({ name: editChannelName })
                .eq('id', activeChannel.id);
            if (error) throw error;
            
            // Update local state
            setChannels(prev => prev.map(c => c.id === activeChannel.id ? { ...c, name: editChannelName } : c));
            setActiveChannel(prev => ({ ...prev, name: editChannelName }));
            setShowSettingsModal(false);
        } catch (error) {
            console.error('Error renaming channel:', error);
            alert('Failed to rename channel: ' + error.message);
        }
    };

    const handleLeaveChannel = async () => {
        if (!activeChannel || !activeChannel.is_private) return;
        if (!window.confirm("Are you sure you want to leave this private group?")) return;
        try {
            const { error } = await supabase
                .from('chat_channel_members')
                .delete()
                .eq('channel_id', activeChannel.id)
                .eq('user_id', currentUserId);
            if (error) throw error;

            setChannels(prev => prev.filter(c => c.id !== activeChannel.id));
            setActiveChannel(null);
            setShowSettingsModal(false);
        } catch (error) {
            console.error('Error leaving channel:', error);
            alert('Failed to leave channel: ' + error.message);
        }
    };

    const handleDeleteChannel = async () => {
        if (!activeChannel) return;
        if (!window.confirm("Are you sure you want to completely DELETE this channel and all its messages? This cannot be undone.")) return;
        try {
            const { error } = await supabase
                .from('chat_channels')
                .delete()
                .eq('id', activeChannel.id);
            if (error) throw error;

            setChannels(prev => prev.filter(c => c.id !== activeChannel.id));
            setActiveChannel(null);
            setShowSettingsModal(false);
        } catch (error) {
            console.error('Error deleting channel:', error);
            alert('Failed to delete channel: ' + error.message);
        }
    };

    if (loading) {
        return <div className="h-full flex items-center justify-center text-white/50">Loading messages...</div>;
    }

    return (
        <div className={`flex ${fabMode ? 'h-full bg-transparent' : 'h-[calc(100vh-140px)] bg-[#191c21] rounded-2xl overflow-hidden border border-white/5'}`}>
            {/* Sidebar: Channels (Hidden in FAB Mode) */}
            {!fabMode && (
                <div className="w-64 bg-[#1e2126] border-r border-white/5 flex flex-col">
                    <div className="p-4 border-b border-white/5 flex items-center justify-between">
                        <h3 className="font-semibold text-white/90">Channels</h3>
                        <button 
                            onClick={() => setShowCreateModal(true)}
                            className="text-white/50 hover:text-white transition-colors p-1"
                        >
                            <span className="material-symbols-outlined text-[20px]">add</span>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {channels.length === 0 && (
                            <div className="text-sm text-white/40 p-2 text-center mt-4">
                                No channels yet. Create one!
                            </div>
                        )}
                        {channels.map(channel => (
                            <button
                                key={channel.id}
                                onClick={() => setActiveChannel(channel)}
                                className={`w-full flex items-center gap-2 p-2 rounded-lg mb-1 text-sm transition-colors ${
                                    activeChannel?.id === channel.id 
                                        ? 'bg-[var(--primary-color)]/20 text-[var(--primary-color)] font-medium' 
                                        : 'text-white/70 hover:bg-white/5'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">
                                    {channel.is_private ? 'lock' : 'tag'}
                                </span>
                                <span className="truncate">{channel.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col relative">
                {activeChannel ? (
                    <>
                        {/* Chat Header */}
                        <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#1e2126]">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-white/50">
                                    {activeChannel.is_private ? 'lock' : 'tag'}
                                </span>
                                <h2 className="font-semibold text-white/90">{activeChannel.name}</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setShowMembersModal(true)}
                                    className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5"
                                >
                                    <span className="material-symbols-outlined text-[18px]">group</span>
                                    <span>{activeChannelMembers.length}</span>
                                </button>
                                <button 
                                    onClick={() => {
                                        setEditChannelName(activeChannel.name);
                                        setShowSettingsModal(true);
                                    }}
                                    className="text-white/50 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5"
                                >
                                    <span className="material-symbols-outlined text-[20px]">settings</span>
                                </button>
                            </div>
                        </div>

                        {/* Messages List */}
                        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                            {messages.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-white/40 space-y-4">
                                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-3xl">chat</span>
                                    </div>
                                    <p>No messages yet. Start the conversation!</p>
                                </div>
                            )}
                            {messages.map(msg => (
                                <ChatMessage 
                                    key={msg.id} 
                                    message={msg} 
                                    currentUserId={currentUserId}
                                    onReply={setReplyingTo}
                                />
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-[#1e2126] border-t border-white/5">
                            {/* Reply Indicator */}
                            {replyingTo && (
                                <div className="flex items-center justify-between bg-black/20 p-2 rounded-t-lg border-l-2 border-[var(--primary-color)] mb-[-1px]">
                                    <div className="text-xs text-white/70">
                                        Replying to <span className="font-semibold">{replyingTo.users?.name || 'User'}</span>: 
                                        <span className="ml-1 opacity-70 truncate inline-block max-w-[200px] align-bottom">
                                            {replyingTo.content}
                                        </span>
                                    </div>
                                    <button onClick={() => setReplyingTo(null)} className="text-white/50 hover:text-white">
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                </div>
                            )}

                            {/* File Error Indicator */}
                            {fileError && (
                                <div className="flex items-center justify-between bg-red-900/30 p-2 rounded-t-lg border-l-2 border-red-500 mb-[-1px]">
                                    <div className="text-xs text-red-200">{fileError}</div>
                                    <button onClick={() => setFileError('')} className="text-red-300 hover:text-red-100">
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                </div>
                            )}

                            {/* Attachments Indicator */}
                            {attachments.length > 0 && (
                                <div className="flex gap-2 mb-2 p-2 bg-black/20 rounded-lg flex-wrap">
                                    {attachments.map((att, i) => (
                                        <div key={i} className="flex items-center gap-1 bg-white/10 p-1 px-2 rounded-md text-xs">
                                            <span className="truncate max-w-[100px]">{att.name}</span>
                                            <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-error">
                                                <span className="material-symbols-outlined text-[14px]">close</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <form onSubmit={handleSendMessage} className="flex gap-2">
                                <button 
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-3 rounded-xl bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined">attach_file</span>
                                </button>
                                <input 
                                    type="file" 
                                    multiple
                                    accept="image/jpeg, image/png, image/gif, application/pdf, text/plain"
                                    className="hidden" 
                                    ref={fileInputRef}
                                    onChange={handleFileSelect}
                                />
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder={`Message ${activeChannel.name}...`}
                                    className={`flex-1 bg-white/5 border border-white/10 rounded-xl px-4 text-white placeholder-white/30 focus:outline-none focus:border-[var(--primary-color)] transition-colors ${replyingTo ? 'rounded-tl-none' : ''}`}
                                />
                                <button 
                                    type="submit"
                                    disabled={!newMessage.trim() && attachments.length === 0}
                                    className="p-3 rounded-xl bg-[var(--primary-color)] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 transition-all flex items-center justify-center"
                                >
                                    <span className="material-symbols-outlined text-[20px] ml-1">send</span>
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="h-full flex items-center justify-center text-white/50">
                        Select or create a channel to start messaging
                    </div>
                )}

                {/* Create Channel Modal Overlay */}
                {showCreateModal && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="bg-[#1e2126] border border-white/10 rounded-2xl p-6 w-[400px] max-w-[90%] shadow-2xl">
                            <h3 className="text-lg font-semibold text-white/90 mb-4">Create Channel</h3>
                            
                            {createError && (
                                <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-xl text-red-200 text-sm">
                                    {createError}
                                </div>
                            )}

                            <label className="block text-sm text-white/70 mb-1">Channel Name</label>
                            <input 
                                type="text"
                                value={newChannelName}
                                onChange={(e) => setNewChannelName(e.target.value)}
                                placeholder="e.g. general, design-team"
                                className="w-full bg-[#141518] border border-white/10 rounded-xl px-4 py-2 text-white placeholder-white/20 focus:outline-none focus:border-[var(--primary-color)] mb-4"
                            />

                            <label className="flex items-center gap-2 text-sm text-white/70 mb-4 cursor-pointer">
                                <input 
                                    type="checkbox"
                                    checked={isPrivate}
                                    onChange={(e) => setIsPrivate(e.target.checked)}
                                    className="accent-[var(--primary-color)] w-4 h-4 rounded"
                                />
                                Private Channel (Custom Group)
                            </label>

                            {isPrivate && members.length > 0 && (
                                <div className="mb-4">
                                    <label className="block text-sm text-white/70 mb-2">Select Members</label>
                                    <div className="max-h-40 overflow-y-auto space-y-1 bg-[#141518] border border-white/5 rounded-xl p-2">
                                        {members.filter(m => (m.id || m.user_id) !== currentUserId).map(member => {
                                            const memberId = member.id || member.user_id;
                                            return (
                                            <label key={memberId} className="flex items-center gap-2 text-sm text-white/80 p-1 hover:bg-white/5 rounded cursor-pointer">
                                                <input 
                                                    type="checkbox"
                                                    checked={selectedMembers.includes(memberId)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedMembers([...selectedMembers, memberId]);
                                                        else setSelectedMembers(selectedMembers.filter(id => id !== memberId));
                                                    }}
                                                    className="accent-[var(--primary-color)] w-3 h-3 rounded"
                                                />
                                                {member.name || member.email || 'Unknown User'}
                                            </label>
                                        )})}
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-2 mt-6">
                                <button 
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-4 py-2 rounded-xl text-white/70 hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={createChannel}
                                    disabled={!newChannelName.trim()}
                                    className="px-4 py-2 rounded-xl bg-[var(--primary-color)] text-white disabled:opacity-50 transition-colors"
                                >
                                    Create
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* View Members Modal */}
                {showMembersModal && activeChannel && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="bg-[#1e2126] border border-white/10 rounded-2xl p-6 w-[400px] max-w-[90%] shadow-2xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-white/90">
                                    Members in #{activeChannel.name}
                                </h3>
                                <button 
                                    onClick={() => setShowMembersModal(false)}
                                    className="text-white/50 hover:text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            
                            {activeChannel.is_private && (
                                <button 
                                    onClick={() => {
                                        setShowMembersModal(false);
                                        setShowAddMemberModal(true);
                                    }}
                                    className="w-full flex items-center justify-center gap-2 py-2 px-4 mb-4 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[18px]">person_add</span>
                                    Add New Members
                                </button>
                            )}
                            
                            <div className="max-h-60 overflow-y-auto space-y-2 bg-[#141518] border border-white/5 rounded-xl p-3">
                                {activeChannelMembers.length === 0 ? (
                                    <div className="text-sm text-white/50 text-center py-4">No members found.</div>
                                ) : (
                                    activeChannelMembers.map(member => (
                                        <div key={member.id || member.user_id} className="flex items-center gap-3 text-sm text-white/90 p-2 hover:bg-white/5 rounded-lg transition-colors">
                                            <div className="w-8 h-8 rounded-full bg-[var(--primary-color)]/20 text-[var(--primary-color)] flex items-center justify-center font-bold">
                                                {(member.name || member.email || '?').charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{member.name || 'Unknown User'}</span>
                                                <span className="text-xs text-white/50">{member.email || ''}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Add Member to Private Channel Modal */}
                {showAddMemberModal && activeChannel && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="bg-[#1e2126] border border-white/10 rounded-2xl p-6 w-[400px] max-w-[90%] shadow-2xl">
                            <h3 className="text-lg font-semibold text-white/90 mb-4">Add Members</h3>
                            
                            <div className="max-h-40 overflow-y-auto space-y-1 bg-[#141518] border border-white/5 rounded-xl p-2 mb-6">
                                {members
                                    .filter(m => {
                                        const uid = m.id || m.user_id;
                                        // Filter out people already in the channel
                                        return !activeChannelMembers.some(acm => (acm.id || acm.user_id) === uid);
                                    })
                                    .map(member => {
                                        const memberId = member.id || member.user_id;
                                        return (
                                            <label key={memberId} className="flex items-center gap-2 text-sm text-white/80 p-1 hover:bg-white/5 rounded cursor-pointer">
                                                <input 
                                                    type="checkbox"
                                                    checked={newMembersToAdd.includes(memberId)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setNewMembersToAdd([...newMembersToAdd, memberId]);
                                                        else setNewMembersToAdd(newMembersToAdd.filter(id => id !== memberId));
                                                    }}
                                                    className="accent-[var(--primary-color)] w-3 h-3 rounded"
                                                />
                                                {member.name || member.email || 'Unknown User'}
                                            </label>
                                        );
                                })}
                            </div>

                            <div className="flex justify-end gap-2">
                                <button 
                                    onClick={() => {
                                        setShowAddMemberModal(false);
                                        setNewMembersToAdd([]);
                                    }}
                                    className="px-4 py-2 rounded-xl text-white/70 hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleAddMembersToChannel}
                                    disabled={newMembersToAdd.length === 0}
                                    className="px-4 py-2 rounded-xl bg-[var(--primary-color)] text-white disabled:opacity-50 transition-colors"
                                >
                                    Add Selected
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Channel Settings Modal */}
                {showSettingsModal && activeChannel && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="bg-[#1e2126] border border-white/10 rounded-2xl p-6 w-[400px] max-w-[90%] shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-semibold text-white/90">Channel Settings</h3>
                                <button onClick={() => setShowSettingsModal(false)} className="text-white/50 hover:text-white">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm text-white/70 mb-2">Rename Channel</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text"
                                            value={editChannelName}
                                            onChange={(e) => setEditChannelName(e.target.value)}
                                            className="flex-1 bg-[#141518] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[var(--primary-color)]"
                                        />
                                        <button 
                                            onClick={handleRenameChannel}
                                            disabled={!editChannelName.trim() || editChannelName === activeChannel.name}
                                            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors disabled:opacity-50"
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-white/10 space-y-3">
                                    {activeChannel.is_private && (
                                        <button 
                                            onClick={handleLeaveChannel}
                                            className="w-full flex items-center justify-between p-3 rounded-xl bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors text-sm font-medium"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-[18px]">logout</span>
                                                Leave Private Group
                                            </div>
                                        </button>
                                    )}
                                    <button 
                                        onClick={handleDeleteChannel}
                                        className="w-full flex items-center justify-between p-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm font-medium"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                                            Delete Channel & History
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
