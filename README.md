# Domus

Gestionale personale per adempimenti domestici, pratiche, contratti, manutenzioni e documenti.
**PWA statica, offline-first, senza account, senza backend, senza cloud per i dati.** Pensata per iPhone (Safari → schermata Home).

- Versione: 1.0.0 · Schema dati: 2 · Formato backup: 1
- Nessuna dipendenza di runtime (HTML + CSS + JavaScript ES modules, nessun bundler, nessun framework).
- I dati restano nel database del dispositivo (IndexedDB). Nessuna telemetria, nessuna chiamata di rete a terzi.

> **Stato onesto.** Le funzioni sono implementate e collaudate in Chromium con emulazione mobile (vedi `docs/TESTING.md`).
> **Non è stato provato su un iPhone fisico né su Safari/iOS 27**: la checklist `docs/CHECKLIST_COLLAUDO.md` elenca le prove
> da fare sul dispositivo. Finché non sono eseguite, non considerare verificati installazione, offline e condivisione su iOS.

---

## 1. Come rendere disponibili i file statici tramite HTTPS

Safari installa e rende offline una PWA solo da un'origine **HTTPS** (il Service Worker lo richiede; `http://localhost`
vale solo sul computer stesso, non dall'iPhone). Domus è composta da soli file statici: serve un hosting che li pubblichi.
**All'host arrivano solo i file dell'app (HTML/CSS/JS/icone), mai i tuoi dati**: i dati non lasciano il telefono.

Opzioni gratuite e senza manutenzione (scegline una; non è stato pubblicato nulla per tuo conto, quindi **non esiste ancora un URL**):

| Opzione | Passi essenziali | Pro | Contro |
|---|---|---|---|
| **A. GitHub Pages** (consigliata) | Crea un repository (anche privato su piani che lo consentono, altrimenti pubblico: contiene solo codice, nessun dato), carica il contenuto di questa cartella nella radice, *Settings → Pages → Deploy from branch → main / (root)*. L'URL sarà `https://<utente>.github.io/<repo>/` | Gratis, HTTPS automatico, aggiornamenti con un push | Serve un account GitHub; il repository pubblico espone il codice dell'app |
| **B. Cloudflare Pages** | *Workers & Pages → Create → Pages → Upload assets*, carica la cartella | Gratis, HTTPS, nessun repository necessario | Serve un account Cloudflare |
| **C. Netlify Drop** | Trascina la cartella su app.netlify.com/drop | Il più veloce | Serve un account per mantenere il sito |

Tutti i percorsi dell'app sono **relativi**: funziona sia nella radice di un dominio sia in una sottocartella (`/<repo>/`).
Non servono header speciali: la CSP è in un tag `<meta>` di `index.html`. Se l'host permette di impostare header, puoi
aggiungere `X-Content-Type-Options: nosniff` e `Referrer-Policy: no-referrer`.

