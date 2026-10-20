// Formato di backup Domus (ZIP non compresso): manifest.json + data.json + documents/<id>/<nome>
// Parte pura (nessun accesso a IndexedDB): costruzione, ispezione/validazione e pianificazione del ripristino.
import { writeZip, readZip, ZipError } from './zip.js';
import { sha256 } from './hash.js';
import { sanitize, STORES, errText } from '../data/schema.js';
import { APP_VERSION, SCHEMA_VERSION, BACKUP_FORMAT, BACKUP_FORMAT_VERSION } from '../version.js';

const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
export const safeName = (n) => { const s = String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120); return !s || s === '.' || s === '..' ? 'file' : s; };

/** Migrazioni dei DATI di backup tra versioni di schema (oggi nessuna trasformazione necessaria: 1→2 è solo indicizzazione). */
// 3 (Domus 21): nuovi campi opzionali dei documenti. Nessuna trasformazione: i default (docKind 'nd', processing 'pending',
// payState 'unknown') vengono applicati da sanitize() e i documenti importati risultano "in attesa di elaborazione".
export const DATA_MIGRATIONS = { 3: (stores) => stores };
export function migrateStores(stores, from) {
  for (let v = from + 1; v <= SCHEMA_VERSION; v++) if (DATA_MIGRATIONS[v]) stores = DATA_MIGRATIONS[v](stores);
  return stores;
}

const README = (m) => `DOMUS — backup creato il ${m.createdAt}
Versione app: ${m.appVersion} · formato backup: ${m.formatVersion} · schema dati: ${m.schemaVersion}

CONTENUTO
- data.json    dati strutturati (attività, pratiche, contratti, contatti, metadati dei documenti…)
- manifest.json somme di controllo (SHA-256) e conteggi per la verifica
- documents/   ${m.includesDocuments ? 'copie dei documenti conservati nella memoria interna della PWA' : '(non inclusi: backup solo dati)'}

NON INCLUSO
${m.excluded.map((x) => '- ' + x).join('\n')}

Per ripristinare: Domus → Altro → Impostazioni → Backup → Ripristina da file.
Il ripristino unisce i dati ai presenti, non cancella nulla e chiede conferma prima di sovrascrivere.
`;

export async function buildBackup({ snapshot, getBlob, includeDocs, now = new Date() }) {
  const stores = {}; for (const s of STORES) stores[s] = snapshot[s] || [];
  const dataBytes = enc.encode(JSON.stringify({ stores }));
  const entries = [], files = [], missing = [];
  if (includeDocs) {
    for (const d of stores.documents) {
      if (!d.hasBlob) continue;
      const blob = await getBlob(d.id);
      if (!blob) { missing.push(d.name); continue; }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const path = `documents/${d.id}/${safeName(d.name)}`;
      files.push({ id: d.id, path, name: d.name, size: bytes.length, sha256: await sha256(bytes) });
      entries.push({ name: path, data: bytes });
    }
  }
  const excluded = ['File dei documenti conservati fuori dalla PWA (es. cartella Domus nell\'app File): Domus non può leggerli, solo i metadati sono inclusi', 'Impostazioni locali del dispositivo e cache dell\'app'];
  if (!includeDocs) excluded.unshift('Contenuto dei documenti (backup "solo dati": restano solo i metadati)');
  if (missing.length) excluded.unshift(`Documenti con file assente nella PWA: ${missing.join(', ').slice(0, 300)}`);
  const manifest = {
    format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION,
    createdAt: now.toISOString(), includesDocuments: !!includeDocs,
    counts: Object.fromEntries(STORES.map((s) => [s, stores[s].length])),
    data: { path: 'data.json', sha256: await sha256(dataBytes), size: dataBytes.length },
    files, excluded,
  };
  const blob = await writeZip([
    { name: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2)) },
    { name: 'data.json', data: dataBytes },
    { name: 'LEGGIMI.txt', data: enc.encode(README(manifest)) },
    ...entries,
  ], now);
  return { blob, manifest, missing };
}

