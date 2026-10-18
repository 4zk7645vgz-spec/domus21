# Collaudo: cosa è stato provato e dove

Legenda: **A** = automatizzato (eseguito), **M** = manuale (da eseguire), **iPhone** = richiede un iPhone fisico (NON eseguito).

Ambiente dei test eseguiti: Node 22, **Chromium** (Playwright 1.56) con emulazione mobile (viewport, touch, user agent). **Non è WebKit/Safari e non è iOS.**
Nessun risultato qui va letto come "testato su iOS 27".

| # | Requisito | Tipo | Esito / riferimento |
|---|-----------|------|---------------------|
| 1 | Attività: creazione, modifica, completamento, riapertura, eliminazione | A (e2e UI) | passato |
| 2 | Scadenze e ricorrenze (mensile ancorata, 29 feb, catch-up dopo settimane) | A (unit + e2e) | passato |
| 3 | Assenza duplicati (doppio completamento concorrente, indice univoco, riapertura bloccata) | A | passato |
| 4 | Pratiche: checklist, cronologia, eliminazione senza perdere documenti | A | passato |
| 5 | Documenti collegati a più entità; scollega ≠ elimina | A | passato |
| 6 | Ricerca globale | A | passato |
| 7 | Persistenza dopo chiusura/riapertura del browser (profilo persistente) | A (Chromium) | passato; **iPhone**: riavvio del telefono |
| 8 | Offline dopo configurazione (Service Worker, creazione dati offline) | A (Chromium) | passato; **iPhone**: modalità aereo, app Home |
| 9 | Importazione/esportazione documenti, stato e posizione, verifica hash | A (parte logica) | passato; **iPhone**: foglio di condivisione → File reale |
| 10 | File mancante / permessi: riconoscimento e riparazione | A (file mancante) | passato; revoca permessi cartella (Livello A): **non testabile** in headless/iOS |
| 11 | Backup e ripristino (idempotente, dispositivo vuoto, solo dati, verifica file) | A | passato |
| 12 | Backup malformati (alterati, mancanti, versione futura, non-Domus, non-ZIP) | A (unit + e2e) | passato |
| 13 | Storage esaurito (QuotaExceeded simulato) | A (simulato) | passato; quota reale **iPhone** |
| 14 | Date, bisestili, fusi (Auckland, Los Angeles, UTC, Roma), cambio ora | A | passato (unit in 4 TZ + e2e) |
| 15 | Layout mobile 320–430 px, assenza scroll orizzontale, tap target ≥ 44 px | A (Chromium) | passato; tastiera virtuale e safe area reali: **iPhone** |
| 16 | Accessibilità: nomi accessibili, landmark, focus trap, Esc, contrasto AA chiaro/scuro, reduced motion | A (parziale) | passato; VoiceOver/Dynamic Type: **M/iPhone** |
| 17 | Aggiornamento PWA senza perdita dati + migrazione DB v1→v2 | A | passato; **iPhone**: aggiornamento reale |
| 18 | Nessuna richiesta di rete esterna, nessuna violazione CSP | A | passato |
| 19 | Controllo dipendenze: nessuna di runtime; nessun URL esterno nei sorgenti | A (`npm run check`) | passato |
| 20 | Avvio tramite la procedura documentata (`node scripts/serve.mjs`) | A (locale) | passato; installazione da HTTPS reale: **iPhone** |

## Come rieseguire

```bash
npm run check && npm run test:unit        # 26 test; ripetibili con TZ=Pacific/Auckland ecc.
npm run test:e2e                          # 27 passi; richiede Playwright+Chromium
```

## Limiti dei test

- I test e2e simulano la quota esaurita con un'eccezione sul `put` di IndexedDB; non misurano i limiti reali di Safari.
- `navigator.share` non è disponibile in Chromium headless: il ripiego (download) è testato, il foglio di condivisione iOS **no**.
- Nessun benchmark: non sono stati misurati tempi di avvio/rendering su iPhone. Obiettivi misurabili suggeriti (da verificare sul dispositivo): avvio a freddo < 2 s con 1000 record, ricerca < 100 ms; l'app non ha bundler né librerie (≈ 150 KB di sorgenti non compressi).
