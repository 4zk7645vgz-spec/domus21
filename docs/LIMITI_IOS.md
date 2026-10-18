# Limiti di iOS/Safari e decisioni di progetto (Fase Zero)

Fonti consultate: documentazione WebKit "Updates to Storage Policy" (webkit.org), MDN (`Window.showDirectoryPicker`: "Limited availability", solo contesti sicuri).
**Non è stato possibile consultare la tabella di compatibilità MDN/Apple per iOS 27** né provare su un iPhone: dove segue "da verificare", la
conclusione si basa su conoscenza generale e va confermata con `CHECKLIST_COLLAUDO.md`.

| # | Tema | Stato noto | Decisione in Domus |
|---|------|-----------|--------------------|
| 1 | Installazione PWA | "Aggiungi alla schermata Home" da Safari (manifest + icona `apple-touch-icon`). | Manifest, icone 180/192/512/maskable, meta `apple-mobile-web-app-*`. *Da verificare su iPhone.* |
| 2 | HTTPS | Service Worker e installazione richiedono contesto sicuro; `localhost` vale solo sul computer. | README: hosting statico HTTPS. Nessun URL inventato. |
| 3 | Offline e aggiornamenti | Il SW mette in cache l'app dopo il primo caricamento. | Precache atomica versionata, aggiornamento applicato solo su richiesta, vecchia cache rimossa in `activate`. Testato in Chromium; *da verificare su iOS*. |
| 4 | IndexedDB, quote, sfratto | WebKit: quota per origine fino al 60% del disco (browser) e dati eliminabili a memoria scarsa o dopo inattività, salvo modalità persistente (`navigator.storage.persist()`, concessa a discrezione di WebKit; la Home Screen è un'euristica favorevole). La pagina WebKit consultata **non** chiarisce l'eventuale limite dei 7 giorni per le web app sulla Home. | Richiesta di `persist()` in onboarding/Impostazioni; stato mostrato; promemoria backup dopo 30 giorni. I documenti sono salvati come `ArrayBuffer` (più affidabili dei `Blob` in IndexedDB su Safari). |
| 5 | Selezione file/cartelle | `<input type=file>` supportato. `showDirectoryPicker` **non** risulta disponibile su Safari iOS (MDN: disponibilità limitata). OPFS esiste ma è privato all'origine, non è la cartella in File. *Da verificare su iOS 27.* | Livello A (cartella) implementato ma attivo solo con feature-detection; su iOS si usa il Livello B. |
| 6 | Permessi persistenti su cartelle | Senza `showDirectoryPicker` non esistono. Dove l'API esiste, i permessi non sono garantiti tra sessioni. | Mai assunti: `queryPermission` prima di ogni scrittura, richiesta esplicita, errore chiaro. |
| 7 | Memoria della PWA vs File | I dati in IndexedDB non sono visibili in File. | Ogni documento mostra stato e posizione effettiva; "Solo nella PWA" evidenziato; mai "salvato in File" senza verifica. |
| 8 | Notifiche a PWA chiusa | Le notifiche web su iOS richiedono Web Push (server esterno, solo app installate). Non esistono notifiche locali pianificate affidabili. | **Non implementate** (incompatibili con "nessun cloud"). Alternative: dashboard, avviso all'apertura, esportazione `.ics` verso Calendario (azione manuale). |
| 9 | Background | Nessuna esecuzione affidabile in background; il processo può essere terminato in ogni momento. | Nessuna logica in background; ricorrenze calcolate al completamento (catch-up corretto dopo settimane). |
| 10 | Backup con dati e file in luoghi diversi | Database e blob sono nello stesso storage; i file in File non sono leggibili dalla PWA. | Backup ZIP (dati + blob interni). Il manifest e `LEGGIMI.txt` elencano cosa è escluso (file fuori dalla PWA). |
| — | Condivisione file | `navigator.share({files})` è disponibile su Safari iOS recenti e offre "Salva su File". Richiede un gesto utente. | Flusso a due passi (prepara → premi "Salva in File"); ripiego su download. L'esito della condivisione non rivela la destinazione: per questo la verifica per hash. |
| — | Sicurezza | Una PWA non può usare il blocco biometrico/PIN come protezione reale. | Nessun PIN fittizio. Chi ha il telefono sbloccato può aprire l'app: usare il codice di blocco iOS. |

## Limiti residui dell'app

- Documenti ≤ 100 MB ciascuno; l'intero file è caricato in memoria durante importazione, hash, esportazione e backup: con file molto grandi o molti documenti il backup può essere lento o fallire per memoria su dispositivi datati.
- Backup ZIP senza ZIP64 (limite ~4 GB per file/archivio) e **non cifrato**: chi ottiene il file legge i dati. Salvalo in luoghi protetti.
- Anteprima integrata solo per immagini; altri formati si aprono tramite il visualizzatore di sistema (comportamento in app Home *da verificare*).
- Un solo dispositivo: nessuna sincronizzazione (per scelta).
