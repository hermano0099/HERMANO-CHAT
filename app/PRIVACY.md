# Informativa privacy HERMANO CHAT

**Bozza da completare e verificare prima della pubblicazione.** Il titolare deve sostituire i campi tra parentesi con i propri dati reali e verificare finalità, basi giuridiche, tempi di conservazione e fornitori in base al proprio caso. Questo documento non costituisce consulenza legale.

- **Titolare del trattamento:** [ragione sociale/nome e indirizzo del titolare].
- **Contatto privacy:** [indirizzo email configurato anche come `PRIVACY_CONTACT_EMAIL` in EAS].
- **Data di aggiornamento:** 21 ottobre 2026.

## Dati trattati e finalità

HERMANO CHAT tratta email e dati di autenticazione, username, nome visualizzato, messaggi, file multimediali inviati, partecipazione a chat, gruppi, canali e inviti, token push, blocchi e segnalazioni. HERMANO MAP tratta i dati dei locali proposti, inclusi nome, indirizzo e coordinate. La ricerca di città invia il testo cercato al servizio di geocoding Open-Meteo. L’app non richiede né registra la posizione GPS del dispositivo.

I dati sono necessari per autenticare gli utenti, fornire chat e mappa, proteggere gli account, moderare le segnalazioni e inviare notifiche push richieste dall’utente. Le basi giuridiche e i tempi di conservazione devono essere definiti dal titolare prima del rilascio.

## Fornitori e trasferimenti

Database, autenticazione e file sono ospitati da Supabase. Le notifiche usano Expo Push e i servizi push di Apple o Google. La ricerca delle città usa Open-Meteo. Il titolare deve verificare contratti, localizzazione dei dati, sub-responsabili e trasferimenti internazionali dei fornitori effettivamente configurati e aggiungere gli eventuali altri servizi usati.

Le notifiche contengono un avviso generico e l’identificativo della conversazione, non il testo del messaggio. Il token push è salvato per l’account fino alla disattivazione o alla cancellazione dell’account.

## Sicurezza e visibilità

Le chat e gli allegati sono limitati ai membri tramite policy RLS e bucket privato; la trasmissione usa TLS. Le sessioni sui dispositivi iOS e Android sono conservate tramite SecureStore. **Il servizio non implementa crittografia end-to-end** e può tecnicamente accedere ai contenuti necessari a fornire il servizio. I profili e gli username sono ricercabili dagli utenti autenticati; le proposte di locali approvate sono visibili nell’app.

## Conservazione e cancellazione dell’account

Dal Profilo l’utente può richiedere la cancellazione dopo aver verificato nuovamente la password. Sono eliminati l’account, i messaggi e gli allegati scritti dall’utente, i token push, i blocchi e le segnalazioni inviate. Le conversazioni con altri membri sono trasferite a un membro rimasto; le conversazioni senza altri membri sono eliminate. Le proposte di locali pubblicate restano, senza attribuzione personale. I dati possono essere conservati ulteriormente solo se richiesto dalla legge o necessario per gestire contestazioni e sicurezza, nei limiti consentiti e definiti dal titolare.

## Diritti e reclami

Per esercitare i diritti previsti dalla normativa applicabile o presentare un reclamo, contattare il titolare all’indirizzo indicato sopra. Il titolare deve verificare e completare questa informativa prima di pubblicarla negli store, renderla raggiungibile tramite URL pubblico e aggiornarla se cambiano i trattamenti o i fornitori.
