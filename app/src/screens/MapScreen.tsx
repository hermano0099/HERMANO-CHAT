import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Btn, Empty, Field, HCText } from '../components/UI';
import { supabase } from '../lib/supabase';
import { C } from '../theme/colors';
import type { Conversation, Restaurant } from '../types/models';

// Open-Meteo geocoding: versione gratuita solo per prove NON commerciali.
// Per la pubblicazione/sponsorizzazioni è necessario un servizio geocoding con licenza adeguata.
type CityResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  admin2?: string;
};

export function MapScreen({ userId, onChat }: {
  userId: string;
  isAdmin: boolean;
  onChat: (conversation: Conversation, title: string) => void;
}) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [propose, setPropose] = useState(false);
  const [name, setName] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [citySelected, setCitySelected] = useState<CityResult | null>(null);
  const [cityResults, setCityResults] = useState<CityResult[]>([]);
  const [searchingCity, setSearchingCity] = useState(false);
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [channelId, setChannelId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Conversation[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('restaurants').select('*')
      .eq('status', 'approved').order('sponsored', { ascending: false }).order('name');
    setLoading(false);
    if (error) Alert.alert('HERMANO MAP', error.message);
    else setRestaurants((data || []) as Restaurant[]);
  }, []);

  const loadChannels = useCallback(async () => {
    const { data, error } = await supabase.from('conversations').select('*')
      .eq('kind', 'channel').eq('is_public', true).order('title').limit(100);
    if (error) console.warn('Caricamento canali:', error.message);
    else setChannels((data || []) as Conversation[]);
  }, []);

  useEffect(() => { load(); loadChannels(); }, [load, loadChannels]);

  async function searchCities() {
    const search = cityQuery.trim();
    if (search.length < 3) {
      Alert.alert('Città', 'Scrivi almeno 3 lettere della città italiana.');
      return;
    }
    setSearchingCity(true);
    setCitySelected(null);
    setCityResults([]);
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(search)}&count=10&language=it&countryCode=IT`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Servizio città momentaneamente non disponibile');
      const json = await response.json();
      const options = (json.results || []).filter((r: CityResult) =>
        Number.isFinite(r.latitude) && Number.isFinite(r.longitude)) as CityResult[];
      setCityResults(options);
      if (!options.length) Alert.alert('Città non trovata', 'Prova con il nome della città senza abbreviazioni.');
    } catch (error: any) {
      Alert.alert('Ricerca città', error?.message || 'Controlla la connessione e riprova.');
    } finally { setSearchingCity(false); }
  }

  function selectCity(item: CityResult) {
    setCitySelected(item);
    setCityQuery(item.name);
    setCityResults([]);
  }

  async function submit() {
    if (name.trim().length < 2 || !citySelected) {
      Alert.alert('Dati incompleti', 'Inserisci il nome del ristorante, cerca la città e selezionala dai risultati.');
      return;
    }
    if (website.trim() && !/^https:\/\/[^\s]+\.[^\s]+/i.test(website.trim())) {
      Alert.alert('Sito web', 'Inserisci un indirizzo valido che inizi con https:// oppure lascia il campo vuoto.');
      return;
    }
    // Il campo address esistente nel database è obbligatorio; registriamo la città
    // e NON la via o l'indirizzo personale del locale.
    const area = citySelected.admin2 || citySelected.admin1 || 'Italia';
    const cityLabel = `${citySelected.name}, ${area}, Italia`.slice(0, 220);
    setSending(true);
    const { error } = await supabase.from('restaurants').insert({
      name: name.trim(),
      address: cityLabel,
      description: description.trim(),
      latitude: citySelected.latitude,
      longitude: citySelected.longitude,
      website: website.trim() || null,
      channel_id: channelId,
      submitted_by: userId,
      status: 'pending',
      sponsored: false,
    });
    setSending(false);
    if (error) {
      Alert.alert('Invio non riuscito', error.message);
    } else {
      setPropose(false); setName(''); setCityQuery(''); setCitySelected(null);
      setCityResults([]); setDescription(''); setWebsite(''); setChannelId(null);
      Alert.alert('Proposta inviata', 'Il ristorante apparirà sulla mappa soltanto dopo le verifiche del team. La posizione sarà indicativa, al centro della città.');
    }
  }

  function showCity(restaurant: Restaurant) {
    const query = encodeURIComponent(`${restaurant.latitude},${restaurant.longitude}`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`)
      .catch(() => Alert.alert('Impossibile aprire la mappa esterna'));
  }

  async function openLinkedChannel(restaurant: Restaurant) {
    if (!restaurant.channel_id) return;
    const { data, error } = await supabase.from('conversations').select('*')
      .eq('id', restaurant.channel_id).eq('kind', 'channel').eq('is_public', true).maybeSingle();
    if (error || !data) {
      Alert.alert('Canale non disponibile', 'Il canale non è più pubblico oppure non esiste.');
      return;
    }
    const channel = data as Conversation;
    const { error: joinError } = await supabase.from('conversation_members')
      .upsert({ conversation_id: channel.id, user_id: userId, role: 'member' },
        { onConflict: 'conversation_id,user_id', ignoreDuplicates: true });
    if (joinError) {
      Alert.alert('Impossibile aprire il canale', joinError.message);
      return;
    }
    onChat(channel, channel.title);
  }

  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 15, paddingBottom: 35 }}>
    <HCText style={{ fontSize: 15, marginBottom: 10 }}>Solo ristoranti controllati e approvati dal nostro team. Le sponsorizzazioni sono indicate separatamente.</HCText>
    <View style={styles.mapContainer}>
      <MapView style={{ flex: 1 }} initialRegion={{ latitude: 42.5, longitude: 12.5, latitudeDelta: 14, longitudeDelta: 14 }}>
        {restaurants.map(r => <Marker key={r.id} coordinate={{ latitude: r.latitude, longitude: r.longitude }}
          title={r.name} description={r.address} pinColor={r.sponsored ? '#FFB700' : C.blue}
          onPress={() => setSelected(r)} />)}
      </MapView>
    </View>
    {selected && <View style={styles.card}>
      <HCText style={styles.title}>{selected.name} {selected.sponsored ? ' · Sponsorizzato' : ''}</HCText>
      <HCText muted>{selected.address}</HCText>
      <HCText style={{ marginTop: 7 }}>{selected.description}</HCText>
      <HCText muted style={{ marginTop: 7, fontSize: 12 }}>Il segnaposto indica la città, non necessariamente l'indirizzo preciso del locale.</HCText>
      {selected.channel_id && <Btn label="Apri canale HERMANO CHAT" onPress={() => openLinkedChannel(selected)} style={{ marginTop: 10 }} />}
      {selected.website && /^https:\/\//i.test(selected.website) &&
        <Btn muted label="Apri sito web" onPress={() => Linking.openURL(selected.website!).catch(() => Alert.alert('Link non disponibile'))} />}
      <Btn muted label="Visualizza posizione indicativa" onPress={() => showCity(selected)} style={{ marginTop: 10 }} />
    </View>}
    <HCText style={[styles.title, { marginTop: 20 }]}>Ristoranti verificati ({restaurants.length})</HCText>
    {loading && <ActivityIndicator color={C.blue2} />}
    {restaurants.length === 0 && !loading && <Empty message="Non ci sono ancora ristoranti approvati. La mappa si riempirà dopo le verifiche del team." />}
    {restaurants.map(r => <Pressable key={r.id} onPress={() => setSelected(r)} style={styles.item}>
      <View style={styles.pin}><HCText>⌖</HCText></View>
      <View style={{ flex: 1 }}>
        <HCText style={{ fontWeight: '800' }}>{r.name}</HCText>
        <HCText muted>{r.address}</HCText>
        {r.sponsored && <HCText style={{ color: '#FFC56A', fontSize: 12 }}>Sponsorizzato</HCText>}
      </View>
      <HCText style={{ color: C.blue2 }}>Vedi ›</HCText>
    </Pressable>)}
    <View style={{ height: 18 }} />
    <Btn muted label={propose ? 'Chiudi proposta' : '+ Proponi un ristorante'} onPress={() => { setPropose(p => !p); loadChannels(); }} />
    {propose && <View style={styles.card}>
      <HCText style={styles.title}>Proponi un ristorante</HCText>
      <HCText muted style={{ marginBottom: 12 }}>Basta scegliere la città: nessuna via o coordinata GPS. Il team controllerà la proposta prima di pubblicarla.</HCText>
      <Field placeholder="Nome del ristorante" value={name} onChangeText={setName} maxLength={100} />
      <Field placeholder="Città (es. Bari, Roma, Milano)" value={cityQuery} onChangeText={value => {
        setCityQuery(value); setCitySelected(null); setCityResults([]);
      }} maxLength={90} />
      <Btn muted label={searchingCity ? 'Ricerca in corso...' : 'Cerca città'} busy={searchingCity} onPress={searchCities} />
      {cityResults.map(item => <Pressable key={`${item.id}-${item.name}`} style={styles.cityOption} onPress={() => selectCity(item)}>
        <HCText>{item.name}{item.admin2 ? ` · ${item.admin2}` : ''}{item.admin1 ? ` · ${item.admin1}` : ''}</HCText>
        <HCText muted style={{ fontSize: 12 }}>Italia · Seleziona questa città</HCText>
      </Pressable>)}
      {citySelected && <HCText style={{ marginVertical: 8, color: '#80E0A0' }}>✓ Città selezionata: {citySelected.name}{citySelected.admin1 ? ` (${citySelected.admin1})` : ''}</HCText>}
      <HCText style={{ marginTop: 14, marginBottom: 7, fontWeight: '800' }}>Canale HERMANO CHAT (facoltativo)</HCText>
      <HCText muted style={{ marginBottom: 8, fontSize: 12 }}>Scegli un canale pubblico già creato nell'app. Sarà apribile dalla scheda del locale.</HCText>
      <Pressable style={[styles.cityOption, !channelId && styles.optionSelected]} onPress={() => setChannelId(null)}>
        <HCText>Nessun canale</HCText>
      </Pressable>
      {channels.map(channel => <Pressable key={channel.id}
        style={[styles.cityOption, channelId === channel.id && styles.optionSelected]}
        onPress={() => setChannelId(channel.id)}>
        <HCText>{channelId === channel.id ? '✓ ' : ''}{channel.title}</HCText>
      </Pressable>)}
      {!channels.length && <HCText muted style={{ fontSize: 12, marginBottom: 10 }}>Non ci sono ancora canali pubblici. Puoi crearne uno nella sezione Cerca → Canali.</HCText>}
      <Field placeholder="Sito web https://... (facoltativo)" autoCapitalize="none" value={website} onChangeText={setWebsite} />
      <Field placeholder="Descrizione (facoltativa)" value={description} onChangeText={setDescription} maxLength={700} multiline />
      <HCText muted style={{ fontSize: 11, marginBottom: 10 }}>Ricerca città: dati Open-Meteo (CC BY 4.0). Utilizzo gratuito limitato a prototipi non commerciali.</HCText>
      <Btn label="Invia per approvazione" onPress={submit} busy={sending || searchingCity} />
    </View>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  mapContainer: { height: 280, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  card: { backgroundColor: C.panel, borderColor: C.border, borderWidth: 1, padding: 15, marginTop: 13, borderRadius: 16 },
  title: { fontSize: 18, fontWeight: '900', marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderColor: C.border },
  pin: { width: 43, height: 43, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  cityOption: { borderWidth: 1, borderColor: C.border, backgroundColor: C.panel2, borderRadius: 12, padding: 11, marginBottom: 7 },
  optionSelected: { borderColor: C.blue, backgroundColor: C.panel },
});
