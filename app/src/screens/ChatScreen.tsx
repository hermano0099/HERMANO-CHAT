import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Btn, Empty, Field, HCText } from '../components/UI';
import { supabase } from '../lib/supabase';
import { C } from '../theme/colors';
import type { Conversation, Message, Profile } from '../types/models';

export function ChatScreen({ conversation, userId }: { conversation: Conversation; userId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [invite, setInvite] = useState('');
  const [showActions, setShowActions] = useState(false);
  const scroll = useRef<FlatList<Message>>(null);
  const isChannelMemberReadOnly = conversation.kind === 'channel' && conversation.owner_id !== userId;

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('messages').select('id,conversation_id,author_id,body,created_at')
      .eq('conversation_id', conversation.id).order('created_at', { ascending: false }).limit(100);
    if (error) { Alert.alert('Messaggi', error.message); return; }
    const next = ((data || []) as Message[]).reverse();
    setMessages(next);
    const ids = [...new Set(next.map(m => m.author_id))];
    if (ids.length) {
      const { data: authors } = await supabase.from('profiles').select('id,display_name').in('id', ids);
      setPeople(Object.fromEntries(((authors || []) as Profile[]).map(p => [p.id, p.display_name])));
    }
    setLoading(false);
  }, [conversation.id]);

const markAsRead = useCallback(async () => {
  const { error } = await supabase
    .from('conversation_members')
    .update({
      last_read_at: new Date().toISOString(),
    })
    .eq('conversation_id', conversation.id)
    .eq('user_id', userId);

  if (error) {
    console.error('Errore messaggi letti:', error.message);
  }
}, [conversation.id, userId]);

const reloadAndMarkAsRead = useCallback(async () => {
  await reload();
  await markAsRead();
}, [markAsRead, reload]);