/** Valida un backup. Non scrive nulla. Restituisce { ok, errors, warnings, manifest, stores, zip }. */
export async function inspectBackup(file) {
  const errors = [], warnings = [];
  const fail = (m) => { errors.push(m); return { ok: false, errors, warnings }; };
  let zip;
  try { zip = await readZip(file); } catch (e) { return fail(e instanceof ZipError ? e.message : 'Il file non è un backup Domus leggibile.'); }
  let manifest;
  try {
    if (!zip.entries.has('manifest.json') || zip.entries.get('manifest.json').usize > 5e6) return fail('Backup non valido: manifest.json assente o troppo grande.');
    manifest = JSON.parse(dec.decode(await zip.read('manifest.json')));
  } catch (e) { return fail(e instanceof ZipError ? e.message : 'Backup non valido: manifest.json illeggibile.'); }
  if (!manifest || manifest.format !== BACKUP_FORMAT) return fail('Il file non è un backup Domus (formato non riconosciuto).');
  if (!Number.isInteger(manifest.formatVersion) || manifest.formatVersion < 1) return fail('Versione del formato di backup non valida.');
  if (manifest.formatVersion > BACKUP_FORMAT_VERSION) return fail(`Backup creato da una versione più recente di Domus (formato ${manifest.formatVersion}). Aggiorna l'app prima di ripristinarlo.`);
  if (!Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion < 1) return fail('Versione dello schema dati non valida.');
  if (manifest.schemaVersion > SCHEMA_VERSION) return fail(`Backup con schema dati più recente (${manifest.schemaVersion} > ${SCHEMA_VERSION}). Aggiorna l'app.`);
  if (!manifest.data?.sha256 || !zip.entries.has('data.json')) return fail('Backup incompleto: data.json assente.');

  let raw;
  try { raw = await zip.read('data.json'); } catch (e) { return fail(e.message); }
  if ((await sha256(raw)) !== manifest.data.sha256) return fail('Controllo di integrità fallito: data.json non corrisponde alla somma di controllo (backup alterato o danneggiato).');
  let parsed;
  try { parsed = JSON.parse(dec.decode(raw)); } catch { return fail('data.json non è JSON valido.'); }
  if (!parsed || typeof parsed.stores !== 'object' || Array.isArray(parsed.stores)) return fail('Struttura dei dati non valida.');

  let stores = {};
  for (const k of Object.keys(parsed.stores)) if (!STORES.includes(k)) warnings.push(`Archivio sconosciuto ignorato: ${String(k).slice(0, 40)}`);
  for (const s of STORES) {
    const list = parsed.stores[s] ?? [];
    if (!Array.isArray(list)) { errors.push(`Archivio "${s}" non valido.`); continue; }
    if (list.length > 200000) { errors.push(`Archivio "${s}" troppo grande.`); continue; }
    const seen = new Set(), clean = [];
    for (const rec of list) {
      const { value, errors: er } = sanitize(s, rec, { meta: true });
      if (er.length) { if (errors.length < 15) errors.push(`${s}: ${errText(er)}`); continue; }
      if (seen.has(value.id)) { errors.push(`${s}: identificativo duplicato ${value.id.slice(0, 12)}…`); continue; }
      seen.add(value.id); clean.push(value);
    }
    if (manifest.counts && manifest.counts[s] !== undefined && manifest.counts[s] !== list.length) errors.push(`Conteggio non coerente per "${s}" (manifest ${manifest.counts[s]}, dati ${list.length}).`);
    stores[s] = clean;
  }
  const docIds = new Map((stores.documents || []).map((d) => [d.id, d]));
  const fileIds = new Set();
  for (const f of Array.isArray(manifest.files) ? manifest.files : []) {
    if (!f || typeof f.path !== 'string' || !f.path.startsWith('documents/') || typeof f.id !== 'string') { errors.push('Elenco file del manifest non valido.'); break; }
    const doc = docIds.get(f.id);
    if (!doc) { errors.push(`File senza documento corrispondente: ${f.path.slice(0, 80)}`); continue; }
    if (!zip.entries.has(f.path)) { errors.push(`File mancante nel backup: ${f.name || f.path}`); continue; }
    try {
      const bytes = await zip.read(f.path);
      if ((await sha256(bytes)) !== f.sha256 || bytes.length !== f.size) { errors.push(`File alterato o danneggiato: ${f.name || f.path}`); continue; }
      if (doc.sha256 && doc.sha256 !== f.sha256) { errors.push(`Il file non corrisponde ai metadati del documento: ${doc.name}`); continue; }
    } catch (e) { errors.push(`${f.name || f.path}: ${e.message}`); continue; }
    fileIds.add(f.id);
  }
  if (manifest.includesDocuments) for (const d of stores.documents || []) if (d.hasBlob && !fileIds.has(d.id)) warnings.push(`Documento senza file nel backup: ${d.name}`);
  const known = new Set(['manifest.json', 'data.json', 'LEGGIMI.txt', ...(manifest.files || []).map((f) => f.path)]);
  for (const n of zip.entries.keys()) if (!known.has(n)) warnings.push(`Elemento non previsto ignorato: ${n.slice(0, 80)}`);
  if (errors.length) return { ok: false, errors, warnings, manifest };
  stores = migrateStores(stores, manifest.schemaVersion);
  return { ok: true, errors, warnings, manifest, stores, zip, fileIds };
}

