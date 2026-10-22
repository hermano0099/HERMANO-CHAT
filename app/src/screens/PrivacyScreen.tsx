import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { HCText } from '../components/UI';
import { C } from '../theme/colors';

const contactValue = Constants.expoConfig?.extra?.privacyContactEmail;
const contactEmail = typeof contactValue === 'string' ? contactValue : '';

export function PrivacyScreen() {
  return <ScrollView contentContainerStyle={styles.root}>
    <HCText big style={styles.title}>Privacy e sicurezza</HCText>
    <HCText style={styles.section}>Dati trattati</HCText>
    <HCText style={styles.body}>
      HERMANO CHAT tratta email e credenziali di accesso, username e nome visualizzato,
      messaggi e allegati inviati, appartenenza alle conversazioni, inviti, blocchi e
      segnalazioni. HERMANO MAP tratta i dati dei locali proposti, inclusi indirizzo e
      coordinate. La ricerca delle città invia il testo cercato al servizio Open-Meteo;
      l’app non raccoglie la posizione GPS del dispositivo.
    </HCText>
    <HCText style={styles.section}>Finalità e servizi</HCText>
    <HCText style={styles.body}>
      I dati sono usati per autenticazione, chat, moderazione, mappa e consegna delle
      notifiche richieste. Database, autenticazione e file sono ospitati da Supabase.
      Le notifiche push usano Expo Push e i servizi Apple o Google del dispositivo;
      il testo dei messaggi non è incluso nelle notifiche. Consulta anche le informative
      dei fornitori per i relativi trattamenti.
    </HCText>
    <HCText style={styles.section}>Accesso e protezione</HCText>
    <HCText style={styles.body}>
      Le chat e i file sono protetti da policy di accesso e Row Level Security.
      I token di accesso sul dispositivo sono conservati in SecureStore su iOS e Android.
      La trasmissione usa TLS. HERMANO CHAT non offre crittografia end-to-end: il servizio
      può tecnicamente accedere ai contenuti necessari a erogare la chat.
    </HCText>
    <HCText style={styles.section}>Conservazione ed eliminazione</HCText>
    <HCText style={styles.body}>
      Puoi richiedere la cancellazione dal Profilo dopo una nuova verifica della password.
      L’account, i messaggi scritti dall’utente, i relativi allegati, token push,
      segnalazioni inviate e blocchi vengono eliminati. Le conversazioni con altri membri
      sono assegnate a un membro rimasto; quelle senza altri membri sono eliminate.
      Le proposte di locali già pubblicate restano senza attribuzione personale. I dati
      necessari a obblighi di legge o alla sicurezza possono essere conservati solo nei
      limiti previsti dalla legge.
    </HCText>
    <HCText style={styles.section}>Diritti e contatto</HCText>
    <HCText style={styles.body}>
      Per richieste di accesso, rettifica o privacy contatta il titolare del servizio
      all’indirizzo {contactEmail || 'da configurare prima del rilascio pubblico'}.
      La pubblicazione richiede anche un’informativa raggiungibile tramite URL pubblico
      negli store.
    </HCText>
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { padding: 22, paddingBottom: 40 },
  title: { marginBottom: 18 },
  section: { color: C.white, fontWeight: '900', marginTop: 16, marginBottom: 6 },
  body: { color: C.muted, lineHeight: 22 },
});
