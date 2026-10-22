# HERMANO CHAT — Guida per iPhone

Questa cartella è una **prima base tecnica originale** di HERMANO CHAT, non un'esportazione di Emergent.

## 1. Cosa è stato preparato

- App Expo / React Native per **iOS e Android**, stile blu elettrico e bianco.
- Registrazione email/password e profilo pubblico con username.
- Ricerca utenti e avvio di chat private tra **due account reali**.
- Salvataggio di messaggi su Supabase, sottoscrizione Realtime e lettura solo da membri autorizzati.
- Invio e riproduzione di foto e video nelle chat con Supabase Storage privato.
- Registrazione, anteprima, invio e ascolto con pausa dei messaggi vocali nelle chat private, nei gruppi e nei canali autorizzati.
- Risposte a messaggi specifici con anteprima citata nelle chat private, nei gruppi e nei canali autorizzati.
- Gruppi e canali pubblici/privati, inviti via username, canali a scrittura del proprietario.
- HERMANO MAP: vera mappa e segnaposto dei soli locali approvati, invio di proposte, approvazione admin.
- Segnalazione di singoli messaggi, blocco in chat private, vista admin delle segnalazioni.
- Cancellazione dell’account con nuova verifica password e pulizia dei messaggi e dei media personali.
- Informativa privacy accessibile dal Profilo; sessione protetta con SecureStore su iOS e Android.
- Nessun dato finto nelle chat; download dell'app da rendere **gratuito** quando sarà pubblicata.

## 2. Cosa DEVI fare prima di provarla

Per motivi di sicurezza non ho le credenziali del tuo Supabase. Completa questi passaggi con il tuo account.

### In Supabase