/**
 * Pianifica un ripristino NON distruttivo (unione):
 *  - id assente in locale → aggiungi; id presente: vince il più recente (updatedAt); a parità → invariato.
 *  - la versione locale non viene mai cancellata; le sovrascritture (update) richiedono conferma esplicita.
 */
export function planMerge(local, incoming, { localDocSha = new Map(), fileIds = new Set() } = {}) {
  const plan = { add: {}, update: {}, same: {}, keepLocal: {}, skipped: [], fillBlobs: [], totals: { add: 0, update: 0, same: 0, keepLocal: 0 } };
  const localOcc = new Map((local.tasks || []).filter((t) => t.occKey).map((t) => [t.occKey, t.id]));
  const localRel = new Set((local.relationships || []).flatMap((r) => [`${r.aType}:${r.aId}|${r.bType}:${r.bId}`, `${r.bType}:${r.bId}|${r.aType}:${r.aId}`]));
  for (const s of STORES) {
    const L = new Map((local[s] || []).map((r) => [r.id, r]));
    for (const r of incoming[s] || []) {
      const l = L.get(r.id);
      const put = (k) => { (plan[k][s] ||= []).push(r.id); plan.totals[k]++; };
      if (!l) {
        if (s === 'tasks' && r.occKey && localOcc.has(r.occKey)) { plan.skipped.push(`Occorrenza duplicata ignorata: ${r.title}`); continue; }
        if (s === 'relationships' && localRel.has(`${r.aType}:${r.aId}|${r.bType}:${r.bId}`)) { plan.skipped.push('Collegamento già presente'); continue; }
        put('add'); continue;
      }
      if (s === 'documents' && l.sha256 && r.sha256 && l.sha256 !== r.sha256) { plan.skipped.push(`Documento "${l.name}": file locale diverso, mantenuta la versione locale`); put('keepLocal'); continue; }
      if (r.updatedAt > l.updatedAt) put('update');
      else if (r.updatedAt === l.updatedAt) put('same');
      else put('keepLocal');
    }
  }
  // documenti presenti in locale senza file ma con file disponibile nel backup → recupero del file
  for (const r of incoming.documents || []) {
    const l = (local.documents || []).find((d) => d.id === r.id);
    if (l && !localDocSha.get(r.id) && fileIds.has(r.id) && l.sha256 === r.sha256) plan.fillBlobs.push(r.id);
  }
  plan.needsConfirm = plan.totals.update > 0;
  return plan;
}
