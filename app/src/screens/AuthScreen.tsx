import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Btn, Field, HCText } from '../components/UI';
import { supabase } from '../lib/supabase';
import { C } from '../theme/colors';

export function AuthScreen() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || password.length < 6 || (register && !name.trim())) {
      Alert.alert('Controlla i dati', 'Inserisci email, password di almeno 6 caratteri e nome per la registrazione.');
      return;
    }
    setBusy(true);
    try {
      if (register) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(), password,
          options: { data: { display_name: name.trim() } },
        });
        if (error) throw error;
        if (!data.session) Alert.alert('Controlla la tua email', 'Verifica l’indirizzo tramite il link di conferma, poi accedi.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) throw error;
      }
    } catch (e: any) {
      Alert.alert('Accesso non riuscito', e?.message || 'Riprova.');
    } finally { setBusy(false); }
  }

  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
      <Image source={require('../../assets/logo.png')} style={styles.logo} />
      <HCText big style={{ fontSize: 31, textAlign: 'center' }}>HERMANO CHAT</HCText>
      <HCText muted style={{ textAlign: 'center', marginTop: 8, marginBottom: 32 }}>
        Chat private, gruppi, canali e ristoranti verificati.
      </HCText>
      <View style={styles.panel}>
        <HCText big style={{ marginBottom: 18 }}>{register ? 'Crea account gratuito' : 'Accedi'}</HCText>
        {register && <Field placeholder="Nome visualizzato" value={name} onChangeText={setName} maxLength={60} />}
        <Field placeholder="Email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} onChangeText={setEmail} />
        <Field placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        <Btn label={register ? 'Registrati' : 'Entra in HERMANO CHAT'} onPress={submit} busy={busy} />
        <Btn muted label={register ? 'Ho già un account' : 'Non hai un account? Registrati'} onPress={() => setRegister(!register)} />
      </View>
      <HCText muted style={{ fontSize: 12, textAlign: 'center', marginTop: 15 }}>
        Il download e la registrazione sono gratuiti. Non abbiamo ancora attivato abbonamenti o annunci.
      </HCText>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  root: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  panel: { backgroundColor: C.panel, borderColor: C.border, borderWidth: 1, padding: 20, borderRadius: 23 },
  logo: { width: 126, height: 126, borderRadius: 24, alignSelf: 'center', marginBottom: 18 },
});