**Prova locale sul computer (non per l'uso quotidiano su iPhone):**

```bash
node scripts/serve.mjs . 8080      # poi apri http://localhost:8080 nel browser del computer
```

## 2. Alternative senza hosting remoto

- **HTTPS sulla rete locale**: possibile (es. un certificato locale generato con `mkcert` servito dal computer, con il certificato
  radice installato e *reso attendibile* sull'iPhone in Impostazioni → Generali → Info → Attendibilità certificati). Funziona solo
  finché il computer è acceso e raggiungibile sulla Wi-Fi per **installare e aggiornare**; dopo l'installazione l'app lavora offline.
  È più laborioso e fragile: non consigliato come soluzione primaria. Non verificato in questo progetto.
- **Aprire `index.html` dall'app File**: **non** funziona come PWA (niente Service Worker, niente installazione, IndexedDB non affidabile).
- Non esiste un percorso nativo di iOS che permetta di installare una PWA da file locali senza un'origine HTTPS.

## 3. Aprire l'indirizzo in Safari

Sull'iPhone apri **Safari** (non l'app Mail/Messaggi/Chrome: l'installazione sulla Home è supportata da Safari) e vai all'URL dell'hosting scelto.

## 4. Aggiungere la PWA alla schermata Home

1. In Safari tocca **Condividi** (quadrato con freccia).
2. **Aggiungi alla schermata Home** → nome "Domus" → **Aggiungi**.
3. **Chiudi Safari e apri Domus dall'icona sulla Home.**

> ⚠ **Importante.** Su iOS l'app installata sulla Home e la scheda di Safari hanno, per quanto documentato, **archiviazioni separate**:
> i dati inseriti in Safari *prima* di installare l'app non compaiono nell'app installata. Inserisci i dati **solo** dopo aver
> aperto Domus dall'icona sulla Home.

## 5. Configurazione iniziale (primo avvio)

Al primo avvio Domus mostra una guida che spiega: dove stanno i dati, come funziona l'archivio, e offre il pulsante
**"Richiedi archiviazione persistente"** (il sistema può rifiutare: in tal caso fai backup frequenti). Dopo il primo caricamento
online, l'app funziona anche senza rete. Non è richiesto nessun account.

## 6. Cartella documentale (File)

Vedi `docs/GUIDA_ARCHIVIO.md`. In sintesi, su Safari iOS **le app web non possono scrivere automaticamente in una cartella di File**
(l'API `showDirectoryPicker` non è disponibile). Domus quindi:

- conserva i documenti nella **memoria interna** della PWA (stato "Solo nella PWA", evidenziato);
- ti fa **esportare** con "Salva in File / Condividi" (foglio di condivisione iOS → *Salva su File* → cartella **Domus**) o con un unico ZIP;
- **verifica** la copia: "Verifica copia in File" ti fa scegliere il file nella cartella e confronta l'hash SHA-256 con l'originale.
  Solo allora lo stato diventa "Copia in File verificata". Senza verifica Domus dice solo "Condiviso, da verificare".

Se il browser espone `showDirectoryPicker` (es. Chrome desktop), compare il Livello A: collegamento a una cartella, permesso richiesto
a ogni sessione, scrittura con verifica per rilettura. Su Safari iOS non è attivo.

## 7. Verificare il funzionamento offline

1. Con rete attiva apri Domus dalla Home e aspetta qualche secondo; in *Altro → Impostazioni → Informazioni* il Service Worker deve dire **"attivo (offline pronto)"**.
2. Chiudi completamente Domus (scorri via dal selettore app), attiva **Modalità aereo**, riapri Domus: Oggi, Attività, Archivio devono funzionare e consentire di creare un'attività.
3. Riattiva la rete.

## 8. Creare un backup indipendente

*Altro → Impostazioni → Backup e ripristino*:

1. **Backup con documenti** (o *Solo dati*) → compare "Backup pronto" con cosa è incluso/escluso.
2. **Salva in File** → scegli iCloud Drive o "Sul mio iPhone" → cartella Domus.
3. Conferma "Sì, salvato" (Domus non può saperlo da sola).
4. **Verifica un backup** → scegli il file salvato: controlla somme di controllo e struttura.

Il backup è un file ZIP (`domus-backup-AAAAMMGG-HHMM.zip`) apribile da File: `manifest.json`, `data.json`, `LEGGIMI.txt`, `documents/`.
Formato in `docs/FORMATO_BACKUP.md`. Domus ti avvisa in Oggi se l'ultimo backup ha più di 30 giorni.

## 9. Ripristinare database e documenti

*Impostazioni → Ripristina da file* → scegli lo ZIP. Domus **valida prima** (struttura, versione, SHA-256 di dati e file) e mostra
l'anteprima: elementi da aggiungere / aggiornare / invariati / locali più recenti. Il ripristino è un'**unione**: non cancella nulla.
Gli elementi più recenti nel backup sostituiscono quelli locali più vecchi **solo dopo la tua conferma esplicita**. A fine operazione
Domus rilegge i dati e ricalcola gli hash dei file: il report dice se la verifica è superata. Backup alterati, incompleti, di versione
più recente o non-Domus vengono rifiutati senza toccare i dati.

## 10. Operazioni da evitare per non perdere i dati

- Non inserire dati in Safari prima di installare l'app sulla Home (archiviazioni separate).
- Non usare "Rimuovi app" / "Elimina app" né cancellare "Dati dei siti web" di Safari senza un backup recente.
- Non usare la navigazione privata.
- Non affidarti al solo contenuto interno: esporta i documenti importanti in File e fai backup periodici (anche con documenti).
- Non considerare "in File" un documento finché Domus non dice "Copia in File verificata".
- Non fare ripristini da file di origine ignota.
- Se lo spazio sul telefono è quasi esaurito, iOS può eliminare i dati dei siti non usati: abilita l'archiviazione persistente e fai backup.
- Non ricomprimere/rinominare il backup con altri strumenti (lo ZIP compresso da iOS è comunque leggibile, ma non modificarne il contenuto).

---

## Struttura del progetto

```
index.html · manifest.webmanifest · sw.js          Shell PWA, CSP, Service Worker (cache versionata)
css/app.css                                        Stile (chiaro/scuro, safe area, reduced motion)
icons/                                             Icone (generate da scripts/make-icons.py)
js/app.js · app-sw.js · version.js                 Router, registrazione SW, versioni
js/data/   schema · migrations · db · repo · backup-io · dirs      Modello, IndexedDB, operazioni di dominio, backup, Livello A
js/lib/    dates · recurrence · zip · hash · ics · search · dashboard · integrity · backup-core · deliver   Logica pura
js/ui/     viste: today tasks practices house money archive contacts search settings more + kit/common/links/prompt/h
scripts/   serve.mjs · check-precache.mjs · make-icons.py
tests/     unit/ (node:test) · e2e/ (Playwright, Chromium)
docs/      LIMITI_IOS · GUIDA_ARCHIVIO · FORMATO_BACKUP · TESTING · CHECKLIST_COLLAUDO · RELEASE_NOTES · PRIVACY_SICUREZZA
```

## Aggiornare l'app

1. Modifica i file, incrementa la versione in **entrambi** `js/version.js` (`APP_VERSION`) e `sw.js` (`CACHE_VERSION`); se aggiungi file, elencali in `PRECACHE` (`npm run check` lo verifica).
2. Ripubblica i file sull'hosting.
3. Aprendo Domus (o da *Impostazioni → Controlla aggiornamenti*) compare "Aggiornamento disponibile": **tu** decidi quando applicarlo. I dati non vengono mai toccati dagli aggiornamenti; le modifiche allo schema avvengono con migrazioni additive di IndexedDB.

## Comandi

```bash
npm run check        # coerenza precache/versioni, nessun URL esterno
npm run test:unit    # test della logica (Node ≥ 22)
npm run test:e2e     # test nel browser (richiede Playwright con Chromium)
```
