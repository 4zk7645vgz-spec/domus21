# Note di rilascio

## 1.0.0 (18 ottobre 2026) — prima versione

**Moduli**: Oggi (dashboard da dati reali), Attività e ricorrenze, Pratiche (checklist, cronologia), Casa (immobili, manutenzioni, interventi, garanzie), Utenze e contratti (pagamenti, rinnovi), Archivio documentale, Contatti, Ricerca globale, Impostazioni (backup, storage, categorie, integrità, diagnostica).

**Piattaforma**: PWA statica, IndexedDB (schema v2, migrazioni additive), Service Worker con cache versionata e aggiornamento su richiesta, CSP restrittiva, nessuna dipendenza di runtime, nessuna rete esterna.

**Archivio**: Livello B (condivisione + verifica hash) su iOS; Livello A (cartella) solo con `showDirectoryPicker`.

**Backup**: ZIP versionato con SHA-256, ripristino per unione con anteprima, conferma e verifica finale.

**Non incluso / limiti noti**
- Non provato su iPhone fisico né Safari/iOS 27 (vedi `docs/CHECKLIST_COLLAUDO.md`).
- Nessuna notifica a app chiusa (limite di piattaforma + vincolo "nessun cloud"): usare Oggi e l'esportazione `.ics`.
- Backup non cifrato; nessun blocco con PIN (non sarebbe una protezione reale in una PWA).
- Nessuna sincronizzazione tra dispositivi.
- Test eseguiti solo su Chromium con emulazione mobile.
