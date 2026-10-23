# HERMANO CHAT — base mobile indipendente da Emergent

**Versione:** 0.1 MVP, 18 ottobre 2026. Creato come **nuovo progetto**, senza usare né copiare il codice di Emergent. Non è un'app già pubblicata, né un APK/IPA.

## Cosa contiene già il codice

- App iOS/Android in **React Native / Expo SDK 57**, stile **blu elettrico + bianco**.
- Registrazione/accesso **email + password** con Supabase Auth, sessione persistente.
- Profili, `@username`, ricerca utenti e creazione di chat private.
- **Messaggi testuali reali** su Postgres, caricati da Supabase, con aggiornamento tramite Supabase Realtime.
- Invio e riproduzione di **foto e video** nelle chat tramite Supabase Storage privato.
- Registrazione, anteprima, invio, ascolto e pausa di **messaggi vocali** nelle chat private, nei gruppi e nei canali autorizzati; durata audio salvata insieme al messaggio.
- Risposte a messaggi specifici in chat private, gruppi e canali autorizzati, con anteprima citata nel messaggio e nel compositore.
- Ricerca nei messaggi, inoltro di testo e allegati, modifica dei propri messaggi e cancellazione logica che conserva il contenuto originale; indicatore in-app dei messaggi non letti.
- Inviti ai gruppi e canali privati con accettazione o rifiuto del destinatario; i badge in-app contano anche gli inviti in attesa.
- Notifiche push Expo opzionali per i nuovi messaggi, con apertura diretta della conversazione e senza testo del messaggio nel contenuto push.
- Creazione **gruppi** e **canali**, pubblici/privati, ingresso nei pubblici, aggiunta membri tramite username da parte del proprietario.
- **HERMANO MAP**: mappa interattiva, solo locali **approvati**; suggerimento nuovi ristoranti e approvazione/rifiuto dal pannello amministratore.
- **Segnala messaggio**, **blocca utente** (impedisce l'invio nella chat privata) e sblocca.
- Policy RLS per proteggere chat private e contenuti dei gruppi, ruolo amministratore non assegnabile dall'app.

La cancellazione dell'account con verifica password, pulizia dei messaggi/allegati, conservazione anonima delle proposte e informativa privacy in-app sono implementate. Prima di un lancio pubblico restano da applicare e verificare sul progetto remoto le migration, distribuire le funzioni edge, configurare variabili e credenziali EAS, testare con due account e dispositivi reali e completare gli adempimenti e i dati del titolare negli store. La chiave Google Maps Android e il contatto privacy sono obbligatori per il profilo EAS production. Le verifiche CI controllano tipi, configurazione e bundle, ma non sostituiscono i test su Supabase e dispositivi reali. `npm audit --omit=dev` segnala vulnerabilità alte transitive in `braces` e `node-forge`; non è stato applicato il downgrade incompatibile proposto dall’audit e al momento non risultano release corrette disponibili. Ricontrollare gli advisory prima di ogni build. **Non** implementa crittografia end-to-end. **Nessuna** pubblicità o pagamenti sono attivi. Non dichiarare l'app pronta prima del collaudo reale e della revisione privacy/legale.

## 1. Prima di avviare: collega il TUO Supabase

1. Apri [Supabase](https://supabase.com/dashboard), entra nel progetto che hai chiamato **HERMANO CHAT**.
2. Apri **SQL Editor**, crea una nuova query e incolla **l'intero file** `supabase/migrations/001_hermano_chat.sql`, poi premi **Run** **una sola volta**. Va eseguito su uno schema senza tabelle omonime. Fai un backup se ne hai già create.
3. Applica le migration non ancora eseguite, in ordine, da `002_map_city_channel.sql` fino a `011_validate_forwarded_content.sql`. Se le prime migration sono già state applicate, esegui solo quelle mancanti. La 010 abilita eliminazione account, rimozione dei messaggi e file personali, trasferimento dei gruppi/canali a un membro rimasto e anonimizzazione delle proposte dei locali. La 011 aggiorna la validazione degli inoltri anche se la migration 007 era già stata eseguita. Esegui prima un backup e collauda le migration su un progetto Supabase di staging. Non rilanciare migration già applicate salvo le istruzioni esplicite nel relativo file.
4. In **Authentication > Providers > Email**, controlla l'autenticazione email. Se la conferma email è attiva, verifica il link di conferma prima di fare login.
5. Recupera **Project URL** e **Publishable key** (o, nei vecchi progetti, `anon` public key) da **Project Settings > API Keys** / **Connect**.
6. Duplica `.env.example` in `.env` e sostituisci solo le due variabili:

```env
EXPO_PUBLIC_SUPABASE_URL=https://progetto.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

**Non inserire mai la `service_role` key, una secret key, una password o un access token in `.env`, in GitHub o in questa chat.** `.env` è escluso automaticamente da Git con `.gitignore`. Queste variabili Expo sono pubbliche, quindi tutta la sicurezza dipende dalle policy RLS.

## 1.1 Notifiche push (configurazione necessaria per il rilascio)

Le notifiche push sono facoltative e si attivano dal Profilo. Dopo aver applicato `008_push_notifications.sql`:

1. Distribuisci `supabase/functions/push-notification` come funzione Supabase `push-notification` con verifica JWT abilitata. La funzione richiede le variabili Supabase standard del progetto; l'eventuale `EXPO_ACCESS_TOKEN` va configurato solo come secret server-side, mai nell'app.
2. Configura APNs per iOS e Firebase Cloud Messaging (FCM v1) per Android nelle credenziali EAS del progetto.
3. Crea una build iOS/Android installabile: le push remote non sono verificabili in modo affidabile in Expo Go o su simulatore.
4. Attiva le notifiche sul dispositivo dalla schermata Profilo e verifica ricezione, tap per aprire la chat e disattivazione.

La funzione invia un avviso generico, non il testo del messaggio. Il repository non contiene credenziali APNs/FCM o token Expo; non inviare mai queste chiavi in chat.
L’invio dei messaggi non attende la consegna push: se il servizio notifiche non è disponibile, il messaggio resta inviato e la notifica può non arrivare.

## 1.2 Eliminazione account e ambiente release

- Distribuisci `supabase/functions/delete-account` e `supabase/functions/push-notification` con verifica JWT abilitata. `supabase/config.toml` imposta `verify_jwt = true`.
- La cancellazione richiede una nuova verifica password, rimuove i messaggi e i media dell’utente e trasferisce le community con membri rimasti. Provala prima su un progetto staging e verifica i casi di account proprietario di gruppo/canale.
- Imposta nell’ambiente EAS `production` `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `PRIVACY_CONTACT_EMAIL`; la build Android richiede anche `GOOGLE_MAPS_ANDROID_API_KEY` (non necessaria per iOS). La build production rifiuta URL Supabase non HTTPS, credenziali mancanti o chiavi non publishable (è supportata anche la vecchia chiave `anon` JWT); verifica inoltre che tutte le migration necessarie siano applicate al progetto corretto. Non inserire `service_role` o token server nell’app. La chiave Google va limitata al package `com.hermanodelsur.chat` e alle impronte di firma corrette.
- Completa [PRIVACY.md](./PRIVACY.md) con identità/indirizzo del titolare, basi giuridiche e conservazione validate; pubblica l’informativa a un URL HTTPS e inserisci URL, contatto, termini e dichiarazioni dati nelle schede Apple/Google.
- Configura credenziali EAS di firma iOS/Android e APNs/FCM v1, poi crea build installabili. Controlla `eas.json`: produzione genera Android App Bundle e release channel.

## 2. Avvia Expo

Requisiti: Node.js 22.13+ e npm (oppure GitHub Codespaces). Nel terminale della cartella del progetto:

```sh
npm install
npx expo install --fix
npm run typecheck
npm run start
```

`npm run release:check` esegue typecheck, test di configurazione, verifica Expo e Expo Doctor. La GitHub Action esporta i bundle iOS e Android; questi controlli non simulano Supabase né dispositivi reali.

Il comando `start` usa un tunnel Expo per consentire l'apertura dall'iPhone anche quando il server non è sulla stessa rete. Alla prima esecuzione potresti dover consentire l'installazione di `@expo/ngrok`; non è necessario pagare Emergent. Apri il link `exp://...` su iPhone con **Expo Go** (o scansiona QR da un altro dispositivo). La versione di Expo Go deve supportare SDK 57.

Se vuoi partire da un computer sulla stessa rete Wi-Fi usa `npm run start:local`.

**Limite tecnico:** l’esportazione del bundle non prova autenticazione, RLS, notifiche remote, acquisti, firma o funzionamento su dispositivi reali. Non pubblicare finché i collaudi della sezione 5 non sono completati.

## 3. Salva il progetto nel tuo GitHub `hermano-chat`

Il codice dell'app è nella cartella `app/` di questo repository. Da un computer o da **GitHub Codespaces**:

1. Apri/clona il repository e configura GitHub con un account autorizzato a scrivere.
2. Nel terminale esegui:

```sh
cd app
npm ci
cp .env.example .env
```

3. Inserisci in `app/.env` solo l'URL e la chiave **publishable** di Supabase, poi prova `npm run release:check` e `npm run start`.
4. Da Git root, controlla esattamente cosa stai pubblicando e poi crea il commit:

```sh
git status --short
git add .gitignore .github/workflows/mobile-release-check.yml app/
git diff --cached --check
git commit -m "Complete HERMANO CHAT mobile MVP"
git push origin main
```

`app/.env`, `node_modules/` e gli output Expo sono esclusi da Git. Non usare `git add -f` per forzarli e non pubblicare chiavi segrete.

## 4. Attiva il pannello amministratore HERMANO MAP

Dopo che avrai creato e confermato un account dentro l'app, vai in Supabase **SQL Editor** ed esegui, sostituendo il tuo username reale:

```sql
insert into public.app_admins(user_id)
select id from public.profiles where username = 'tuo_username';
```

L'username automatico al primo accesso sarà simile a `user_abcd...`: puoi cambiarlo in **Profilo**. Esci e rientra nell'app dopo aver assegnato il ruolo. Gli utenti comuni possono **proporre** ristoranti ma non approvarli, né contrassegnarli come sponsorizzati. I locali pendenti non appaiono sulla mappa pubblica.

## 5. Test minimo obbligatorio

1. Registra utente A e utente B con **email differenti**.
2. Da A cerca l'username di B, apri una chat e scrivi un messaggio.
3. Da B apri la chat e verifica che sia arrivato; chiudi e riapri la app, controllando che rimanga memorizzato.
4. Da A crea un gruppo pubblico: da B entra e manda un messaggio.
5. Da A crea un canale: verifica che B possa leggere **ma non scrivere**.
6. Da B proponi un ristorante e verifica che **non** appaia ancora nella mappa pubblica. Dall'account admin approva e verifica che ora compaia.
7. Verifica che un utente esterno non possa leggere chat private di altri utenti (test RLS).
8. Blocca e sblocca un altro utente e verifica le restrizioni di invio.
9. Prova Internet assente, dati errati, password sbagliate e registrazione con conferma email.
10. Nelle chat, invia una foto e un video da un account e verifica che entrambi si vedano e si riproducano solo per i membri della conversazione.
11. Da iPhone, registra, ascolta, metti in pausa e invia un vocale; verifica la durata e la riproduzione dall'altro membro.
12. Usa **Rispondi** su un messaggio testuale e su un allegato in una chat privata e in un gruppo; verifica anteprima, invio e persistenza dopo la riapertura. In un canale prova la risposta dall'account proprietario, mantenendo la sola lettura per gli altri membri.
13. Cerca una parola nella cronologia della chat e verifica che i risultati non includano messaggi eliminati. Da A inoltra un testo e un allegato a un'altra chat; modifica un proprio messaggio e prova a modificare quello di B. Elimina logicamente un messaggio e verifica che scompaia il contenuto visualizzato ma resti il segnaposto e che il conteggio non letti si aggiorni. Controlla il badge globale mentre l'app è aperta.
14. Da A invita B a un gruppo/canale privato: B deve poter accettare o rifiutare prima dell'ingresso. Verifica che un utente non invitato non possa leggere i messaggi né aggiungersi tramite API.
15. Attiva le push dal Profilo su entrambi i telefoni; invia un messaggio con l'app del destinatario chiusa, apri la notifica e verifica che conduca alla conversazione senza mostrare il testo del messaggio.
16. Prova la cancellazione su account di staging: password errata, account proprietario con altri membri, account proprietario senza membri, media audio/video/foto, sessione su secondo dispositivo e assenza dei dati cancellati. Verifica che i locali restino anonimi e le community superstiti abbiano un nuovo proprietario.

## Monetizzazione futura (NON integrata)

Il download sarà gratuito. Solo **dopo** il primo rilascio e dopo verifiche degli store: funzioni Premium (tramite acquisti in-app conformi alle regole Apple e Google), profili locali sponsorizzati chiaramente etichettati, e annunci rispettosi della privacy. Serviranno un'integrazione pagamenti, un database ordini e un controllo abbonamenti lato server. **Non inserire annunci nelle chat private.**

## Note tecniche / sicurezza

- Per le prime prove usiamo Supabase **Postgres Changes** su `messages`; a scala maggiore preferire **Realtime Broadcast** e test di carico.
- Le policy RLS proteggono in lettura i messaggi dei membri. Le funzioni `SECURITY DEFINER` sono limitate al caso d'uso; **prima del rilascio occorre un audit indipendente**.
- Per i gruppi e canali privati, l'invito del proprietario resta in attesa finché il destinatario non lo accetta; può anche rifiutarlo. I pubblici mantengono l'ingresso diretto.
- Gli utenti sono ricercabili quando registrati; per il lancio serviranno controlli di privacy della ricerca e prevenzione degli abusi.
- La mappa parte da Bari, modificabile nel file `src/screens/MapScreen.tsx`.
- **Logo:** `assets/logo.png` è ricavato da un ritaglio dello screenshot fornito (qualità ridotta). Sostituiscilo con il file originale del tuo logo prima del lancio; `assets/icon.png` è la sua copia destinata all'icona.
- La registrazione e gli elementi di profilo sono in italiano. Eventuali immagini profilo reali e media richiedono Supabase Storage con relative policy.

## Struttura

```
App.tsx                        navigazione base e autenticazione
src/screens/                   schermate Expo
src/lib/supabase.ts            client, autenticazione persistente
src/lib/pushNotifications.ts   consenso push, token e invio server-side
src/theme/                     palette
src/types/                     modelli TypeScript
supabase/migrations/           schema, RLS, realtime, inviti, push e admin
supabase/functions/            invio push autenticato lato server
assets/                        logo e icona provvisori
.env.example                   nomi variabili (non segreti)
```

Fonti tecniche: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Supabase Expo](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Realtime](https://supabase.com/docs/guides/realtime/postgres-changes).