useEffect(() => {
  reloadAndMarkAsRead();

  const channel = supabase.channel(`conversation-${conversation.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` }, reloadAndMarkAsRead)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` }, reload)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [conversation.id, reload, reloadAndMarkAsRead]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    if (body.length > 4000) { Alert.alert('Testo troppo lungo', 'Massimo 4000 caratteri.'); return; }
    setSending(true);
    const { error } = await supabase.from('messages').insert({ conversation_id: conversation.id, author_id: userId, body });
    setSending(false);
    if (error) Alert.alert('Messaggio non inviato', error.message);
    else { setDraft(''); reload(); }
  }

  async function inviteMember() {
    if (conversation.owner_id !== userId) return;
    const name = invite.trim().replace(/^@/, '').toLowerCase();
    if (!name) return;
    const { data: found, error: lookupError } = await supabase.from('profiles').select('id,username').eq('username', name).maybeSingle();
    if (lookupError || !found) { Alert.alert('Utente non trovato', 'Cerca il nome utente esatto, senza spazi.'); return; }
    const { error } = await supabase.from('conversation_members').insert({ conversation_id: conversation.id, user_id: found.id, role: 'member' });
    if (error) Alert.alert('Invito non riuscito', error.message);
    else { setInvite(''); Alert.alert('Utente aggiunto', `@${found.username} è ora membro.`); }
  }

  async function reportMessage(message: Message) {
    Alert.alert('Segnala messaggio', 'Inviare una segnalazione al team?', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Segnala', onPress: async () => {
        const { error } = await supabase.from('reports').insert({ reporter_id: userId, target_user_id: message.author_id, target_message_id: message.id, reason: 'Messaggio segnalato dall’utente. Da verificare.' });
        Alert.alert(error ? 'Errore' : 'Segnalazione ricevuta', error?.message || 'Il team potrà esaminare il messaggio.');
      } },
    ]);
  }

  async function blockParticipant() {
    if (conversation.kind !== 'dm') return;
    const { data: members, error } = await supabase.from('conversation_members').select('user_id').eq('conversation_id', conversation.id);
    if (error) { Alert.alert('Errore', error.message); return; }
    const other = (members || []).find(m => m.user_id !== userId)?.user_id;
    if (!other) return;
    const result = await supabase.from('blocks').upsert({ blocker_id: userId, blocked_id: other }, { onConflict: 'blocker_id,blocked_id' });
    Alert.alert(result.error ? 'Errore' : 'Utente bloccato', result.error?.message || 'Non potrete più scambiarvi messaggi.');
  }

  return <KeyboardAvoidingView style={styles.main} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={85}>
    <View style={styles.summary}><HCText muted>{conversation.kind === 'dm' ? 'Chat privata' : conversation.kind === 'group' ? 'Gruppo' : 'Canale'} · {conversation.is_public ? 'Pubblico' : 'Privato'}</HCText>
      <Pressable onPress={() => setShowActions(x => !x)}><HCText style={{ color: C.blue2 }}>Opzioni  ⋮</HCText></Pressable>
    </View>
    {showActions && <View style={styles.actions}>
      {conversation.owner_id === userId && <>
        <HCText>Invita tramite username (senza @)</HCText>
        <Field placeholder="nomeutente" autoCapitalize="none" value={invite} onChangeText={setInvite} />
        <Btn label="Aggiungi membro" onPress={inviteMember} />
      </>}
      {conversation.kind === 'dm' && <Btn danger label="Blocca utente" onPress={blockParticipant} />}
      <HCText muted style={{ fontSize: 12 }}>Per segnalare un messaggio, tieni premuto sul fumetto.</HCText>
    </View>}
    {loading && <ActivityIndicator color={C.blue2} />}
    <FlatList ref={scroll} data={messages} keyExtractor={m => m.id}
      contentContainerStyle={{ paddingHorizontal: 15, paddingVertical: 12, flexGrow: 1, justifyContent: 'flex-end' }}
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      ListEmptyComponent={!loading ? <Empty message="Nessun messaggio. Scrivi il primo!" /> : null}
      renderItem={({ item }) => {
        const mine = item.author_id === userId;
        return <Pressable onLongPress={() => !mine && reportMessage(item)} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
          {!mine && conversation.kind !== 'dm' && <HCText style={styles.author}>{people[item.author_id] || 'Utente'}</HCText>}
          <HCText style={styles.body}>{item.body}</HCText>
          <HCText muted style={{ fontSize: 10, textAlign: 'right', marginTop: 3 }}>{new Date(item.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</HCText>
        </Pressable>;
      }} />
    {isChannelMemberReadOnly ? <View style={styles.input}><HCText muted>Solo il proprietario del canale può pubblicare.</HCText></View>
      : <View style={styles.input}><View style={{ flex: 1 }}><Field placeholder="Scrivi un messaggio..." value={draft} onChangeText={setDraft} multiline maxLength={4000} style={{ maxHeight: 130, marginBottom: 0 }} /></View>
          <Pressable disabled={sending || !draft.trim()} onPress={send} style={[styles.send, (sending || !draft.trim()) && { opacity: .5 }]}><HCText style={{ fontWeight: '900', fontSize: 19 }}>➤</HCText></Pressable>
        </View>}
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  main: { flex: 1 }, summary: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 17, borderBottomWidth: 1, borderColor: C.border },
  bubble: { maxWidth: '82%', minWidth: 86, marginVertical: 5, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16 },
  mine: { backgroundColor: C.blue, alignSelf: 'flex-end', borderBottomRightRadius: 3 },
  theirs: { backgroundColor: C.panel2, alignSelf: 'flex-start', borderBottomLeftRadius: 3 },
  author: { color: C.green, fontWeight: '800', fontSize: 12, marginBottom: 4 }, body: { fontSize: 16, lineHeight: 22 },
  input: { borderTopWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: C.panel },
  send: { paddingHorizontal: 16, paddingVertical: 11, backgroundColor: C.blue, borderRadius: 14 },
  actions: { padding: 13, backgroundColor: C.panel, borderBottomWidth: 1, borderColor: C.border },
});
