import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Btn, Field, HCText } from '../components/UI';
import { supabase } from '../lib/supabase';
import { arePushNotificationsEnabled, disablePushNotifications, enablePushNotifications } from '../lib/pushNotifications';
import { C } from '../theme/colors';

export function ProfileScreen({ userId, onPrivacy }: { userId: string; onPrivacy: () => void }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('username,display_name').eq('id', userId).single();
    if (error) Alert.alert('Profilo', error.message);
    if (data) { setUsername(data.username); setName(data.display_name); }
    const { data: { user } } = await supabase.auth.getUser();
    setEmail(user?.email || '');
    try {
      setPushEnabled(await arePushNotificationsEnabled(userId));
    } catch (pushError) {
      Alert.alert('Notifiche', pushError instanceof Error ? pushError.message : 'Impossibile controllare le notifiche.');
    }
  }, [userId]);
  useEffect(() => { load(); }, [load]);
  async function save() {
    const handle = username.trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,25}$/.test(handle) || !name.trim() || name.trim().length > 60) {
      Alert.alert('Dati non validi', 'Username: 3–25 caratteri, lettere minuscole, numeri o _. Nome: 1–60 caratteri.'); return;
    }
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ username: handle, display_name: name.trim() }).eq('id', userId);
    setBusy(false);
    Alert.alert(error ? 'Non salvato' : 'Profilo aggiornato', error?.message || 'Le modifiche sono state salvate.');
  }
  async function signOut() {
    if (pushEnabled) {
      try {
        await disablePushNotifications(userId);
      } catch (error) {
        Alert.alert('Notifiche', error instanceof Error ? error.message : 'Impossibile disattivare le notifiche prima di uscire.');
        return;
      }
    }
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Uscita', error.message);
  }
  async function togglePushNotifications() {
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await disablePushNotifications(userId);
        setPushEnabled(false);
      } else {
        await enablePushNotifications(userId);
        setPushEnabled(true);
      }
      Alert.alert('Notifiche', pushEnabled ? 'Notifiche push disattivate su tutti i dispositivi.' : 'Notifiche push attivate su questo dispositivo.');
    } catch (error) {
      Alert.alert('Notifiche', error instanceof Error ? error.message : 'Impossibile aggiornare le notifiche.');
    } finally {
      setPushBusy(false);
    }
  }
  function requestAccountDeletion() {
    Alert.alert(
      'Eliminare definitivamente l’account?',
      'I tuoi messaggi e allegati saranno eliminati. Le proposte dei locali resteranno senza attribuzione personale. Le conversazioni con altri membri saranno trasferite a un membro rimasto; quelle senza altri membri saranno eliminate.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Continua', style: 'destructive', onPress: () => setDeleteDialogVisible(true) },
      ],
    );
  }
  async function deleteAccount() {
    if (!email || !deletePassword) {
      Alert.alert('Verifica richiesta', 'Inserisci la password per confermare la tua identità.');
      return;
    }
    setDeleteBusy(true);
    try {
      const { error: verificationError } = await supabase.auth.signInWithPassword({
        email,
        password: deletePassword,
      });
      if (verificationError) throw new Error('Password non valida. Verifica la password e riprova.');

      const { error: deletionError } = await supabase.functions.invoke('delete-account', { body: {} });
      if (deletionError) throw deletionError;

      setDeleteDialogVisible(false);
      setDeletePassword('');
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) {
        Alert.alert('Account eliminato', 'L’account è stato eliminato. Chiudi e riapri l’app per cancellare la sessione locale.');
        return;
      }
      Alert.alert('Account eliminato', 'L’account e i dati personali associati sono stati eliminati.');
    } catch (error) {
      Alert.alert('Eliminazione non riuscita', error instanceof Error ? error.message : 'Impossibile eliminare l’account. Riprova.');
    } finally {
      setDeleteBusy(false);
      setDeletePassword('');
    }
  }
  return <>
    <ScrollView contentContainerStyle={styles.root}>
    <View style={styles.brand}><HCText style={{ fontSize: 44, fontWeight: '900' }}>H</HCText></View>
    <HCText big style={{ textAlign: 'center', marginBottom: 6 }}>Il tuo profilo</HCText>
    <HCText muted style={{ textAlign: 'center', marginBottom: 24 }}>{email}</HCText>
    <HCText style={styles.label}>Nome visualizzato</HCText>
    <Field value={name} onChangeText={setName} maxLength={60} placeholder="Nome e cognome" />
    <HCText style={styles.label}>Username univoco</HCText>
    <Field value={username} onChangeText={setUsername} autoCapitalize="none" maxLength={25} placeholder="nomeutente" />
    <HCText muted style={{ fontSize: 12, marginBottom: 16 }}>Gli altri potranno trovarti cercando il tuo username. Non utilizzare dati privati.</HCText>
    <Btn label="Salva modifiche" busy={busy} onPress={save} />
    <View style={{ height: 8 }} />
    <Btn muted label={pushEnabled ? 'Disattiva notifiche push' : 'Attiva notifiche push'} busy={pushBusy} onPress={togglePushNotifications} />
    <HCText muted style={{ fontSize: 12, marginBottom: 16 }}>Le notifiche push richiedono l’app installata e una build Expo configurata.</HCText>
    <View style={{ height: 18 }} />
    <Btn muted label="Privacy e sicurezza" onPress={onPrivacy} />
    <Btn muted label="Esci dall'account" onPress={signOut} />
    <View style={{ height: 8 }} />
    <Btn danger label="Elimina account" onPress={requestAccountDeletion} />
    <HCText muted style={{ fontSize: 12, textAlign: 'center', marginTop: 15 }}>HERMANO CHAT · Beta 0.1.0. Nessun acquisto integrato attivo.</HCText>
    </ScrollView>
    <Modal
      transparent
      visible={deleteDialogVisible}
      animationType="fade"
      onRequestClose={() => setDeleteDialogVisible(false)}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <HCText big style={{ marginBottom: 8 }}>Conferma eliminazione</HCText>
          <HCText muted style={{ lineHeight: 21, marginBottom: 14 }}>
            Per proteggere il tuo account, verifica nuovamente la password. L’eliminazione non può essere annullata.
          </HCText>
          <Field
            value={deletePassword}
            onChangeText={setDeletePassword}
            placeholder="Password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!deleteBusy}
            onSubmitEditing={deleteAccount}
            returnKeyType="done"
          />
          <Btn danger label="Elimina definitivamente" busy={deleteBusy} onPress={deleteAccount} />
          <Pressable
            accessibilityRole="button"
            disabled={deleteBusy}
            onPress={() => {
              setDeleteDialogVisible(false);
              setDeletePassword('');
            }}
            style={styles.cancel}
          >
            <HCText muted style={{ textAlign: 'center', fontWeight: '700' }}>Annulla</HCText>
          </Pressable>
        </View>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  root: { padding: 24, flexGrow: 1 },
  brand: { alignSelf: 'center', marginTop: 23, marginBottom: 20, width: 100, height: 100, borderRadius: 25, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '800', marginBottom: 8 },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: '#000000B8' },
  modalCard: { backgroundColor: C.panel, borderColor: C.border, borderWidth: 1, borderRadius: 18, padding: 20 },
  cancel: { paddingVertical: 12 },
});
