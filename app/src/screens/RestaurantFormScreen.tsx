import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Btn, Field, HCText } from '../components/UI';
import { supabase } from '../lib/supabase';

type Coord = { latitude: number; longitude: number };
export function RestaurantFormScreen({ coordinate, userId, onDone, onCancel }: {
  coordinate: Coord; userId: string; onDone: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [lat, setLat] = useState(String(coordinate.latitude));
  const [lng, setLng] = useState(String(coordinate.longitude));
  const [busy, setBusy] = useState(false);
  async function submit() {
    const latitude = Number(lat.replace(',', '.'));
    const longitude = Number(lng.replace(',', '.'));
    if (name.trim().length < 2 || address.trim().length < 4 || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      Alert.alert('Controlla i dati', 'Nome, indirizzo e coordinate valide sono obbligatori.'); return;
    }
    if (website && !/^https?:\/\//i.test(website)) { Alert.alert('Sito non valido', 'Il sito deve iniziare con https://'); return; }
    setBusy(true);
    const { error } = await supabase.from('restaurants').insert({
      name: name.trim(), address: address.trim(), description: description.trim(),
      website: website.trim() || null, latitude, longitude, submitted_by: userId,
      status: 'pending', sponsored: false,
    });
    setBusy(false);
    if (error) Alert.alert('Invio non riuscito', error.message);
    else { Alert.alert('Proposta ricevuta', 'Il ristorante apparirà sulla mappa solo dopo l’approvazione del team.'); onDone(); }
  }
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
    <HCText big>Proponi un ristorante</HCText>
    <HCText muted style={{ marginVertical: 12 }}>Il locale sarà inizialmente in attesa di verifica. Nessuna pubblicazione automatica.</HCText>
    <Field placeholder="Nome del ristorante" value={name} onChangeText={setName} />
    <Field placeholder="Indirizzo completo" value={address} onChangeText={setAddress} />
    <Field placeholder="Descrizione" value={description} onChangeText={setDescription} multiline />
    <Field placeholder="Sito web (facoltativo)" value={website} onChangeText={setWebsite} autoCapitalize="none" />
    <HCText muted style={{ marginBottom: 5 }}>Latitudine</HCText>
    <Field value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" />
    <HCText muted style={{ marginBottom: 5 }}>Longitudine</HCText>
    <Field value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" />
    <Btn label="Invia per approvazione" busy={busy} onPress={submit} />
    <Btn muted label="Annulla" onPress={onCancel} />
  </ScrollView>;
}
