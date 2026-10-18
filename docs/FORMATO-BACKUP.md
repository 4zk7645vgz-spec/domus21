# Formato di backup `domus-backup` (versione 1)

File `.zip` **non compresso** (metodo «stored», apribile da File/Archivio Utilità di iOS; il lettore accetta anche archivi ricompressi con deflate).

```
manifest.json     metadati, somme di controllo, conteggi, elenco file ed esclusioni
data.json         { "stores": { "tasks": [...], "practices": [...], ... } }
LEGGIMI.txt       descrizione leggibile
documents/<id>/<nome file>     (solo "con documenti")
```

## manifest.json
| Campo | Significato |
|---|---|
| `format` | sempre `"domus-backup"` |
| `formatVersion` | 1; versioni superiori a quella supportata sono rifiutate |
| `schemaVersion` | versione dello schema dati (2); più recente di quella dell'app → rifiutato; più vecchia → `migrateStores` |
| `appVersion`, `createdAt` | informativi |
| `includesDocuments` | `true` se i file sono inclusi |
| `counts` | numero di record per archivio (verificato) |
| `data.sha256`, `data.size` | SHA-256 di `data.json` (verificato) |
| `files[]` | `{id, path, name, size, sha256}` per ogni file (verificati) |
| `excluded[]` | elenco leggibile di ciò che **non** è nel backup |

## Cosa include / non include
Incluso: tutti i record (attività, pratiche, checklist, metadati documenti, immobili, manutenzioni, utenze, contratti, pagamenti, contatti, categorie, tag, collegamenti, registro attività) e, se richiesto, i file nella memoria interna della PWA.
**Non incluso:** copie in File/cartelle esterne (Domus non può leggerle), impostazioni locali del dispositivo, cache. Un documento con `hasBlob: false` ha solo i metadati.

## Validazione (prima di toccare qualsiasi dato)
1. ZIP leggibile; nomi con `..`, `\`, percorsi assoluti, duplicati o cifratura → rifiutato; limiti su numero voci/dimensione.
2. `manifest.json` valido, formato e versioni compatibili.
3. SHA-256 di `data.json`; ogni record passa per `sanitize()` (tipi, date, enum, lunghezze); campi sconosciuti scartati; id duplicati e conteggi incoerenti → errore.
4. Per ogni file: presente, dimensione e SHA-256 corretti, coerente con il documento.
5. Errori in qualsiasi punto → il backup è rifiutato per intero, nessuna modifica.

I contenuti importati sono **solo dati**: nulla viene eseguito e l'interfaccia li mostra esclusivamente via `textContent`.

## Ripristino (unione)
- id assente in locale → aggiunto; presente → vince `updatedAt` più recente (sovrascrittura locale **solo con conferma**); parità → invariato; locale più recente → mantenuto.
- Documento con stesso id ma SHA-256 diverso → mantenuto il locale (conflitto segnalato).
- Occorrenze ricorrenti duplicate (`occKey`) e collegamenti già presenti vengono ignorati.
- Documento locale senza file ma con file nel backup (stesso hash) → file recuperato.
- Record in un'unica transazione; file uno per transazione; verifica finale su record e hash.
- Se si interrompe tra record e file: i documenti restano `hasBlob:false` (segnalati dalla verifica integrità) e ripetere il ripristino completa i file.
