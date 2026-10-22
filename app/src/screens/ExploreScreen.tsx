import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Btn, Empty, Field, HCText } from '../components/UI';
import { supabase } from '../lib/supabase';
import { C } from '../theme/colors';
import type { Conversation, Profile } from '../types/models';

export function ExploreScreen({ userId, onChat }: { userId: string; onChat: (c: Conversation, label: string) => void }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [publicRooms, setPublicRooms] = useState<Conversation[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [kind, setKind] = useState<'group' | 'channel'>('group');
  const [roomName, setRoomName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);

  const refreshRooms = useCallback(async () => {
    const { data, error } = await supabase.from('conversations').select('*').eq('is_public', true).neq('kind', 'dm').order('created_at', { ascending: false }).limit(60);
    if (error) Alert.alert('Ricerca', error.message);
    else setPublicRooms(data as Conversation[]);
  }, []);
  useEffect(() => { refreshRooms(); }, [refreshRooms]);
  useEffect(() => {
    let mounted = true;
    const q = query.trim();
    if (q.length < 2) { setUsers([]); return; }
    const safe = q.replace(/[^a-zA-Z0-9_àèéìòùÀÈÉÌÒÙ ]/g, '').trim();
    if (safe.length < 2) { setUsers([]); return; }
    const timer = setTimeout(() => {
      supabase.from('profiles').select('id,username,display_name').or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`).limit(20)
        .then(({ data, error }) => {
          if (mounted && !error) setUsers(((data || []) as Profile[]).filter(p => p.id !== userId));
        });
    }, 280);
    return () => { mounted = false; clearTimeout(timer); };
  }, [query, userId]);

  async function startDm(other: Profile) {
    if (busy) return;
    setBusy(true);
    try {
      // Riutilizza una chat a due partecipanti se già presente.
      const { data: memberships, error: mError } = await supabase.from('conversation_members').select('conversation_id').eq('user_id', userId);
      if (mError) throw mError;
      const ids = (memberships || []).map(m => m.conversation_id);
      if (ids.length) {
        const { data: dms, error } = await supabase.from('conversations').select('*').in('id', ids).eq('kind', 'dm');
        if (error) throw error;
        for (const dm of (dms || []) as Conversation[]) {
          const { data: pair } = await supabase.from('conversation_members').select('user_id').eq('conversation_id', dm.id);
          if ((pair || []).length === 2 && (pair || []).some(m => m.user_id === other.id)) { onChat(dm, other.display_name); return; }
        }
      }
      const { data: created, error } = await supabase.from('conversations').insert({ kind: 'dm', title: '', description: '', owner_id: userId, is_public: false }).select().single();
      if (error) throw error;
      const { error: inviteError } = await supabase.from('conversation_members').insert({ conversation_id: created.id, user_id: other.id, role: 'member' });
      if (inviteError) throw inviteError;
      onChat(created as Conversation, other.display_name);
    } catch (e: any) { Alert.alert('Impossibile avviare la chat', e.message); }
    finally { setBusy(false); }
  }

  async function join(room: Conversation) {
    setBusy(true);
    const { error } = await supabase.from('conversation_members').upsert({ conversation_id: room.id, user_id: userId, role: 'member' }, { onConflict: 'conversation_id,user_id', ignoreDuplicates: true });
    setBusy(false);
    if (error) Alert.alert('Ingresso non riuscito', error.message);
    else onChat(room, room.title);
  }

  async function createRoom() {
    const name = roomName.trim();
    if (!name) { Alert.alert('Nome mancante', 'Inserisci il nome del gruppo o canale.'); return; }
    setBusy(true);
    const { data, error } = await supabase.from('conversations').insert({ kind, title: name, description: description.trim(), owner_id: userId, is_public: isPublic }).select().single();
    setBusy(false);
    if (error) Alert.alert('Errore', error.message);
    else { setCreateOpen(false); setRoomName(''); setDescription(''); refreshRooms(); onChat(data as Conversation, name); }
  }

  return <ScrollView contentContainerStyle={{ padding: 15, paddingBottom: 35 }} keyboardShouldPersistTaps="handled">
    <HCText style={styles.section}>Cerca persone</HCText>
    <Field placeholder="Nome o username (min. 2 lettere)" value={query} onChangeText={setQuery} autoCapitalize="none" />
    {users.map(person => <Pressable style={styles.row} key={person.id} onPress={() => startDm(person)} disabled={busy}>
      <View style={styles.avatar}><HCText style={{ fontWeight: '900' }}>{person.display_name.slice(0, 1).toUpperCase()}</HCText></View>
      <View style={{ flex: 1 }}><HCText style={styles.name}>{person.display_name}</HCText><HCText muted>@{person.username}</HCText></View>
      <HCText style={{ color: C.blue2 }}>Scrivi  ›</HCText>
    </Pressable>)}
    {query.trim().length >= 2 && users.length === 0 && <Empty message="Nessun profilo trovato. Fai registrare un'altra persona per testare la chat reale." />}

    <View style={{ height: 18 }} />
    <HCText style={styles.section}>Gruppi e canali</HCText>
    <Btn label={createOpen ? 'Chiudi creazione' : '+ Crea gruppo o canale'} onPress={() => setCreateOpen(x => !x)} />
    {createOpen && <View style={styles.form}>
      <View style={styles.row}><Pressable onPress={() => setKind('group')} style={[styles.choice, kind === 'group' && styles.active]}><HCText>Gruppo</HCText></Pressable>
        <Pressable onPress={() => setKind('channel')} style={[styles.choice, kind === 'channel' && styles.active]}><HCText>Canale</HCText></Pressable></View>
      <Field placeholder="Nome" maxLength={80} value={roomName} onChangeText={setRoomName} />
      <Field placeholder="Descrizione facoltativa" maxLength={500} value={description} onChangeText={setDescription} />
      <Btn muted label={isPublic ? 'Visibilità: PUBBLICO (tocca per privato)' : 'Visibilità: PRIVATO (tocca per pubblico)'} onPress={() => setIsPublic(v => !v)} />
      <Btn label="Crea adesso" onPress={createRoom} busy={busy} />
      <HCText muted style={{ fontSize: 12 }}>I gruppi privati si aprono solo su invito del proprietario. Nei canali pubblica solo il proprietario.</HCText>
    </View>}
    <HCText muted style={{ marginTop: 12, marginBottom: 8 }}>Esplora le comunità pubbliche</HCText>
    {publicRooms.length === 0 ? <Empty message="Non ci sono ancora gruppi o canali pubblici." /> : publicRooms.map(room =>
      <Pressable key={room.id} onPress={() => join(room)} style={styles.row} disabled={busy}>
        <View style={styles.avatar}><HCText>{room.kind === 'group' ? '♟' : '✦'}</HCText></View>
        <View style={{ flex: 1 }}><HCText style={styles.name}>{room.title}</HCText><HCText muted>{room.kind === 'group' ? 'Gruppo' : 'Canale'} · {room.description.slice(0, 65)}</HCText></View>
        <HCText style={{ color: C.blue2 }}>Entra  ›</HCText>
      </Pressable>)}
  </ScrollView>;
}
const styles = StyleSheet.create({
  section: { fontSize: 19, fontWeight: '900', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border },
  avatar: { width: 43, height: 43, borderRadius: 16, backgroundColor: C.panel2, justifyContent: 'center', alignItems: 'center' },
  name: { fontWeight: '800', fontSize: 16 }, form: { padding: 12, backgroundColor: C.panel, borderRadius: 16, marginBottom: 10 },
  choice: { padding: 10, backgroundColor: C.panel2, flex: 1, borderRadius: 10, alignItems: 'center' }, active: { backgroundColor: C.blue },
});
