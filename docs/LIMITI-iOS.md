# Fase Zero — Limiti di iOS/Safari e decisioni architetturali

Stato delle verifiche: consultate le fonti elencate in fondo (WebKit blog «Updates to Storage Policy», pagina MDN `showDirectoryPicker`).
Dove la fonte non era leggibile o non copriva il punto, **lo dichiaro** e la voce resta *da verificare su iPhone con iOS 27*.
Nessuna affermazione specifica su iOS 27 è stata verificata: non ho accesso a un dispositivo né a documentazione specifica di quella versione.

| # | Punto | Esito | Fonte / stato | Decisione in Domus |
|---|---|---|---|---|
| 1 | Installazione PWA da Safari | «Aggiungi alla schermata Home» è il percorso previsto; richiede manifest e, per funzioni offline, Service Worker | conoscenza generale; **da verificare su iOS 27** | `manifest.webmanifest` (standalone, icone 180/192/512/maskable), meta Apple |
| 2 | HTTPS per installazione e SW | Service Worker e molte API richiedono *secure context* (HTTPS o localhost). `showDirectoryPicker` lo richiede esplicitamente | MDN (letto) | Distribuzione solo via HTTPS; `file://` non supportato; diagnostica mostra `isSecureContext` |
| 3 | Offline e aggiornamenti | Cache Storage + SW; l'aggiornamento del SW passa dal controllo di `sw.js` | conoscenza generale; **testato solo su Chromium** | Precache versionata atomica, nessun `skipWaiting` automatico, banner «Aggiorna ora» |
| 4 | Persistenza IndexedDB, quote, eliminazione | Dati eliminabili per pressione di spazio o inutilizzo (per origine, meno recenti per primi); `StorageManager.persist()` richiede la modalità persistente e WebKit decide con euristiche, tra cui l'essere una Home Screen Web App; **non garantita**. Quota di origine fino al 60% del disco per app browser (15% altre app) | WebKit blog «Updates to Storage Policy» (letto). La pagina **non** tratta il limite dei 7 giorni per le web app: non lo affermo né lo escludo | Richiesta `persist()` nella procedura guidata e nelle impostazioni, stato mostrato; **backup regolari + banner** come difesa reale |
| 5 | API selezione file/cartelle su Safari iOS | `<input type=file>` supportato. `showDirectoryPicker`: MDN la dichiara a «disponibilità limitata»; la tabella di compatibilità non era leggibile e **la mia conoscenza è che Safari non la implementa** | MDN (parziale) | Livello A attivo solo con *feature detection*; altrimenti Livello B |
| 6 | Permessi su file/cartelle dopo chiusura/riavvio | Dove `showDirectoryPicker` esiste, i permessi non sono garantiti oltre la sessione | MDN/Chromium; Safari **non verificabile** | Il permesso si ricontrolla a ogni operazione; mai dichiarato permanente |
| 7 | Memoria privata della PWA vs File | I dati in IndexedDB non sono visibili in File; una PWA non scrive in File se non tramite foglio di condivisione/download/selettore | conoscenza generale | Ogni documento mostra stato e posizione reali; «Solo nella PWA» evidenziato |
| 8 | Notifiche locali/promemoria a app chiusa | Il Web Push su iOS richiede un push service/server; non esistono notifiche locali pianificabili da una PWA | conoscenza generale; **da verificare** | Nessuna promessa di notifiche. Dashboard all'apertura + export `.ics` verso Calendario |
| 9 | Background execution | Nessun processo in background affidabile per una PWA; il SW non è un timer | conoscenza generale | Ricorrenze calcolate **al completamento** e basate sull'orologio all'apertura, non su job |
| 10 | Backup con database e documenti in luoghi diversi | Domus è l'unico a conoscere DB e blob interni; i file in File sono invisibili all'app | progetto | Backup ZIP che dichiara **cosa include e cosa no**; verifica hash; ripristino con rilevamento dei file mancanti |

## Altre decisioni

- **Blob come ArrayBuffer**: i documenti sono salvati in IndexedDB come `ArrayBuffer` (+tipo e nome), non come `Blob`, perché storicamente Safari ha avuto problemi di affidabilità con i Blob in IndexedDB. Non verificato su iOS 27.
- **Condivisione**: `navigator.share({files})` richiede un gesto utente fresco; Domus separa «prepara» da «salva» e ripiega sul download se la condivisione fallisce. Il risultato di `share()` non dice *dove* l'utente ha salvato: per questo esiste «Verifica copia in File».
- **Nessun PIN**: una schermata PIN in una PWA non è cifratura né equivale al blocco di iOS. Documentato; non implementato.
- **Nessuna cifratura del backup**: non implementata per scelta (richiederebbe gestione chiavi/password); documentato nel README.
- **Contenitore dati separato**: sulle web app installate iOS usa uno storage distinto da quello di Safari (da confermare su iOS 27). La procedura guidata avvisa se l'app non è in modalità standalone.

## Fonti consultate
- WebKit, «Updates to Storage Policy» — https://webkit.org/?p=14403 (quote, eliminazione, `persist()`)
- MDN, `Window.showDirectoryPicker()` — https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker (secure context, gesto utente, disponibilità limitata)
- Risultati di ricerca su OPFS/File System Access in WebKit (bug tracker WebKit): titoli consultati, contenuto non analizzato.
