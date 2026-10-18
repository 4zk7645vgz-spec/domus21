# Formato di backup `domus-backup` v1

File ZIP (voci non compresse; in lettura sono accettate anche voci *deflate*, ad esempio se iOS "Comprimi" ricomprime l'archivio).

```
manifest.json
data.json
LEGGIMI.txt
documents/<idDocumento>/<nome file>        (solo backup "con documenti")
```

## manifest.json

```json
{
  "format": "domus-backup", "formatVersion": 1, "appVersion": "1.0.0", "schemaVersion": 2,
  "createdAt": "2026-10-18T10:00:00.000Z", "includesDocuments": true,
  "counts": { "tasks": 12, "documents": 4, "...": 0 },
  "data":  { "path": "data.json", "sha256": "…", "size": 12345 },
  "files": [ { "id": "…", "path": "documents/<id>/<nome>", "name": "…", "size": 1, "sha256": "…" } ],
  "excluded": [ "elenco leggibile di ciò che NON è incluso" ]
}
```

`data.json` = `{ "stores": { "<archivio>": [ record… ] } }` per gli archivi: tasks, practices, checklist, documents, properties, maintenance, utilities,
contracts, payments, contacts, categories, tags, relationships, audit.

## Validazione (prima di qualsiasi scrittura)

1. ZIP valido; nomi senza `..`, `/` iniziale, `\`; limiti su numero voci e dimensione; CRC32 per voce; niente cifratura.
2. `format`/`formatVersion` riconosciuti e non più recenti dell'app; `schemaVersion` non più recente.
3. SHA-256 di `data.json` = manifest; JSON valido; solo archivi noti; **ogni record** passa la validazione dello schema (campi sconosciuti scartati, tipi/date/enum verificati); id unici; conteggi coerenti.
4. Per ogni file: presente, SHA-256 e dimensione = manifest, appartenente a un documento esistente con lo stesso hash.
5. Qualsiasi errore ⇒ ripristino rifiutato, nessun dato modificato. Il contenuto importato non viene mai eseguito né inserito come HTML.

## Ripristino (unione non distruttiva)

- id assente → aggiunto. id presente: vince `updatedAt` più recente; uguale → invariato; locale più recente → mantenuto.
- Documenti con hash diverso dal locale → mantenuto il locale (segnalato). Occorrenze ricorrenti duplicate e collegamenti già presenti → ignorati.
- Le sovrascritture richiedono conferma esplicita. Record in un'unica transazione atomica; i file uno per transazione con verifica hash.
- Verifica finale: ogni record applicato riletto (stessa `updatedAt`), ogni file riletto e ricalcolato l'hash.

## Esclusioni dichiarate

File fuori dalla PWA (es. cartella File), impostazioni locali del dispositivo e cache. Il backup **non è cifrato**.
