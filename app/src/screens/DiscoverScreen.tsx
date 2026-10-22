import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Btn, Empty, Field, HCText } from '../components/UI';
import { supabase } from '../lib/supabase';
import { C } from '../theme/colors';
import type { Conversation, Profile } from '../types/models';

type Tab = 'people' | 'group' | 'channel';
export function DiscoverScreen({ userId, onChat, onCreate }: {
  userId: string;
  onChat: (conv: Conversation, title: string) => void;
  onCreate: () => void;
}) {
  const [tab, setTab] = useState<Tab>('people');
  const [term, setTerm] = useState('');
  const [people, setPeople] = useState<Profile[]>([]);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [busyId, setBusyId] = useState('');
  const [searchingPeople, setSearchingPeople] = useState(false);
  const peopleSearchSequence = useRef(0);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('conversations').select('*')
      .eq('is_public', true).order('created_at', { ascending: false }).limit(100);
    if (error) Alert.alert('Errore', error.message);
    else setConvs((data || []) as Conversation[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const sequence = ++peopleSearchSequence.current;
    const query = term.trim().replace(/^@/, '');
    if (!query) {
      setPeople([]);
      setSearchingPeople(false);
      return;
    }

    setPeople([]);
    setSearchingPeople(true);
    const timer = setTimeout(async () => {
      try {
        const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
        const [byUsername, byName] = await Promise.all([
          supabase.from('profiles').select('id,username,display_name')
            .neq('id', userId).ilike('username', pattern).limit(100),
          supabase.from('profiles').select('id,username,display_name')
            .neq('id', userId).ilike('display_name', pattern).limit(100),
        ]);
        if (byUsername.error || byName.error) throw byUsername.error || byName.error;
        if (sequence !== peopleSearchSequence.current) return;
        const unique = new Map<string, Profile>();
        [...(byUsername.data || []), ...(byName.data || [])].forEach(person => {
          unique.set(person.id, person as Profile);
        });
        setPeople([...unique.values()]);
      } catch (error: any) {
        if (sequence === peopleSearchSequence.current) {
          setPeople([]);
          Alert.alert('Ricerca utenti', error?.message || 'Impossibile completare la ricerca.');
        }
      } finally {
        if (sequence === peopleSearchSequence.current) setSearchingPeople(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [term, userId]);

  async function startDm(other: Profile) {
    setBusyId(other.id);
    try {
      // Cerca una conversazione privata preesistente tra i due, per evitare doppioni s daul client.
      const { data: mine, error: e1 } = await supabase.from('conversation_members')
        .select('conversation_id').eq('user_id', userId);
      if (e1) throw e1;
      const ids = (mine || []).map(m => m.conversation_id);
      if (ids.length) {
        const [{ data: dms, error: e2 }, { data: theirs, error: e3 }] = await Promise.all([
          supabase.from('conversations').select('*').eq('kind', 'dm').in('id', ids),
          supabase.from('conversation_members').select('conversation_id').eq('user_id', other.id).in('conversation_id', ids),
        ]);
        if (e2 || e3) throw e2 || e3;
        const shared = new Set((theirs || []).map(m => m.conversation_id));
        const old = ((dms || []) as Conversation[]).find(c => shared.has(c.id));
        if (old) { onChat(old, other.display_name); return; }
      }
      const { data: created, error: e4 } = await supabase.from('conversations')
        .insert({ kind: 'dm', title: '', is_public: false, owner_id: userId }).select('*').single();
      if (e4) throw e4;
      const { error: e5 } = await supabase.from('conversation_members')
        .insert({ conversation_id: created.id, user_id: other.id });
      if (e5) throw e5;
      onChat(created as Conversation, other.display_name);
    } catch (e: any) { Alert.alert('Impossibile creare la chat', e.message); }
    finally { setBusyId(''); }
  }

  async function join(conv: Conversation) {
    setBusyId(conv.id);
    try {
      const { error } = await supabase.from('conversation_members')
        .upsert({ conversation_id: conv.id, user_id: userId, role: 'member' }, { onConflict: 'conversation_id,user_id', ignoreDuplicates: true });
      if (error) throw error;
      onChat(conv, conv.title);
    } catch (e: any) { Alert.alert('Impossibile entrare', e.message); }
    finally { setBusyId(''); }
  }

  const shownConvs = convs.filter(c => c.kind === tab && (c.title + ' ' + c.description).toLowerCase().includes(term.toLowerCase()));
  return <View style={{ flex: 1, padding: 15 }}>
    <View style={styles.tabs}>
      {([['people','Utenti'],['group','Gruppi'],['channel','Canali']] as [Tab,string][]).map(([key, title]) =>
        <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && { backgroundColor: C.blue }]}>
          <HCText style={{ fontWeight: '800', fontSize: 13 }}>{title}</HCText>
        </Pressable>)}
    </View>
    <Field placeholder={tab === 'people' ? 'Cerca utente o @username' : 'Cerca gruppo o canale'} value={term} onChangeText={setTerm} />
    {tab !== 'people' && <Btn label="+ Crea gruppo / canale" onPress={onCreate} />}
    <ScrollView keyboardShouldPersistTaps="handled">
      {tab === 'people' ? (searchingPeople ? <HCText muted style={{ padding: 14 }}>Ricerca utenti...</HCText>
        : people.length ? people.map(p =>
        <Pressable key={p.id} style={styles.row} onPress={() => startDm(p)} disabled={!!busyId}>
          <View style={styles.circle}><HCText>{p.display_name.charAt(0).toUpperCase()}</HCText></View>
          <View style={{ flex: 1 }}><HCText style={{ fontWeight: '800' }}>{p.display_name}</HCText><HCText muted>@{p.username}</HCText></View>
          <HCText>{busyId === p.id ? 'Attendi...' : 'Scrivi →'}</HCText>
        </Pressable>) : <Empty message={term.trim() ? 'Nessun utente trovato.' : 'Cerca per nome o username per iniziare una chat.'} />)
      : (shownConvs.length ? shownConvs.map(c =>
        <Pressable key={c.id} style={styles.row} onPress={() => join(c)} disabled={!!busyId}>
          <View style={styles.circle}><HCText>{c.kind === 'channel' ? '📢' : '👥'}</HCText></View>
          <View style={{ flex: 1 }}><HCText style={{ fontWeight: '800' }}>{c.title}</HCText><HCText muted>{c.description || (c.kind === 'channel' ? 'Canale pubblico' : 'Gruppo pubblico')}</HCText></View>
          <HCText>{busyId === c.id ? '...' : 'Entra →'}</HCText>
        </Pressable>) : <Empty message="Non ci sono ancora gruppi o canali pubblici. Puoi crearne uno tu." />)}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 13 },
  tab: { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center', backgroundColor: C.panel2 },
  row: { flexDirection: 'row', paddingVertical: 14, alignItems: 'center', gap: 12, borderBottomColor: C.border, borderBottomWidth: 1 },
  circle: { backgroundColor: C.blue, borderRadius: 18, width: 45, height: 45, alignItems: 'center', justifyContent: 'center' },
});
