# Note di rilascio

## 1.0.0 — 18 ottobre 2026 (prima versione)

**Incluso**
- Dashboard (oggi, scadute, prossimi 14 giorni, pagamenti e rinnovi, manutenzioni, pratiche aperte, documenti recenti e in scadenza, azioni rapide), alimentata dal database reale; nessun dato dimostrativo.
- Attività con priorità, categoria, costo, tag, ricorrenza giornaliera/settimanale/mensile/annuale (giorno àncora, 29 febbraio, nessuna occorrenza arretrata dopo periodi di inattività, una sola occorrenza aperta per serie).
- Pratiche con checklist (adempimenti e documenti richiesti/ricevuti), scadenze intermedie, cronologia, collegamento a più attività e documenti.
- Casa: immobili (multipli), ambienti, manutenzioni programmate/interventi/garanzie con storico e costi, fornitori.
- Utenze e contratti con registrazione pagamenti, avanzamento automatico della scadenza, rinnovi.
- Archivio documentale con stato e posizione reali, esportazione in File, verifica copia via SHA-256, ZIP di tutti i documenti.
- Contatti, ricerca globale, categorie, tag.
- Backup ZIP versionato con verifica d'integrità e ripristino non distruttivo con verifica; verifica integrità dati; esportazione `.ics`.
- Service Worker con precache versionata, aggiornamento volontario; CSP restrittiva (`default-src 'none'`, nessun inline, nessun eval).
- Tema chiaro/scuro, safe area, riduzione animazioni, tap target ≥ 44 px.

**Limitazioni note**
- **Non provata su Safari né su iPhone/iOS 27**; vedi `docs/TESTING.md` e `docs/COLLAUDO.md`.
- Nessun URL pubblicato: va ospitata su HTTPS (README §1).
- Nessuna notifica a app chiusa (limite della piattaforma + vincolo «nessun cloud»).
- Nessun salvataggio automatico in una cartella di File su Safari iOS: serve un'azione dell'utente a ogni esportazione; Livello A (cartella collegata) presente ma attivo solo dove `showDirectoryPicker` esiste e **mai testato**.
- Backup non cifrato; nessun PIN interno.
- File fino a 100 MB, caricati in memoria; backup molto grandi possono esaurire la memoria di iOS (non misurato).
- Nessuna sincronizzazione tra dispositivi (per scelta): spostare i dati = backup + ripristino.
- Anteprima: solo immagini nell'app; gli altri formati si aprono in una nuova scheda (comportamento da verificare su iOS).
- Nessun benchmark eseguito.
- Interfaccia solo in italiano; valuta solo EUR.

**Schema dati:** 2 (migrazione 1→2 testata). **Formato backup:** 1.
