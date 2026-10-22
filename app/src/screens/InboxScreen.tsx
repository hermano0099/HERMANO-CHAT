import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Btn, Empty, Field, HCText } from '../components/UI';
import { supabase } from '../lib/supabase';
import { C } from '../theme/colors';
import type { Conversation, ConversationInvitation, InboxItem, Message, Profile } from '../types/models';

type IncomingInvitation = ConversationInvitation & {
  title: string;
  inviterName: string;
  inviterUsername: string;
};

export function InboxScreen({ userId, onChat, refreshKey, onUnreadCount }: {
  userId: string; refreshKey: number; onChat: (conv: Conversation, label: string) => void;
  onUnreadCount?: (count: number) => void;
}) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [invitations, setInvitations] = useState<IncomingInvitation[]>([]);
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyInvitationId, setBusyInvitationId] = useState('');
  const loadSequence = useRef(0);
  const invitationSequence = useRef(0);

  const loadInvitations = useCallback(async () => {
    const sequence = ++invitationSequence.current;
    if (!userId) {
      setInvitations([]);
      return;
    }
    const { data: pending, error: invitationError } = await supabase.from('conversation_invitations')
      .select('id,conversation_id,invited_user_id,invited_by,status,created_at')
      .eq('invited_user_id', userId).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(50);
    if (invitationError) {
      if (sequence === invitationSequence.current) Alert.alert('Inviti', invitationError.message);
      return;
    }
    const conversationIds = [...new Set((pending || []).map(invitation => invitation.conversation_id))];
    const inviterIds = [...new Set((pending || []).map(invitation => invitation.invited_by))];
    const [{ data: conversations, error: conversationsError }, { data: people, error: peopleError }] = await Promise.all([
      conversationIds.length
        ? supabase.from('conversations').select('id,title').in('id', conversationIds)
        : Promise.resolve({ data: [], error: null }),
      inviterIds.length
        ? supabase.from('profiles').select('id,username,display_name').in('id', inviterIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (conversationsError || peopleError) {
      if (sequence === invitationSequence.current) {
        Alert.alert('Inviti', (conversationsError || peopleError)?.message || 'Impossibile caricare gli inviti.');
      }
      return;
    }
    if (sequence !== invitationSequence.current) return;
    const conversationById = new Map((conversations || []).map(conversation => [conversation.id, conversation]));
    const personById = new Map((people || []).map(person => [person.id, person]));
    setInvitations(((pending || []) as ConversationInvitation[]).flatMap(invitation => {
      const conversation = conversationById.get(invitation.conversation_id);
      const inviter = personById.get(invitation.invited_by);
      return conversation && inviter ? [{
        ...invitation,
        title: conversation.title,
        inviterName: inviter.display_name,
        inviterUsername: inviter.username,
      }] : [];
    }));
  }, [userId]);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    if (!userId) {
      setItems([]);
      onUnreadCount?.(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: mine, error: e1 } = await supabase.from('conversation_members')
        .select('conversation_id,last_read_at').eq('user_id', userId);
      if (e1) throw e1;
      const ids = (mine || []).map(m => m.conversation_id);
      if (!ids.length) {
        if (sequence === loadSequence.current) {
          setItems([]);
          onUnreadCount?.(0);
          setLoading(false);
        }
        return;
      }
      const [{ data: convs, error: e2 }, { data: members, error: e3 }] = await Promise.all([
        supabase.from('conversations').select('*').in('id', ids),
        supabase.from('conversation_members').select('conversation_id,user_id,last_read_at').in('conversation_id', ids),
      ]);
      if (e2 || e3) throw e2 || e3;
      const otherIds = Array.from(new Set((members || []).filter(m => m.user_id !== userId).map(m => m.user_id)));
      const people: Record<string, Profile> = {};
      if (otherIds.length) {
        const { data, error } = await supabase.from('profiles').select('id,username,display_name').in('id', otherIds);
        if (error) throw error;
        (data || []).forEach(p => { people[p.id] = p as Profile; });
      }
      const result = await Promise.all(((convs || []) as Conversation[]).map(async c => {
        const membership = (mine || []).find(m => m.conversation_id === c.id);
        const latestRequest = supabase.from('messages').select('*')
          .eq('conversation_id', c.id).is('deleted_at', null)
          .order('created_at', { ascending: false }).limit(1);
        const unreadRequest = supabase.from('messages').select('id', { count: 'exact', head: true })
          .eq('conversation_id', c.id).neq('author_id', userId).is('deleted_at', null);
        const [{ data: msgs, error: latestError }, unreadResult] = await Promise.all([
          latestRequest,
          membership?.last_read_at ? unreadRequest.gt('created_at', membership.last_read_at) : unreadRequest,
        ]);
        if (latestError || unreadResult.error) throw latestError || unreadResult.error;
        const last = (msgs?.[0] || null) as Message | null;
        const otherId = (members || []).find(m => m.conversation_id === c.id && m.user_id !== userId)?.user_id;
        const other = otherId ? people[otherId] : null;
        const displayTitle = c.kind === 'dm' ? (other?.display_name || 'Nuova chat') : c.title;
        return {
          ...c, displayTitle,
          subtitle: last ? last.body : (c.kind === 'dm' ? 'Inizia la conversazione' : c.description || 'Nessun messaggio'),
          lastAt: last?.created_at || c.created_at,
          unreadCount: unreadResult.count || 0,
        };
      }));
      if (sequence === loadSequence.current) {
        setItems(result.sort((a, b) => b.lastAt.localeCompare(a.lastAt)));
      }
    } catch (e: any) {
      if (sequence === loadSequence.current) {
        setItems([]);
        onUnreadCount?.(0);
        Alert.alert('Impossibile caricare le chat', e.message);
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [onUnreadCount, userId]);

  useEffect(() => {
    setItems([]);
    load();
    loadInvitations();
    const ch = supabase.channel('inbox-' + userId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => { load(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => { load(); })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => { load(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_members' }, () => { load(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${userId}` }, () => { load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_invitations', filter: `invited_user_id=eq.${userId}` }, () => { loadInvitations(); })
      .subscribe();
    return () => {
      loadSequence.current += 1;
      invitationSequence.current += 1;
      supabase.removeChannel(ch);
    };
  }, [load, loadInvitations, userId, refreshKey]);

  useEffect(() => {
    onUnreadCount?.(items.reduce((total, item) => total + (item.unreadCount || 0), 0) + invitations.length);
  }, [invitations, items, onUnreadCount]);

  async function respondToInvitation(invitation: IncomingInvitation, accept: boolean) {
    setBusyInvitationId(invitation.id);
    const { data: conversationId, error } = await supabase.rpc('respond_to_conversation_invitation', {
      p_invitation: invitation.id,
      p_accept: accept,
    });
    if (error) {
      Alert.alert('Invito', error.message);
      setBusyInvitationId('');
      return;
    }
    await Promise.all([loadInvitations(), load()]);
    setBusyInvitationId('');
    if (!accept) return;
    const { data: conversation, error: conversationError } = await supabase.from('conversations')
      .select('*').eq('id', conversationId).maybeSingle();
    if (conversationError || !conversation) {
      Alert.alert('Invito accettato', conversationError?.message || 'La conversazione non è disponibile.');
      return;
    }
    onChat(conversation as Conversation, conversation.title);
  }

  const visible = items.filter(i => i.displayTitle.toLowerCase().includes(term.toLowerCase()));
  return <View style={styles.root}>
    <Field value={term} onChangeText={setTerm} placeholder="Cerca tra le tue chat..." />
    <FlatList data={visible} keyExtractor={it => it.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.white} />}
      ListHeaderComponent={invitations.length ? <View style={styles.invitationSection}>
        <HCText style={styles.invitationHeading}>Inviti ricevuti ({invitations.length})</HCText>
        {invitations.map(invitation => <View key={invitation.id} style={styles.invitationCard}>
          <HCText style={{ fontWeight: '800' }}>{invitation.title}</HCText>
          <HCText muted style={{ marginTop: 4 }}>Da {invitation.inviterName} (@{invitation.inviterUsername})</HCText>
          <View style={styles.invitationActions}>
            <Btn label="Accetta" busy={busyInvitationId === invitation.id} disabled={!!busyInvitationId} onPress={() => respondToInvitation(invitation, true)} style={{ flex: 1 }} />
            <Btn label="Rifiuta" muted disabled={!!busyInvitationId} onPress={() => respondToInvitation(invitation, false)} style={{ flex: 1 }} />
          </View>
        </View>)}
      </View> : null}
      ListEmptyComponent={invitations.length ? null : <Empty message="Non hai ancora conversazioni. Vai su Cerca per scrivere a qualcuno o entrare in un gruppo." />}
      renderItem={({ item }) => <Pressable onPress={() => onChat(item, item.displayTitle)} style={styles.item}>
        <View style={styles.avatar}><HCText style={{ fontWeight: '900', fontSize: 21 }}>{item.displayTitle.slice(0, 1).toUpperCase()}</HCText></View>
        <View style={{ flex: 1 }}>
          <HCText style={{ fontWeight: '800', fontSize: 17 }}>{item.displayTitle}</HCText>
          <HCText muted style={{ marginTop: 5 }}>{item.subtitle.slice(0, 85)}</HCText>
        </View>
        <View style={styles.itemMeta}>
          <HCText muted style={{ fontSize: 11 }}>{item.kind === 'dm' ? 'CHAT' : item.kind === 'group' ? 'GRUPPO' : 'CANALE'}</HCText>
          {(item.unreadCount || 0) > 0 && <View style={styles.unreadBadge}>
            <HCText style={styles.unreadCount}>{(item.unreadCount || 0) > 99 ? '99+' : item.unreadCount}</HCText>
          </View>}
        </View>
      </Pressable>}
    />
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, padding: 15 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomColor: C.border, borderBottomWidth: 1 },
  avatar: { width: 55, height: 55, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blue },
  itemMeta: { alignItems: 'center', gap: 7 },
  unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blue2 },
  unreadCount: { color: C.white, fontSize: 11, fontWeight: '900' },
  invitationSection: { paddingBottom: 12 },
  invitationHeading: { fontSize: 18, fontWeight: '900', marginBottom: 8 },
  invitationCard: { padding: 13, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.panel },
  invitationActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
});
