# Checklist di collaudo su iPhone (da eseguire a mano)

Esegui in ordine su un iPhone con Safari, dopo aver pubblicato i file su un hosting HTTPS. Segna ogni voce; se una fallisce, annota iOS/versione.

## Installazione
- [ ] L'URL si apre in Safari; compare la pagina "Oggi" (non errori di certificato).
- [ ] Condividi → Aggiungi alla schermata Home: icona e nome "Domus" corretti.
- [ ] Aperta dall'icona, l'app è a schermo intero (senza barra di Safari), con safe area corretta (notch/Home indicator).
- [ ] Impostazioni → Informazioni: "Modalità: App sulla schermata Home", "Contesto sicuro: true", Service Worker "attivo".

## Dati e persistenza
- [ ] Onboarding visibile una sola volta. "Richiedi archiviazione persistente": annotare l'esito (concessa/non concessa).
- [ ] Crea attività, pratica con checklist, contratto, contatto. Chiudi l'app dal selettore, riaprila: i dati ci sono.
- [ ] Riavvia l'iPhone, riapri: i dati ci sono.
- [ ] Verifica che i dati inseriti in Safari (scheda) NON compaiano nell'app Home (archiviazioni separate) — conferma del limite.

## Offline
- [ ] Modalità aereo, chiusura completa, riapertura: l'app si avvia, naviga, crea un'attività.
- [ ] Con rete, Impostazioni → "Controlla aggiornamenti" risponde; offline risponde "Sei offline".

## Documenti e File
- [ ] Importa un PDF da File, una foto, una scansione. Stato "Solo nella PWA".
- [ ] "Salva in File / Condividi" → foglio iOS → Salva su File → cartella Domus. Poi "Verifica copia in File" → scegli quel file → "Copia in File verificata".
- [ ] Scegli un file *diverso* per la verifica → "Copia diversa".
- [ ] Apri un PDF (viene aperto dal visualizzatore di sistema? annota come si torna all'app) e un'immagine (anteprima).
- [ ] Banner Archivio "Esporta in File" → ZIP → Salva su File → il file ZIP si apre da File e contiene i documenti per categoria.
- [ ] Importa un file grande (≈ 50–100 MB): tempi/errori? annota.

## Backup / ripristino
- [ ] Backup con documenti → Salva in File → "Sì, salvato". "Verifica un backup" sul file salvato: "Backup integro".
- [ ] Il file ZIP si apre da File (anteprima/Decomprimi) e contiene manifest.json, data.json, LEGGIMI.txt, documents/.
- [ ] Elimina l'app dalla Home e dal sito (Impostazioni iOS → Safari → Avanzate → Dati dei siti web), reinstalla, ripristina dal backup: dati, collegamenti e file presenti; report "Verifica superata".
- [ ] Ripristina due volte lo stesso backup: nessun duplicato.

## Interfaccia
- [ ] Tastiera virtuale non copre i campi nelle finestre di modifica; il pulsante Salva resta raggiungibile.
- [ ] Uso con una mano: tab bar e pulsante "+" raggiungibili.
- [ ] Modalità scura/chiara con il tema di sistema. Testo grande (Dynamic Type) senza sovrapposizioni.
- [ ] VoiceOver: etichette sensate su tab, pulsanti, elenchi, finestre.
- [ ] "Riduci movimento" attivo: nessuna animazione.

## Calendario
- [ ] Attività con scadenza → "Aggiungi al Calendario": il file .ics si apre in Calendario e crea l'evento con i due avvisi.
