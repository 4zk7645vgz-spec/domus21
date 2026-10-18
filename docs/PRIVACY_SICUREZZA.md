# Privacy e sicurezza

- **Dati**: solo su questo dispositivo (IndexedDB). Nessun account, backend, database cloud, sincronizzazione, telemetria, pubblicità, chiavi segrete.
- **Rete**: l'unica connessione è il download dei file statici dell'app dall'hosting scelto (installazione e controllo aggiornamenti — `sw.js` e risorse dell'app). Nessun dato personale viene inviato. Il Service Worker ignora le richieste verso altre origini e la CSP (`default-src 'none'; connect-src 'self'`) le blocca.
- **CSP** (meta in `index.html`): script e stili solo da `'self'`, nessun `unsafe-inline`/`unsafe-eval`, `object-src 'none'`, `form-action 'none'`. Verificato: l'esecuzione di stringhe come codice viene bloccata.
- **XSS**: il DOM è costruito con `textContent`/attributi, mai con `innerHTML` su dati utente (test con payload `<img onerror>`).
- **Input**: ogni record passa da una validazione di schema (tipi, date, enum, lunghezze); i campi sconosciuti sono scartati. Lo stesso vale per i backup importati: nessun contenuto importato viene eseguito.
- **Backup**: integrità con SHA-256; **non cifrato**. Se serve cifratura, comprimi/proteggi il file con strumenti consolidati del sistema; Domus non implementa crittografia propria.
- **Accesso al dispositivo**: Domus non ha PIN/biometria perché in una PWA non sarebbe una protezione equivalente alla sicurezza del dispositivo. Chiunque abbia accesso al telefono sbloccato può aprire l'app e leggere i dati. Usa il codice di blocco di iOS.
- **Dati finanziari**: nessuna integrazione bancaria; il campo "Riferimento contratto" non deve contenere password o credenziali.
- **Registro locale** (`audit`): ultimi 300 eventi (eliminazioni, backup, ripristini), solo sul dispositivo.