1. Apri il tuo **progetto HERMANO CHAT** su [Supabase](https://supabase.com/dashboard).
2. Se il progetto è vuoto, apri **SQL Editor** e incolla **una volta sola** il contenuto di `supabase/migrations/001_hermano_chat.sql`. Prima di eseguirlo, esamina il contenuto. **NON eseguirlo su un database con tabelle omonime o dati da salvare senza un backup.**
3. Dal SQL Editor applica le migration non ancora eseguite in ordine, dalla `002_map_city_channel.sql` alla `011_validate_forwarded_content.sql`. Se alcune sono già applicate, esegui solo quelle mancanti. La 011 aggiorna il controllo degli inoltri anche se la 007 era già stata eseguita. Fai un backup e testa le migration, inclusa la cancellazione account, su staging prima del progetto di produzione.
4. Nelle impostazioni del progetto, trova il **Project URL** e la **Publishable key** (`sb_publishable_...`). Copiale nel file `.env` seguendo `.env.example`.
5. **Non inserire mai la chiave `service_role`, `sb_secret_...` o password personali nel codice, in GitHub o in ChatGPT.**
6. In Authentication > Providers, controlla che il login con email sia attivo. Se chiedi la conferma email, ogni tester deve confermare il suo account.
7. Crea e verifica il tuo account personale nell'app, quindi cambia lo username nella sezione **Profilo**.
8. Per assegnarti il ruolo admin, solo dal SQL Editor del tuo Supabase, esegui:

   ```sql
   insert into public.app_admins (user_id)
   select id from public.profiles where username = 'IL_TUO_USERNAME'
   on conflict do nothing;
   ```

   Sostituisci `IL_TUO_USERNAME` con quello impostato in app. Poi chiudi e riapri l'app, così compare la scheda **Admin**.

### Configurazione necessaria per build e store

- Configura EAS production con URL e publishable key Supabase, `GOOGLE_MAPS_ANDROID_API_KEY` limitata al package/firme della app e `PRIVACY_CONTACT_EMAIL`.
- Configura firma iOS/Android, APNs e Firebase Cloud Messaging v1 nelle credenziali EAS.
- Completa e pubblica [PRIVACY.md](./PRIVACY.md) a un URL HTTPS e inserisci i dati del titolare, URL privacy, termini, contatto e dichiarazioni di raccolta dati negli store.

### Avvio in Expo Go

Serve un ambiente con **Node.js 22** (computer o Codespaces); Expo Go sul solo iPhone non esegue il sorgente se non è stato avviato il server di sviluppo.

```bash
npm install
npx expo install --check
npx expo start --tunnel
```

Se Expo chiede di sistemare versioni delle librerie, segui `npx expo install --fix` e conserva i file modificati. Apri il QR/link generato in **Expo Go** (SDK 57). Per testare la chat crea **due account email diversi** su due dispositivi.

### Note specifiche per iPhone

- La registrazione usa Expo Audio e salva in AAC/M4A; la riproduzione usa il player audio nativo, anche quando l'iPhone è in modalità silenziosa.
- iOS chiede il permesso microfono quando si tocca il pulsante 🎙. Il testo del permesso è configurato in `app.json`; se l'accesso viene negato, abilitalo da **Impostazioni > HERMANO CHAT > Microfono**.
- Per Expo Go usa una versione compatibile con SDK 57. Se installi la app come build di sviluppo o IPA, rigenera e reinstalla la build dopo aver aggiunto Expo Audio: una build nativa precedente non contiene il modulo né il nuovo testo di autorizzazione.
- La compatibilità è stata controllata a livello di configurazione e tipi, ma non è stata provata su un iPhone fisico in questa sessione. Prima della pubblicazione verifica registrazione, anteprima, invio e ascolto su un dispositivo reale.

## 3. Test fondamentali

1. Iscriviti con Account A; modifica lo username (es. `hermano_admin`).
2. Registrati con Account B, ad esempio `tester_01`.
3. Da A vai a **Cerca** e cerca `tester_01`; crea chat e invia il messaggio `prova 123`.
4. Da B apri la chat, controlla che il messaggio appaia. Rispondi.
5. Chiudi e riapri: i messaggi devono rimanere.
6. Crea gruppo pubblico, entra da B; verifica che un altro utente che non è membro non possa leggere una chat privata.
7. Proponi un ristorante: non deve apparire prima dell'approvazione dal pannello Admin.
8. Verifica che gli utenti normali non possano approvare locali o leggere messaggi di chat altrui.
9. Invia una foto e un video in una chat e verifica che siano visibili solo ai membri.
10. Su iPhone, registra un vocale, ascoltalo e mettilo in pausa nell'anteprima, invialo e controlla dall'altro account durata e riproduzione. Verifica anche che un non membro non riesca a generare l'accesso all'allegato audio.
11. Tocca **Rispondi** su un messaggio in chat privata, gruppo e canale autorizzato; controlla l'anteprima citata prima dell'invio e nel messaggio inviato, anche dopo aver riaperto la chat.

## 4. Cosa NON è ancora pronto

- Non ho potuto lanciare l'app su un iPhone né verificare realmente un database Supabase (mancano l'accesso al dispositivo, al progetto e alle credenziali).
- La protezione dei messaggi avviene tramite **RLS e connessione TLS Supabase**; **NON è crittografia end-to-end**.
- Mancano la protezione anti-spam/rate limiting su server, strumenti completi di moderazione e ban, invio documenti, avatar, backup e monitoraggio.
- Le push sono implementate ma facoltative: prima del rilascio vanno configurati APNs e Firebase Cloud Messaging nelle credenziali EAS e testate su dispositivi reali.
- La ricerca username non ha debouncing e usa query semplici: da ottimizzare prima di grandi numeri di utenti.
- Prima del lancio sono obbligatori i test reali su due account/dispositivi, database Supabase di staging/produzione e notifiche remote. Il piano gratuito di Supabase ha limiti che vanno controllati.
- La privacy policy inclusa è una bozza tecnica, non una validazione legale: il titolare deve completare i dati personali, basi giuridiche, retention, termini e URL pubblico.
- Nessun abbonamento, sponsorizzazione, acquisto in-app o servizio pubblicitario è stato ancora attivato. **Non ci sono entrate automatiche per download gratuito.**
- L'icona `H` negli assets è **temporanea**; potrai sostituirla con il logo ufficiale che hai già disegnato.

## 5. Prezzi

Il codice del progetto qui fornito non richiede Emergent. Usare Expo Go in sviluppo e iniziare sul piano Free di Supabase può non richiedere pagamenti, entro i limiti del servizio. Pubblicazione App Store / Google Play, build, servizi esterni o uso intensivo possono comportare spese.

## 6. Struttura

- `App.tsx` — navigazione essenziale e sessione
- `src/screens/` — chat, accesso, ricerca, mappa, profilo e moderazione
- `src/lib/supabase.ts` — configurazione del client Supabase
- `supabase/migrations/001_hermano_chat.sql` — schema dati, funzioni e RLS
- `.env.example` — solo segnaposto delle chiavi pubblicabili
- `assets/` — icona temporanea da sostituire

---

**Prossimo passo consigliato:** collegare il repository GitHub `hermano-chat` qui a ChatGPT oppure caricare lo ZIP con un ambiente di sviluppo, quindi collegare Supabase in modo sicuro.
