import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Btn, Empty, HCText } from '../components/UI';
import { supabase } from '../lib/supabase';
import { C } from '../theme/colors';
import type { Restaurant } from '../types/models';

type Report = { id: string; reason: string; target_user_id: string | null; target_message_id: string | null; created_at: string; };
export function AdminScreen() {
  const [pending, setPending] = useState<Restaurant[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const [a, b] = await Promise.all([
      supabase.from('restaurants').select('*').eq('status', 'pending').order('created_at'),
      supabase.from('reports').select('id,reason,target_user_id,target_message_id,created_at').order('created_at', { ascending: false }).limit(50),
    ]);
    setBusy(false);
    if (a.error || b.error) Alert.alert('Moderazione', (a.error || b.error)?.message);
    else { setPending((a.data || []) as Restaurant[]); setReports((b.data || []) as Report[]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function moderate(id: string, decision: 'approved' | 'rejected') {
    setBusy(true);
    const { error } = await supabase.rpc('review_restaurant', { p_restaurant: id, p_status: decision });
    setBusy(false);
    if (error) Alert.alert('Operazione non riuscita', error.message);
    else load();
  }
  return <ScrollView contentContainerStyle={styles.root}>
    <HCText style={styles.section}>Proposte da verificare</HCText>
    <Btn muted label="Aggiorna" onPress={load} busy={busy} />
    {pending.length === 0 && !busy && <Empty message="Nessun ristorante in attesa di approvazione." />}
    {pending.map(r => <View key={r.id} style={styles.card}>
      <HCText style={styles.title}>{r.name}</HCText>
      <HCText muted>{r.address}</HCText>
      <HCText>{r.description}</HCText>
      <HCText muted>{r.latitude}, {r.longitude}</HCText>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <View style={{ flex: 1 }}><Btn label="Approva" disabled={busy} onPress={() => moderate(r.id, 'approved')} /></View>
        <View style={{ flex: 1 }}><Btn danger label="Rifiuta" disabled={busy} onPress={() => moderate(r.id, 'rejected')} /></View>
      </View>
    </View>)}
    <HCText style={[styles.section, { marginTop: 24 }]}>Segnalazioni utenti ({reports.length})</HCText>
    {reports.length === 0 && <Empty message="Nessuna segnalazione." />}
    {reports.map(r => <View key={r.id} style={styles.card}>
      <HCText>{r.reason}</HCText>
      <HCText muted style={{ fontSize: 12 }}>Utente: {r.target_user_id || 'non indicato'}</HCText>
      <HCText muted style={{ fontSize: 12 }}>Messaggio: {r.target_message_id || 'non indicato'}</HCText>
      <HCText muted style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleString('it-IT')}</HCText>
    </View>)}
    <HCText muted style={{ marginTop: 16, fontSize: 12 }}>Beta: il team può vedere le segnalazioni e moderare le proposte. Strumenti completi di rimozione contenuti, sospensione account e audit sono ancora da sviluppare prima del lancio pubblico.</HCText>
  </ScrollView>;
}
const styles = StyleSheet.create({ root: { padding: 15, paddingBottom: 30 }, section: { fontSize: 20, fontWeight: '900', marginBottom: 12 }, title: { fontSize: 17, fontWeight: '800' }, card: { borderWidth: 1, borderColor: C.border, backgroundColor: C.panel, padding: 14, marginBottom: 10, borderRadius: 14, gap: 7 } });
