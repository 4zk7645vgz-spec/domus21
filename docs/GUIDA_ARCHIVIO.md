# Guida all'archivio documentale

## Stati di un documento

| Stato (etichetta) | Significato reale | Dove si trova il file |
|---|---|---|
| **Solo nella PWA** | Importato, mai esportato | Solo memoria interna di Domus |
| **Condiviso, da verificare** | Hai usato "Salva in File / Condividi", ma Domus non sa dove l'hai messo | Memoria interna + copia di cui non si conosce la destinazione |
| **Copia in File verificata** | Hai scelto il file copiato e l'hash SHA-256 coincide | Memoria interna + copia verificata (nome e data indicati) |
| **Copia diversa** | Il file scelto per la verifica non coincide con l'originale | Da riesportare |
| **File assente** | Metadati presenti ma contenuto non nella PWA (es. ripristino da backup "solo dati") | Da reimportare/ripristinare |

## Flusso consigliato (iPhone)

1. **Importa**: Archivio → `+` → scegli file (da File, Foto, Scansioni). Domus ne calcola l'hash e rileva i duplicati.
2. **Collega** il documento a pratica, attività, immobile, utenza, contratto o contatto (dal dettaglio dell'elemento). Scollegare non elimina mai il documento.
3. **Esporta in File**: dal documento → *Salva in File / Condividi* → *Salva su File* → cartella **Domus** (creala la prima volta in File). In alternativa, dal banner dell'Archivio, *Esporta in File* produce un solo ZIP di tutti i documenti "Solo nella PWA".
4. **Verifica**: dal documento → *Verifica copia in File* → scegli il file nella cartella Domus.

## Cosa Domus non può fare su iOS

- Scrivere in automatico nella cartella Domus di File né ricordare il permesso su quella cartella.
- Sapere se hai davvero salvato dopo il foglio di condivisione (per questo esiste la verifica).
- Rilevare se un file in File è stato spostato o eliminato dopo la verifica.

## Eliminazione

- Eliminare una pratica/attività/contratto elimina i collegamenti, **non** i documenti.
- Eliminare un documento chiede conferma, mostra a quanti elementi è collegato e non tocca le copie già in File.

## Livello A (solo dove disponibile)

Se il browser offre `showDirectoryPicker` (Impostazioni → Archivio documenti → *Collega cartella*): Domus scrive il file nella cartella,
lo rilegge e confronta l'hash. Il permesso va riconcesso quando scade; non è mai dato per persistente.
