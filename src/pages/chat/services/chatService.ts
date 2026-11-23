import { supabase } from '@/lib/supabase';
import type { UserColleague, Conversation, ChatMessage, ChatAttachment, Meeting, CallSession, CallAuditItem } from '../types';
import { API_BASE } from '@/retail/api';

const STORAGE_KEY_PREFIX = 'argus_bi_chat_';

/**
 * Sends one broadcast to a realtime topic. When this browser is not already listening on that topic, the temporary channel
 * is removed again afterwards (it is only used to send).
 */
async function sendToTopic(topic: string, event: string, payload: unknown): Promise<void> {
  const existed = supabase.getChannels().some((c) => c.topic === `realtime:${topic}`);
  const ch = supabase.channel(topic);
  try {
    await ch.send({ type: 'broadcast', event, payload });
  } catch (e) {
    console.warn(`[BI Chat] ${event} on ${topic} failed:`, e);
  } finally {
    if (!existed) void supabase.removeChannel(ch);
  }
}

/** App-wide call channels: the call ring listener (CallHost) is mounted on every page and listens here. */
export const callTopicForUser = (userId: string) => `user_calls_${userId}`;
export const callTopicForCompany = (companyId: string) => `company_calls_${companyId}`;

// Safe localStorage cache helper
function getCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(data));
  } catch {
    /* ignore storage quota */
  }
}

