import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Btn, Field, HCText } from '../components/UI';
import { supabase } from '../lib/supabase';
import { C } from '../theme/colors';
import type { Conversation } from '../types/models';

export function CreateConversationScreen({ userId, onDone, onCancel }: {
  userId: string; onDone: (conv: Conversation) => void; onCancel: () => void;
}) {
  const [kind, setKind] = useState<'group' | 'channel'>('group');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [publicMode, setPublicMode] = useState(true);
  const [busy, setBusy] = useState(false);
  async function create() {
    if (!title.trim()) { Alert.alert('Titolo obbligatorio'); return; }
    setBusy(true);
    const { data, error } = await supabase.from('conversations')
      .insert({ kind, title: title.trim(), description: description.trim(), is_public: publicMode, owner_id: userId })
      .select('*').single();
    setBusy(false);
    if (error) Alert.alert('Non è stato possibile creare', error.message);
    else onDone(data as Conversation);
  }
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 17 }}>
    <HCText big>Crea una community</HCText>
    <HCText muted style={{ marginVertical: 12 }}>Nei canali pubblica soltanto il proprietario; nei gruppi possono scrivere i membri.</HCText>
    <View style={styles.row}>
      <Pressable style={[styles.pill, kind === 'group' && styles.active]} onPress={() => setKind('group')}><HCText>👥 Gruppo</HCText></Pressable>
      <Pressable style={[styles.pill, kind === 'channel' && styles.active]} onPress={() => setKind('channel')}><HCText>📢 Canale</HCText></Pressable>
    </View>
    <Field placeholder="Nome del gruppo / canale" value={title} maxLength={80} onChangeText={setTitle} />
    <Field placeholder="Descrizione (facoltativa)" value={description} multiline maxLength={500} onChangeText={setDescription} />
    <View style={styles.row}>
      <Pressable style={[styles.pill, publicMode && styles.active]} onPress={() => setPublicMode(true)}><HCText>Pubblico</HCText></Pressable>
      <Pressable style={[styles.pill, !publicMode && styles.active]} onPress={() => setPublicMode(false)}><HCText>Privato</HCText></Pressable>
    </View>
    <HCText muted style={{ marginBottom: 20 }}>I gruppi e canali privati non compaiono nella ricerca. Gli invitati dovranno accettare prima di entrare.</HCText>
    <Btn label="Crea" onPress={create} busy={busy} />
    <Btn label="Annulla" muted onPress={onCancel} />
  </ScrollView>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginVertical: 15 },
  pill: { paddingHorizontal: 17, paddingVertical: 12, borderRadius: 13, backgroundColor: C.panel2 },
  active: { backgroundColor: C.blue },
});
