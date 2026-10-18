# Checklist di collaudo su iPhone (da eseguire prima dell'uso reale)

Segna ogni voce con ✔/✘ e la versione di iOS. Finché non è completata, Domus **non va considerata verificata su iOS 27**.

## A. Installazione e avvio
- [ ] L'URL HTTPS si apre in Safari senza avvisi di certificato.
- [ ] «Aggiungi alla schermata Home» disponibile; l'icona Domus è corretta.
- [ ] Aperta dall'icona: nessuna barra di Safari (modalità standalone); la procedura guidata non mostra l'avviso «installa prima l'app».
- [ ] Barra di stato, notch e home indicator non coprono contenuti (safe area); la tab bar è raggiungibile con una mano.
- [ ] Tastiera: i campi dei moduli restano visibili, nessuno zoom automatico sui campi.

## B. Dati e persistenza
- [ ] Crea attività, pratica con checklist, contatto, utenza. Chiudi l'app dal selettore app, riaprila: tutto presente.
- [ ] Riavvia l'iPhone, riapri: tutto presente.
- [ ] Impostazioni → Spazio: leggi se «Archiviazione persistente» è concessa (annota l'esito).
- [ ] I dati inseriti in Safari (scheda) **non** compaiono nell'app Home (conferma contenitori separati) — annota.

## C. Offline
- [ ] Impostazioni → Informazioni: «Service Worker: attivo».
- [ ] Modalità aereo, chiudi e riapri Domus: si avvia, dati visibili, puoi creare un'attività.
- [ ] Con aereo attivo «Controlla aggiornamenti» risponde con un messaggio comprensibile.

## D. Documenti
- [ ] Importa un PDF, una foto da Libreria foto e un file da File/iCloud.
- [ ] Stato «Solo nella PWA»; «Apri» mostra il documento (annota come: anteprima/nuova scheda).
- [ ] «Salva in File / Condividi» → foglio di condivisione → *Salva su File* → cartella *Domus*.
- [ ] «Verifica copia in File» scegliendo quel file → «Copia in File verificata».
- [ ] Scegliendo un altro file → «Copia diversa».
- [ ] Archivio → icona condividi → ZIP salvabile in File; il file si apre con un tocco.
- [ ] Un file da ~50 MB e uno da ~100 MB: importazione e backup senza crash (annota la memoria usata/errori).
- [ ] Eliminare una pratica collegata non elimina il documento.

## E. Backup e ripristino
- [ ] «Backup con documenti» → Salva in File → «Sì, salvato». Il file ha estensione `.zip` e si apre da File (contiene manifest.json, data.json, LEGGIMI.txt, documents/).
- [ ] «Verifica un backup» sul file salvato → «Backup integro».
- [ ] Su un secondo dispositivo/profilo vuoto: installa, ripristina → «Verifica post-ripristino superata»; documenti apribili.
- [ ] Prova a ripristinare un `.zip` qualsiasi (non backup): viene rifiutato senza modifiche.
- [ ] Rinomina/ricomprimi il backup con «Comprimi» di iOS e ripristinalo (il lettore supporta deflate; annota se fallisce).

## F. Promemoria
- [ ] Una attività con scadenza → «Aggiungi al Calendario» → il file `.ics` si apre in Calendario con gli avvisi.
- [ ] Impostazioni → «Esporta scadenze in Calendario».
- [ ] Conferma che **non** arrivano notifiche da Domus (comportamento atteso).

## G. Aggiornamento
- [ ] Pubblica una versione con `APP_VERSION` incrementata; sul telefono compare «Aggiornamento disponibile»; «Aggiorna ora» ricarica e i dati sono intatti.

## H. Accessibilità
- [ ] VoiceOver: tab bar, elenco attività (pulsante «Completa: …»), finestre modali e moduli sono leggibili e navigabili.
- [ ] Dimensione testo grande (Impostazioni iOS → Accessibilità): nessun testo tagliato in modo grave.
- [ ] Modalità scura e chiara; «Riduci movimento» disattiva le animazioni.

## I. Privacy
- [ ] In Safari/ispezione di rete (se disponibile) nessuna richiesta oltre a file statici dell'app e `sw.js`.
- [ ] Nessuna richiesta di permessi (posizione, notifiche, fotocamera) da parte di Domus.