export const chatService = {
  /**
   * Fetches all colleagues belonging to the given company from public.company_users.
   */
  async getCompanyColleagues(companyId: string, currentUserId: string): Promise<UserColleague[]> {
    try {
      // 1. Try server-side endpoint first (bypasses RLS with SUPABASE_SECRET_KEY, accurately returning all company colleagues)
      try {
        const res = await fetch(`${API_BASE}/api/bi-chat/colleagues?companyId=${encodeURIComponent(companyId || '')}`);
        if (res.ok) {
          const json = await res.json();
          if (json && Array.isArray(json.data) && json.data.length > 0) {
            const mapped: UserColleague[] = json.data.map((u: any) => ({
              id: u.id,
              full_name: u.full_name || u.email?.split('@')[0] || 'Colleague',
              email: u.email,
              role: u.role,
              status: u.status || 'Active',
              mobile: u.mobile || '',
              designation:
                u.role === 'SUPER_ADMIN'
                  ? 'Super Administrator'
                  : u.role === 'COMPANY_ADMIN'
                  ? 'Company Administrator'
                  : u.role === 'OPERATOR'
                  ? 'CNC Operator'
                  : 'Staff',
              last_seen: u.last_login_at || u.created_at,
              is_online: u.id === currentUserId || Math.random() > 0.4,
            }));
            setCache(`colleagues_${companyId}`, mapped);
            return mapped;
          }
        }
      } catch (apiErr) {
        console.warn('API /api/bi-chat/colleagues fetch failed, falling back to Supabase client:', apiErr);
      }

      let query = supabase
        .from('company_users')
        .select('id, full_name, email, role, status, mobile, company_id, last_login_at, created_at')
        .order('full_name', { ascending: true });

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      let { data, error } = await query;
      if (error) throw error;

      // If companyId filter yielded 0 rows, fallback to querying all active company users
      if ((!data || data.length === 0) && companyId) {
        const fallbackRes = await supabase
          .from('company_users')
          .select('id, full_name, email, role, status, mobile, company_id, last_login_at, created_at')
          .order('full_name', { ascending: true });
        if (fallbackRes.data && fallbackRes.data.length > 0) {
          data = fallbackRes.data;
        }
      }

      const activeUsers = (data || []).filter((u: any) => u.status !== 'Inactive');

      if (activeUsers.length > 0) {
        const mapped = activeUsers.map((u: any) => ({
          id: u.id,
          full_name: u.full_name || u.email?.split('@')[0] || 'Colleague',
          email: u.email,
          role: u.role,
          status: u.status || 'Active',
          mobile: u.mobile || '',
          designation:
            u.role === 'SUPER_ADMIN'
              ? 'Super Administrator'
              : u.role === 'COMPANY_ADMIN'
              ? 'Company Administrator'
              : u.role === 'OPERATOR'
              ? 'CNC Operator'
              : 'CNC Operations',
          last_seen: u.last_login_at || u.created_at,
          is_online: u.id === currentUserId || Math.random() > 0.4,
        }));
        setCache(`colleagues_${companyId}`, mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('Could not query company_users (using fallback):', err);
    }

    const cached = getCache<UserColleague[]>(`colleagues_${companyId}`, []);
    if (cached && cached.length > 0) return cached;

    return [
      {
        id: 'colleague_super_admin',
        full_name: 'Janani Mohan',
        email: 'jananimohan004@gmail.com',
        role: 'SUPER_ADMIN',
        status: 'Active',
        mobile: '+91 98765 43210',
        designation: 'Super Administrator',
        last_seen: new Date().toISOString(),
        is_online: true,
      },
      {
        id: 'colleague_prod_lead',
        full_name: 'Rajesh Kumar',
        email: 'rajesh.cnc@argus.com',
        role: 'COMPANY_ADMIN',
        status: 'Active',
        mobile: '+91 94433 11223',
        designation: 'Production Head & CNC Lead',
        last_seen: new Date(Date.now() - 5 * 60000).toISOString(),
        is_online: true,
      },
      {
        id: 'colleague_eng_manager',
        full_name: 'Karthik Subramanian',
        email: 'karthik.eng@argus.com',
        role: 'USER',
        status: 'Active',
        mobile: '+91 91234 56789',
        designation: 'Lead Engineering & CAD/CAM',
        last_seen: new Date(Date.now() - 15 * 60000).toISOString(),
        is_online: false,
      },
      {
        id: 'colleague_quality_qc',
        full_name: 'Priya Sundaram',
        email: 'priya.qc@argus.com',
        role: 'USER',
        status: 'Active',
        mobile: '+91 98844 55667',
        designation: 'Quality Control & QA Inspector',
        last_seen: new Date(Date.now() - 45 * 60000).toISOString(),
        is_online: true,
      },
      {
        id: 'colleague_procurement',
        full_name: 'Venkatesh S',
        email: 'venkatesh.procure@argus.com',
        role: 'USER',
        status: 'Active',
        mobile: '+91 97722 33445',
        designation: 'Purchase & Inventory Manager',
        last_seen: new Date(Date.now() - 120 * 60000).toISOString(),
        is_online: false,
      },
    ];
  },

  /**
   * Fetches all conversations for the user in the company.
   */
  async getConversations(companyId: string, currentUserId: string): Promise<Conversation[]> {
    try {
      if (!currentUserId) return [];

      // 1. Find conversation IDs that currentUserId is actually a participant of
      const { data: userParts, error: partErr } = await supabase
        .from('bi_chat_participants')
        .select('conversation_id')
        .eq('user_id', currentUserId);

      if (partErr) throw partErr;
      const myConvIds = (userParts || []).map((p: any) => p.conversation_id);
      if (myConvIds.length === 0) return [];

      // 2. Query only conversations that currentUserId belongs to!
      const { data: convs, error } = await supabase
        .from('bi_chat_conversations')
        .select('*')
        .eq('company_id', companyId)
        .in('id', myConvIds)
        .order('last_message_at', { ascending: false });

      if (error) throw error;
      if (!convs || convs.length === 0) return [];

      // 2. Fetch participants for these conversations
      const convIds = convs.map((c: any) => c.id);
      const { data: parts } = await supabase
        .from('bi_chat_participants')
        .select('id, conversation_id, user_id, role, last_read_at, is_muted')
        .in('conversation_id', convIds);

      // 3. User details map
      const userIds = Array.from(new Set((parts || []).map((p: any) => p.user_id)));
      let userMap = new Map<string, any>();
      if (userIds.length > 0) {
        // Try server-side lookup first (bypasses RLS to ensure colleague names display properly)
        try {
          const res = await fetch(`${API_BASE}/api/bi-chat/users-by-ids?ids=${encodeURIComponent(userIds.join(','))}`);
          if (res.ok) {
            const json = await res.json();
            if (json && Array.isArray(json.data) && json.data.length > 0) {
              userMap = new Map(json.data.map((u: any) => [u.id, u]));
            }
          }
        } catch (e) {
          console.warn('Could not fetch users by ids from api:', e);
        }

        if (userMap.size < userIds.length) {
          const { data: users } = await supabase
            .from('company_users')
            .select('id, full_name, email, role, status, mobile')
            .in('id', userIds);
          (users || []).forEach((u: any) => {
            if (!userMap.has(u.id)) userMap.set(u.id, u);
          });
        }

        // Also check cached colleagues for any remaining missing participant details
        const cachedColleagues = getCache<UserColleague[]>(`colleagues_${companyId}`, []);
        for (const uid of userIds) {
          if (!userMap.has(uid)) {
            const found = cachedColleagues.find(c => c.id === uid);
            if (found) {
              userMap.set(uid, {
                id: found.id,
                full_name: found.full_name,
                email: found.email,
                role: found.role,
                status: found.status,
                mobile: found.mobile,
              });
            }
          }
        }
      }

      // 4. Map into Conversation objects
      const result: Conversation[] = convs.map((c: any) => {
        const convParts = (parts || [])
          .filter((p: any) => p.conversation_id === c.id)
          .map((p: any) => {
            const u = userMap.get(p.user_id);
            return {
              id: p.id,
              conversation_id: p.conversation_id,
              user_id: p.user_id,
              role: p.role,
              last_read_at: p.last_read_at,
              is_muted: !!p.is_muted,
              user: u ? {
                id: u.id,
                full_name: u.full_name || u.email.split('@')[0],
                email: u.email,
                role: u.role,
                status: u.status,
                mobile: u.mobile,
              } : undefined,
            };
          });

        return {
          id: c.id,
          company_id: c.company_id,
          type: c.type,
          title: c.title,
          description: c.description,
          avatar_url: c.avatar_url,
          created_by: c.created_by,
          last_message_at: c.last_message_at,
          last_message_preview: c.last_message_preview,
          pinned_by: Array.isArray(c.pinned_by) ? c.pinned_by : [],
          participants: convParts,
        };
      });

      setCache(`conversations_${companyId}_${currentUserId}`, result);
      return result;
    } catch (err) {
      console.warn('Falling back to cached conversations:', err);
      return getCache<Conversation[]>(`conversations_${companyId}_${currentUserId}`, []);
    }
  },

  /**
   * Starts or finds an existing direct conversation between two company colleagues.
   */
  async getOrCreateDirectConversation(companyId: string, currentUserId: string, colleagueId: string): Promise<Conversation> {
    try {
      // Find existing direct conversation with colleague
      const { data: myConvs } = await supabase
        .from('bi_chat_participants')
        .select('conversation_id')
        .eq('user_id', currentUserId);

      const convIds = (myConvs || []).map((c: any) => c.conversation_id);

      if (convIds.length > 0) {
        const { data: matches } = await supabase
          .from('bi_chat_participants')
          .select('conversation_id, bi_chat_conversations!inner(id, type, company_id)')
          .in('conversation_id', convIds)
          .eq('user_id', colleagueId)
          .eq('bi_chat_conversations.type', 'direct')
          .eq('bi_chat_conversations.company_id', companyId);

        if (matches && matches.length > 0) {
          const list = await this.getConversations(companyId, currentUserId);
          const found = list.find((c) => c.id === matches[0].conversation_id);
          if (found) return found;
        }
      }

      // Create new direct conversation
      const { data: newConv, error: convErr } = await supabase
        .from('bi_chat_conversations')
        .insert({
          company_id: companyId,
          type: 'direct',
          created_by: currentUserId,
          last_message_preview: 'Conversation started',
        })
        .select()
        .single();

      if (convErr) throw convErr;

      // Add both participants
      await supabase.from('bi_chat_participants').insert([
        { conversation_id: newConv.id, user_id: currentUserId, role: 'admin' },
        { conversation_id: newConv.id, user_id: colleagueId, role: 'member' },
      ]);

      const list = await this.getConversations(companyId, currentUserId);
      return list.find((c) => c.id === newConv.id) || {
        id: newConv.id,
        company_id: companyId,
        type: 'direct',
        last_message_at: new Date().toISOString(),
        last_message_preview: 'Conversation started',
        pinned_by: [],
        participants: [],
      };
    } catch (err) {
      console.warn('Using local fallback for direct conversation:', err);
      const existing = getCache<Conversation[]>(`conversations_${companyId}_${currentUserId}`, []);
      const match = existing.find((c) => c.type === 'direct' && c.participants.some((p) => p.user_id === colleagueId));
      if (match) return match;

      const newConv: Conversation = {
        id: 'conv-' + Date.now(),
        company_id: companyId,
        type: 'direct',
        last_message_at: new Date().toISOString(),
        last_message_preview: 'Conversation started',
        pinned_by: [],
        participants: [
          { id: 'p1', conversation_id: 'conv-' + Date.now(), user_id: currentUserId, role: 'admin', last_read_at: new Date().toISOString(), is_muted: false },
          { id: 'p2', conversation_id: 'conv-' + Date.now(), user_id: colleagueId, role: 'member', last_read_at: new Date().toISOString(), is_muted: false },
        ],
      };
      setCache(`conversations_${companyId}_${currentUserId}`, [newConv, ...existing]);
      return newConv;
    }
  },

  /**
   * Creates a new group conversation with multiple company employees.
   */
  async createGroupConversation(
    companyId: string,
    currentUserId: string,
    title: string,
    description: string,
    memberUserIds: string[],
    avatarUrl?: string
  ): Promise<Conversation> {
    const allMembers = Array.from(new Set([currentUserId, ...memberUserIds]));

    try {
      const { data: newConv, error: convErr } = await supabase
        .from('bi_chat_conversations')
        .insert({
          company_id: companyId,
          type: 'group',
          title,
          description: description || null,
          avatar_url: avatarUrl || null,
          created_by: currentUserId,
          last_message_preview: 'Group created',
        })
        .select()
        .single();

      if (convErr) throw convErr;

      const participantRows = allMembers.map((uid) => ({
        conversation_id: newConv.id,
        user_id: uid,
        role: uid === currentUserId ? 'admin' : 'member',
      }));

      await supabase.from('bi_chat_participants').insert(participantRows);

      const list = await this.getConversations(companyId, currentUserId);
      return list.find((c) => c.id === newConv.id) || {
        id: newConv.id,
        company_id: companyId,
        type: 'group',
        title,
        description,
        avatar_url: avatarUrl,
        created_by: currentUserId,
        last_message_at: new Date().toISOString(),
        last_message_preview: 'Group created',
        pinned_by: [],
        participants: [],
      };
    } catch (err) {
      console.warn('Using local fallback for group creation:', err);
      const existing = getCache<Conversation[]>(`conversations_${companyId}_${currentUserId}`, []);
      const localGroup: Conversation = {
        id: 'group-' + Date.now(),
        company_id: companyId,
        type: 'group',
        title,
        description,
        avatar_url: avatarUrl,
        created_by: currentUserId,
        last_message_at: new Date().toISOString(),
        last_message_preview: 'Group created',
        pinned_by: [],
        participants: allMembers.map((uid) => ({
          id: 'gp-' + uid,
          conversation_id: 'group-' + Date.now(),
          user_id: uid,
          role: uid === currentUserId ? 'admin' : 'member',
          last_read_at: new Date().toISOString(),
          is_muted: false,
        })),
      };
      setCache(`conversations_${companyId}_${currentUserId}`, [localGroup, ...existing]);
      return localGroup;
    }
  },

  /**
   * Fetches messages for a conversation.
   */
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    try {
      const { data, error } = await supabase
        .from('bi_chat_messages')
        .select(`
          *,
          attachments:bi_chat_attachments(*)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const msgs: ChatMessage[] = (data || []).map((m: any) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        company_id: m.company_id,
        sender_id: m.sender_id,
        sender_name: m.metadata?.sender_name || '',
        content: m.content,
        type: m.type,
        reply_to_id: m.reply_to_id,
        reply_to: m.metadata?.reply_to,
        is_pinned: !!m.is_pinned,
        is_edited: !!m.is_edited,
        is_deleted: !!m.is_deleted,
        metadata: m.metadata || {},
        attachments: m.attachments || [],
        created_at: m.created_at,
        status: 'read',
      }));

      setCache(`messages_${conversationId}`, msgs);
      return msgs;
    } catch (err) {
      return getCache<ChatMessage[]>(`messages_${conversationId}`, []);
    }
  },

  /**
   * Sends a message with optional attachments or meeting metadata.
   */
  async sendMessage(params: {
    conversationId: string;
    companyId: string;
    senderId: string;
    senderName: string;
    content: string;
    type?: 'text' | 'image' | 'file' | 'meeting' | 'call_log' | 'system';
    replyTo?: { id: string; sender_name: string; content: string };
    attachments?: { file_name: string; file_type: string; file_size: number; file_url: string; folder_path?: string }[];
    metadata?: Record<string, any>;
  }): Promise<ChatMessage> {
    const type = params.type || (params.attachments && params.attachments.length > 0 ? (params.attachments[0].file_type.startsWith('image/') ? 'image' : 'file') : 'text');

    const meta = {
      ...(params.metadata || {}),
      sender_name: params.senderName,
      reply_to: params.replyTo,
    };

    let preview = params.content;
    if (type === 'image') preview = '📷 Photo';
    else if (type === 'file') preview = `📎 ${params.attachments?.[0]?.file_name || 'Attachment'}`;
    else if (type === 'meeting') preview = `📅 Meeting: ${params.metadata?.title || 'Invitation'}`;
    else if (type === 'call_log') preview = params.content;

    try {
      const { data: msg, error } = await supabase
        .from('bi_chat_messages')
        .insert({
          conversation_id: params.conversationId,
          company_id: params.companyId,
          sender_id: params.senderId,
          content: params.content,
          type,
          reply_to_id: params.replyTo?.id || null,
          metadata: meta,
        })
        .select()
        .single();

      if (error) throw error;

      // Insert attachments if any
      let createdAttachments: ChatAttachment[] = [];
      if (params.attachments && params.attachments.length > 0) {
        const attRows = params.attachments.map((a) => ({
          message_id: msg.id,
          conversation_id: params.conversationId,
          company_id: params.companyId,
          uploader_id: params.senderId,
          file_name: a.file_name,
          file_type: a.file_type,
          file_size: a.file_size,
          file_url: a.file_url,
          folder_path: a.folder_path || '/',
        }));
        const { data: attData } = await supabase.from('bi_chat_attachments').insert(attRows).select();
        createdAttachments = attData || [];
      }

      // Update conversation last message
      void supabase
        .from('bi_chat_conversations')
        .update({
          last_message_at: msg.created_at,
          last_message_preview: preview.slice(0, 80),
        })
        .eq('id', params.conversationId);

      const created: ChatMessage = {
        id: msg.id,
        conversation_id: msg.conversation_id,
        company_id: msg.company_id,
        sender_id: msg.sender_id,
        sender_name: params.senderName,
        content: msg.content,
        type: msg.type,
        reply_to_id: msg.reply_to_id,
        reply_to: params.replyTo,
        is_pinned: false,
        is_edited: false,
        is_deleted: false,
        metadata: meta,
        attachments: createdAttachments,
        created_at: msg.created_at,
        status: 'sent',
      };

      // Update cache
      const cached = getCache<ChatMessage[]>(`messages_${params.conversationId}`, []);
      setCache(`messages_${params.conversationId}`, [...cached, created]);

      // Broadcast message event to conversation channel
      void supabase.channel(`bi-chat-${params.conversationId}`).send({
        type: 'broadcast',
        event: 'new_message',
        payload: created,
      });

      return created;
    } catch (err) {
      console.warn('Falling back to local storage message:', err);
      const fallbackMsg: ChatMessage = {
        id: 'msg-' + Date.now(),
        conversation_id: params.conversationId,
        company_id: params.companyId,
        sender_id: params.senderId,
        sender_name: params.senderName,
        content: params.content,
        type,
        reply_to_id: params.replyTo?.id,
        reply_to: params.replyTo,
        is_pinned: false,
        is_edited: false,
        is_deleted: false,
        metadata: meta,
        attachments: (params.attachments || []).map((a, i) => ({
          id: 'att-' + Date.now() + '-' + i,
          message_id: 'msg-' + Date.now(),
          conversation_id: params.conversationId,
          company_id: params.companyId,
          uploader_id: params.senderId,
          file_name: a.file_name,
          file_type: a.file_type,
          file_size: a.file_size,
          file_url: a.file_url,
          folder_path: a.folder_path || '/',
          created_at: new Date().toISOString(),
        })),
        created_at: new Date().toISOString(),
        status: 'sent',
      };

      const cached = getCache<ChatMessage[]>(`messages_${params.conversationId}`, []);
      setCache(`messages_${params.conversationId}`, [...cached, fallbackMsg]);
      return fallbackMsg;
    }
  },

  /**
   * Edits a message content.
   */
  /**
   * Edits an existing message.
   */
  async editMessage(messageId: string, currentUserIdOrConvId: string, newContent: string): Promise<boolean> {
    try {
      await supabase
        .from('bi_chat_messages')
        .update({ content: newContent, is_edited: true, updated_at: new Date().toISOString() })
        .eq('id', messageId);
    } catch {
      /* ignore */
    }

    // Update in local event bus
    window.dispatchEvent(
      new CustomEvent('argus:chat-company-event', {
        detail: { type: 'MESSAGE_EDITED', messageId, newContent },
      })
    );
    return true;
  },

  /**
   * Deletes a message (soft delete).
   */
  async deleteMessage(messageId: string, currentUserIdOrConvId?: string): Promise<boolean> {
    try {
      await supabase
        .from('bi_chat_messages')
        .update({ is_deleted: true, content: 'This message was deleted', updated_at: new Date().toISOString() })
        .eq('id', messageId);
    } catch {
      /* ignore */
    }

    // Update in local event bus
    window.dispatchEvent(
      new CustomEvent('argus:chat-company-event', {
        detail: { type: 'MESSAGE_DELETED', messageId },
      })
    );
    return true;
  },

  /**
   * Toggles pinned status for a message.
   */
  async togglePinMessage(first: string, second: string, third?: boolean): Promise<boolean> {
    // Can be called as (convId, msgId, currentPin) or (msgId, convId, currentPin)
    const messageId = second && typeof third === 'boolean' ? second : first;
    const currentPin = typeof third === 'boolean' ? third : typeof second === 'boolean' ? second : false;
    const nextPin = !currentPin;

    try {
      await supabase
        .from('bi_chat_messages')
        .update({ is_pinned: nextPin })
        .eq('id', messageId);
    } catch {
      /* ignore */
    }

    return nextPin;
  },

  /**
   * Marks a conversation as read for the given user.
   */
  async markConversationAsRead(conversationId: string, userId: string) {
    if (!conversationId || !userId) return;
    try {
      await supabase
        .from('bi_chat_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);
    } catch {
      /* ignore */
    }
  },

  /**
   * Realtime subscription for messages in a conversation.
   */
  subscribeToConversation(
    conversationId: string,
    onMessage: (msg: ChatMessage) => void,
    onUpdate?: (msg: ChatMessage) => void
  ): () => void {
    if (!conversationId) return () => {};

    try {
      const channel = supabase
        .channel(`chat_conv_${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'bi_chat_messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload: any) => {
            if (payload?.new) {
              onMessage(payload.new as ChatMessage);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'bi_chat_messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload: any) => {
            if (payload?.new && onUpdate) {
              onUpdate(payload.new as ChatMessage);
            }
          }
        )
        .on('broadcast', { event: 'incoming_call' }, ({ payload }: any) => {
          if (payload && payload.id) {
            window.dispatchEvent(
              new CustomEvent('argus:chat-company-event', {
                detail: { type: 'INCOMING_CALL', call: payload },
              })
            );
          }
        })
        .on('broadcast', { event: 'cancel_call' }, ({ payload }: any) => {
          if (payload && payload.callId) {
            window.dispatchEvent(
              new CustomEvent('argus:chat-company-event', {
                detail: { type: 'CANCEL_CALL', callId: payload.callId },
              })
            );
          }
        })
        .on('broadcast', { event: 'accept_call' }, ({ payload }: any) => {
          if (payload && payload.callId) {
            window.dispatchEvent(
              new CustomEvent('argus:chat-call-accepted', {
                detail: payload,
              })
            );
          }
        })
        .subscribe();

      const localHandler = (e: Event) => {
        const d = (e as CustomEvent).detail;
        if (d && d.conversationId === conversationId && d.message) {
          onMessage(d.message);
        }
      };
      window.addEventListener('argus:chat-local-msg', localHandler);

      return () => {
        try {
          void supabase.removeChannel(channel);
        } catch {}
        window.removeEventListener('argus:chat-local-msg', localHandler);
      };
    } catch {
      return () => {};
    }
  },

  /**
   * Realtime subscription for company-level events (incoming calls, global message alerts).
   */
  /**
   * Broadcasts an incoming call across direct callee user channel, active conversation channel,
   * company channel, cross-tab BroadcastChannel, and window CustomEvent.
   */
  async broadcastIncomingCall(companyId: string, call: CallSession): Promise<void> {
    if (!call) return;

    const effCoId = companyId || call.company_id || '0255839c-a9b1-49a8-a9f6-e776fd7bdd00';

    // 1. Direct Callee User Channel (DIRECT to recipient, guarantees receipt regardless of company ID!)
    if (call.recipient_id && call.recipient_id !== 'all') {
      try {
        const userCh = supabase.channel(`user_events_${call.recipient_id}`);
        await userCh.send({
          type: 'broadcast',
          event: 'incoming_call',
          payload: call,
        });
      } catch (e) {
        console.warn('User-level incoming_call broadcast error:', e);
      }
    }

    // 1b. App-wide call channels (the callee hears the ring on any page, not only in BI Chat)
    if (call.recipient_id && call.recipient_id !== 'all') await sendToTopic(callTopicForUser(call.recipient_id), 'incoming_call', call);
    else if (effCoId) await sendToTopic(callTopicForCompany(effCoId), 'incoming_call', call);

    // 2. Active Conversation Channel (reaches peer if currently in the conversation)
    if (call.conversation_id) {
      try {
        const convCh = supabase.channel(`chat_conv_${call.conversation_id}`);
        await convCh.send({
          type: 'broadcast',
          event: 'incoming_call',
          payload: call,
        });
      } catch (e) {
        console.warn('Conversation-level incoming_call broadcast error:', e);
      }
    }

    // 3. Company-Level Broadcast
    if (effCoId) {
      try {
        const compCh = supabase.channel(`company_events_${effCoId}`);
        await compCh.send({
          type: 'broadcast',
          event: 'incoming_call',
          payload: call,
        });
      } catch (e) {
        console.warn('Company incoming_call broadcast error:', e);
      }
    }

    // 4. Cross-tab BroadcastChannel (instant zero-latency on same browser)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        if (call.recipient_id) {
          const bcUser = new BroadcastChannel(`user_events_${call.recipient_id}`);
          bcUser.postMessage({ type: 'incoming_call', payload: call });
          setTimeout(() => bcUser.close(), 1000);
        }
        if (effCoId) {
          const bcCo = new BroadcastChannel(`company_events_${effCoId}`);
          bcCo.postMessage({ type: 'incoming_call', payload: call });
          setTimeout(() => bcCo.close(), 1000);
        }
      } catch {}
    }

    // 5. Local Window Event (same tab)
    window.dispatchEvent(
      new CustomEvent('argus:chat-company-event', {
        detail: { type: 'INCOMING_CALL', call },
      })
    );
  },

  /**
   * Broadcasts a call cancellation (e.g. caller hung up before answer).
   */
  async broadcastCancelCall(companyId: string, callId: string, recipientId?: string): Promise<void> {
    if (!callId) return;

    const payload = { callId, recipient_id: recipientId };
    const effCoId = companyId || '0255839c-a9b1-49a8-a9f6-e776fd7bdd00';

    // 1. Direct Callee User Channel
    if (recipientId && recipientId !== 'all') {
      try {
        const userCh = supabase.channel(`user_events_${recipientId}`);
        await userCh.send({
          type: 'broadcast',
          event: 'cancel_call',
          payload,
        });
      } catch {}
    }

    // 1b. App-wide call channels
    if (recipientId && recipientId !== 'all') await sendToTopic(callTopicForUser(recipientId), 'cancel_call', payload);
    else if (effCoId) await sendToTopic(callTopicForCompany(effCoId), 'cancel_call', payload);

    // 2. Company Channel
    if (effCoId) {
      try {
        const compCh = supabase.channel(`company_events_${effCoId}`);
        await compCh.send({
          type: 'broadcast',
          event: 'cancel_call',
          payload,
        });
      } catch {}
    }

    // 3. Cross-tab BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        if (recipientId) {
          const bc = new BroadcastChannel(`user_events_${recipientId}`);
          bc.postMessage({ type: 'cancel_call', payload });
          setTimeout(() => bc.close(), 1000);
        }
      } catch {}
    }

    // 4. Local Window Event
    window.dispatchEvent(
      new CustomEvent('argus:chat-company-event', {
        detail: { type: 'CANCEL_CALL', callId },
      })
    );
  },

  /**
   * Broadcasts call acceptance when callee answers.
   */
  async broadcastAcceptCall(callerId: string, callId: string, companyId?: string, conversationId?: string): Promise<void> {
    if (!callId) return;

    const payload = { callId, callerId };
    const effCoId = companyId || '0255839c-a9b1-49a8-a9f6-e776fd7bdd00';

    // 1. Direct Caller User Channel
    if (callerId) {
      try {
        const userCh = supabase.channel(`user_events_${callerId}`);
        await userCh.send({
          type: 'broadcast',
          event: 'accept_call',
          payload,
        });
      } catch {}
    }

    // 2. Active Conversation Channel
    if (conversationId) {
      try {
        const convCh = supabase.channel(`chat_conv_${conversationId}`);
        await convCh.send({
          type: 'broadcast',
          event: 'accept_call',
          payload,
        });
      } catch {}
    }

    // 3. Company Channel
    if (effCoId) {
      try {
        const compCh = supabase.channel(`company_events_${effCoId}`);
        await compCh.send({
          type: 'broadcast',
          event: 'accept_call',
          payload,
        });
      } catch {}
    }

    // 4. Cross-tab BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        if (callerId) {
          const bc = new BroadcastChannel(`user_events_${callerId}`);
          bc.postMessage({ type: 'accept_call', payload });
          setTimeout(() => bc.close(), 1000);
        }
      } catch {}
    }

    // 5. Local Window Event
    window.dispatchEvent(
      new CustomEvent('argus:chat-call-accepted', {
        detail: payload,
      })
    );
  },

  /**
   * Realtime subscription for company-level events and personal direct incoming calls.
   * Runs independently of companyId to guarantee Super Admins and Staff always receive calls.
   */
  subscribeToCompanyEvents(
    companyId: string,
    currentUserId: string,
    onEvent: (event: {
      type: 'INCOMING_CALL' | 'CANCEL_CALL' | 'NEW_MESSAGE';
      call?: CallSession;
      callId?: string;
      message?: ChatMessage;
    }) => void
  ): () => void {
    if (!currentUserId) return () => {};

    const effCoId = companyId || '0255839c-a9b1-49a8-a9f6-e776fd7bdd00';

    try {
      const handledEvents = new Set<string>();

      const handleCall = (payload: any) => {
        if (!payload || !payload.id) return;
        const key = `call_${payload.id}_${payload.status}`;
        if (handledEvents.has(key)) return;
        handledEvents.add(key);
        setTimeout(() => handledEvents.delete(key), 8000);

        if (!payload.recipient_id || payload.recipient_id === currentUserId || payload.recipient_id === 'all') {
          onEvent({ type: 'INCOMING_CALL', call: payload });
        }
      };

      const handleCancel = (payload: any) => {
        if (!payload || !payload.callId) return;
        const key = `cancel_${payload.callId}`;
        if (handledEvents.has(key)) return;
        handledEvents.add(key);
        setTimeout(() => handledEvents.delete(key), 8000);

        if (!payload.recipient_id || payload.recipient_id === currentUserId || payload.recipient_id === 'all') {
          onEvent({ type: 'CANCEL_CALL', callId: payload.callId });
        }
      };

      // 1. Direct Personal User Channel (listens for calls targeted specifically to currentUserId)
      const userChannel = supabase
        .channel(`user_events_${currentUserId}`)
        .on('broadcast', { event: 'incoming_call' }, ({ payload }: any) => {
          handleCall(payload);
        })
        .on('broadcast', { event: 'cancel_call' }, ({ payload }: any) => {
          handleCancel(payload);
        })
        .on('broadcast', { event: 'accept_call' }, ({ payload }: any) => {
          if (payload && payload.callId) {
            window.dispatchEvent(new CustomEvent('argus:chat-call-accepted', { detail: payload }));
          }
        })
        .on('broadcast', { event: 'webrtc_sdp_offer' }, ({ payload }: any) => {
          window.dispatchEvent(new CustomEvent('argus:chat-webrtc-signal', { detail: { event: 'sdp_offer', payload } }));
        })
        .on('broadcast', { event: 'webrtc_sdp_answer' }, ({ payload }: any) => {
          window.dispatchEvent(new CustomEvent('argus:chat-webrtc-signal', { detail: { event: 'sdp_answer', payload } }));
        })
        .on('broadcast', { event: 'webrtc_ice_candidate' }, ({ payload }: any) => {
          window.dispatchEvent(new CustomEvent('argus:chat-webrtc-signal', { detail: { event: 'ice_candidate', payload } }));
        })
        .subscribe();

      // 2. Company-Level Realtime Channel
      const compChannel = supabase
        .channel(`company_events_${effCoId}`)
        .on('broadcast', { event: 'incoming_call' }, ({ payload }: any) => {
          handleCall(payload);
        })
        .on('broadcast', { event: 'cancel_call' }, ({ payload }: any) => {
          handleCancel(payload);
        })
        .on('broadcast', { event: 'accept_call' }, ({ payload }: any) => {
          if (payload && payload.callId) {
            window.dispatchEvent(new CustomEvent('argus:chat-call-accepted', { detail: payload }));
          }
        })
        .on('broadcast', { event: 'new_message' }, ({ payload }: any) => {
          if (payload && payload.sender_id !== currentUserId) {
            onEvent({ type: 'NEW_MESSAGE', message: payload });
          }
        })
        .subscribe();

      // 3. Cross-tab BroadcastChannels (same browser)
      let bcUser: BroadcastChannel | null = null;
      let bcCo: BroadcastChannel | null = null;
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          bcUser = new BroadcastChannel(`user_events_${currentUserId}`);
          bcUser.onmessage = (ev) => {
            const data = ev.data;
            if (data?.type === 'incoming_call') handleCall(data.payload);
            else if (data?.type === 'cancel_call') handleCancel(data.payload);
            else if (data?.type === 'accept_call' && data.payload?.callId) {
              window.dispatchEvent(new CustomEvent('argus:chat-call-accepted', { detail: data.payload }));
            }
          };

          bcCo = new BroadcastChannel(`company_events_${effCoId}`);
          bcCo.onmessage = (ev) => {
            const data = ev.data;
            if (data?.type === 'incoming_call') handleCall(data.payload);
            else if (data?.type === 'cancel_call') handleCancel(data.payload);
          };
        } catch {}
      }

      // 4. Local CustomEvent (same window)
      const localHandler = (e: Event) => {
        const d = (e as CustomEvent).detail;
        if (d?.type === 'INCOMING_CALL' && d.call) {
          handleCall(d.call);
        } else if (d?.type === 'CANCEL_CALL' && d.callId) {
          handleCancel({ callId: d.callId });
        } else if (d) {
          onEvent(d);
        }
      };
      window.addEventListener('argus:chat-company-event', localHandler);

      return () => {
        try { void supabase.removeChannel(userChannel); } catch {}
        try { void supabase.removeChannel(compChannel); } catch {}
        try { bcUser?.close(); } catch {}
        try { bcCo?.close(); } catch {}
        window.removeEventListener('argus:chat-company-event', localHandler);
      };
    } catch {
      return () => {};
    }
  },

  /**
   * Schedules a calendar meeting and posts an invitation card into the chat.
   */
  async scheduleMeeting(params: {
    companyId: string;
    conversationId: string;
    organizerId: string;
    organizerName: string;
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    meetingType: 'video' | 'voice' | 'in_person';
    locationOrLink?: string;
    participantUserIds: string[];
    reminderMinutes?: number[];
  }): Promise<Meeting> {
    const reminderMinutes = params.reminderMinutes || [15, 5, 0];
    const meetingId = 'meet-' + Date.now();

    const newMeeting: Meeting = {
      id: meetingId,
      company_id: params.companyId,
      conversation_id: params.conversationId,
      organizer_id: params.organizerId,
      organizer_name: params.organizerName,
      title: params.title,
      description: params.description,
      start_time: params.startTime,
      end_time: params.endTime,
      meeting_type: params.meetingType,
      location_or_link: params.locationOrLink || `https://meet.argus-cnc.internal/${meetingId}`,
      status: 'scheduled',
      reminder_minutes: reminderMinutes,
      participants: (() => {
        const cachedColleagues = getCache<UserColleague[]>(`colleagues_${params.companyId}`, []);
        return params.participantUserIds.map((uid) => {
          const found = cachedColleagues.find((c) => c.id === uid);
          return {
            user_id: uid,
            full_name: uid === params.organizerId ? params.organizerName : (found?.full_name || 'Colleague'),
            status: uid === params.organizerId ? 'accepted' : 'pending',
          };
        });
      })(),
      created_at: new Date().toISOString(),
    };

    try {
      const { data: dbMeet, error } = await supabase
        .from('bi_chat_meetings')
        .insert({
          company_id: params.companyId,
          conversation_id: params.conversationId,
          organizer_id: params.organizerId,
          title: params.title,
          description: params.description,
          start_time: params.startTime,
          end_time: params.endTime,
          meeting_type: params.meetingType,
          location_or_link: newMeeting.location_or_link,
          reminder_minutes: reminderMinutes,
        })
        .select()
        .single();

      if (!error && dbMeet) {
        newMeeting.id = dbMeet.id;
        const partRows = params.participantUserIds.map((uid) => ({
          meeting_id: dbMeet.id,
          user_id: uid,
          status: uid === params.organizerId ? 'accepted' : 'pending',
        }));
        await supabase.from('bi_chat_meeting_participants').insert(partRows);
      }
    } catch (err) {
      console.warn('Saving meeting locally:', err);
    }

    // Post meeting invitation message into chat thread
    await this.sendMessage({
      conversationId: params.conversationId,
      companyId: params.companyId,
      senderId: params.organizerId,
      senderName: params.organizerName,
      content: `Meeting Scheduled: ${params.title}`,
      type: 'meeting',
      metadata: {
        meeting: newMeeting,
      },
    });

    // Save to company meetings cache
    const existing = getCache<Meeting[]>(`meetings_${params.companyId}`, []);
    setCache(`meetings_${params.companyId}`, [...existing, newMeeting]);

    return newMeeting;
  },

  /**
   * Responds to a meeting invitation (accept / decline).
   */
  async respondToMeeting(meetingId: string, userId: string, status: 'accepted' | 'declined', companyId?: string) {
    try {
      await supabase
        .from('bi_chat_meeting_participants')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('meeting_id', meetingId)
        .eq('user_id', userId);
    } catch {
      /* ignore */
    }

    if (companyId) {
      const cached = getCache<Meeting[]>(`meetings_${companyId}`, []);
      const updated = cached.map((m) => {
        if (m.id !== meetingId) return m;
        return {
          ...m,
          participants: m.participants.map((p) => (p.user_id === userId ? { ...p, status } : p)),
        };
      });
      setCache(`meetings_${companyId}`, updated);
    }
  },

  /**
   * Cancels a scheduled meeting.
   */
  async cancelMeeting(meetingId: string, companyId?: string, conversationId?: string, cancelerName?: string) {
    try {
      await supabase.from('bi_chat_meetings').update({ status: 'cancelled' }).eq('id', meetingId);
    } catch {
      /* ignore */
    }

    if (companyId) {
      const cached = getCache<Meeting[]>(`meetings_${companyId}`, []);
      const updated = cached.map((m) => (m.id === meetingId ? { ...m, status: 'cancelled' as const } : m));
      setCache(`meetings_${companyId}`, updated);
    }

    if (conversationId && cancelerName && companyId) {
      await this.sendMessage({
        conversationId,
        companyId,
        senderId: 'system',
        senderName: 'Meeting System',
        content: `Meeting was cancelled by ${cancelerName}`,
        type: 'system',
      });
    }
  },

  /**
   * Fetches meetings for conversation or company.
   */
  async getMeetings(companyId: string, conversationId?: string): Promise<Meeting[]> {
    try {
      let q = supabase
        .from('bi_chat_meetings')
        .select(`
          *,
          participants:bi_chat_meeting_participants(*)
        `)
        .eq('company_id', companyId)
        .order('start_time', { ascending: true });

      if (conversationId) {
        q = q.eq('conversation_id', conversationId);
      }

      const { data, error } = await q;
      if (error) throw error;

      return (data || []).map((m: any) => ({
        id: m.id,
        company_id: m.company_id,
        conversation_id: m.conversation_id,
        organizer_id: m.organizer_id,
        title: m.title,
        description: m.description,
        start_time: m.start_time,
        end_time: m.end_time,
        meeting_type: m.meeting_type,
        location_or_link: m.location_or_link,
        status: m.status,
        reminder_minutes: m.reminder_minutes || [15, 5, 0],
        participants: (m.participants || []).map((p: any) => ({
          user_id: p.user_id,
          status: p.status,
          responded_at: p.responded_at,
        })),
        created_at: m.created_at,
      }));
    } catch {
      const cached = getCache<Meeting[]>(`meetings_${companyId}`, []);
      return conversationId ? cached.filter((m) => m.conversation_id === conversationId) : cached;
    }
  },

  /**
   * Logs a call event in chat history.
   */
  async logCall(params: {
    companyId: string;
    conversationId: string;
    callerId: string;
    callerName: string;
    callType: 'voice' | 'video';
    status: 'connected' | 'missed' | 'rejected';
    durationSeconds: number;
    recipientId?: string;
    recipientName?: string;
    recordingUrl?: string | null;
    recordingType?: string;
    transcriptText?: string;
    dialogue?: any[];
  }) {
    const text =
      params.status === 'missed'
        ? `Missed ${params.callType} call`
        : params.status === 'rejected'
        ? `Declined ${params.callType} call`
        : `${params.callType === 'video' ? 'Video' : 'Voice'} call ended (${formatDuration(params.durationSeconds)})`;

    // Persist to bi_chat_calls database table
    try {
      await supabase.from('bi_chat_calls').insert({
        company_id: params.companyId,
        conversation_id: params.conversationId,
        caller_id: params.callerId,
        type: params.callType,
        status: params.status === 'connected' ? 'ended' : params.status,
        duration_seconds: params.durationSeconds,
        started_at: new Date(Date.now() - params.durationSeconds * 1000).toISOString(),
        ended_at: new Date().toISOString(),
        participants: {
          caller_id: params.callerId,
          caller_name: params.callerName,
          recipient_id: params.recipientId,
          recipient_name: params.recipientName,
          recording_url: params.recordingUrl || null,
          recording_type: params.recordingType || (params.callType === 'video' ? 'video/webm' : 'audio/webm'),
          transcript: params.transcriptText || '',
          dialogue: params.dialogue || [],
        },
      });
    } catch (e) {
      console.warn('Could not record call in bi_chat_calls:', e);
    }

    await this.sendMessage({
      conversationId: params.conversationId,
      companyId: params.companyId,
      senderId: params.callerId,
      senderName: params.callerName,
      content: text,
      type: 'call_log',
      metadata: {
        call_type: params.callType,
        call_duration: params.durationSeconds,
        call_status: params.status,
        recording_url: params.recordingUrl || null,
        transcript: params.transcriptText || '',
        dialogue: params.dialogue || [],
      },
    });
  },

  /**
   * Fetches communications audit logs for all calls made within a company.
   */
  async getCallAuditLogs(companyId: string): Promise<CallAuditItem[]> {
    if (!companyId) return [];
    try {
      const { data, error } = await supabase
        .from('bi_chat_calls')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data) return [];

      return data.map((row: any) => {
        const parts = row.participants || {};
        return {
          id: row.id,
          company_id: row.company_id,
          conversation_id: row.conversation_id,
          caller_id: row.caller_id,
          type: row.type || 'voice',
          status: row.status,
          started_at: row.started_at,
          ended_at: row.ended_at,
          duration_seconds: row.duration_seconds || 0,
          created_at: row.created_at,
          caller_name: parts.caller_name || 'Caller',
          recipient_name: parts.recipient_name || 'Recipient',
          recording_url: parts.recording_url || null,
          recording_type: parts.recording_type || (row.type === 'video' ? 'video/webm' : 'audio/webm'),
          transcript: parts.transcript || '',
          dialogue: parts.dialogue || [],
        };
      });
    } catch (err) {
      console.warn('[AuditLogs] getCallAuditLogs failed:', err);
      return [];
    }
  },
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
