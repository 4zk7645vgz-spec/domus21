// Elaborazione documentale (locale): testo → dati proposti → conferma/correzione dell'utente → campi del documento.
// Regole: l'originale non viene mai toccato; i dati nascono "proposti"; solo conferma/correzione aggiornano le sezioni;
// i dati confermati non vengono sovrascritti da nuove elaborazioni; ogni passaggio rilevante finisce nello storico.
import * as repo from './repo.js';
import { DomusError } from './db.js';
import { extractFields, mergeFields, topLevelPatch, processingOf, findRelated, EXTRACTOR_VERSION } from '../lib/extract.js';
import { buildProposals } from '../lib/proposals.js';
import { STORE_OF } from './schema.js';
import { pdfToText } from '../lib/pdftext.js';
import { isDate, formatIT, todayStr } from '../lib/dates.js';

export const MAX_TEXT = 8000;
const AUTO_KEYS = ['issuer', 'docNo', 'date', 'amount', 'amountNet', 'vatAmount'];
const nowIso = () => new Date().toISOString();
const AMOUNT_KEYS = ['amount', 'amountNet', 'vatAmount'];
const eur = (v) => `€ ${Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Valore leggibile per l'interfaccia. */
export function display(f) {
  if (AMOUNT_KEYS.includes(f.key)) return eur(f.value);
  if (['date', 'expires', 'warrantyEnd'].includes(f.key) && isDate(f.value)) return formatIT(f.value);
  if (f.key === 'vatRate') return `${f.value}%`;
  return f.value;
}
const hist = (doc, text) => [...(doc.history || []), { at: nowIso(), text }].slice(-200);

async function readText(doc) {
  const blob = await repo.getDocumentBlob(doc.id);
  if (!blob) return { text: '', reason: 'file originale assente nella memoria dell\'app' };
  const name = (doc.name || '').toLowerCase();
  if ((doc.mime || '').startsWith('text/') || /\.(txt|md|csv)$/.test(name)) return { text: await blob.text(), source: 'file di testo' };
  if (doc.mime === 'application/pdf' || name.endsWith('.pdf')) {
    const r = await pdfToText(await blob.arrayBuffer());
    return r.ok ? { text: r.text, source: 'PDF' } : { text: '', reason: r.reason };
  }
  if ((doc.mime || '').startsWith('image/')) return { text: '', reason: 'immagine: Domus non fa OCR. Apri l\'immagine, usa "Copia testo" di iOS e incolla il testo qui' };
  return { text: '', reason: 'formato non leggibile automaticamente' };
}

/**
 * Elabora (o rielabora) un documento. Ripetibile senza duplicazioni. Non lancia per errori di lettura:
 * li registra nello stato del documento ("error"/"in attesa") lasciando intatto il file originale.
 */
export async function processDocument(id, { text, source } = {}) {
  const doc = await repo.get('documents', id);
  if (!doc) throw new DomusError('NOT_FOUND', 'Documento non trovato.');
  try {
    let t = text, src = source || 'testo incollato', reason = '';
    if (t == null) { const r = await readText(doc); t = r.text; src = r.source || ''; reason = r.reason || ''; }
    t = String(t || '').replace(/\r/g, '').trim();
    if (!t) {
      if (doc.text) { t = doc.text; src = doc.textSource || src; }    // rielaborazione con il testo già salvato
      else return await repo.update('documents', id, { processing: 'pending', procError: `Testo non disponibile: ${reason || 'nessun testo'}.` });
    }
    const snap = await repo.snapshot();
    const ex = extractFields(t, { properties: snap.properties });
    const merged = mergeFields(doc.fields || [], ex.fields).map((f) => ({ ...f }));
    const patch = {}; const notes = [];
    // categoria: è organizzativa, non un fatto → assegnata subito se manca (modificabile in ogni momento)
    const cat = merged.find((f) => f.key === 'categoryId' && f.status === 'proposed');
    if (cat && !doc.categoryId) { const p = topLevelPatch(cat, [], snap.categories); if (p.categoryId) { cat.status = 'confirmed'; Object.assign(patch, p); notes.push(`categoria "${cat.value}" assegnata automaticamente`); } }
    // conferma automatica (opzione dell'utente, spenta di default): solo dati letti con alta affidabilità, senza avvisi di incoerenza,
    // senza sostituire valori già presenti. Resta traccia nello storico e ogni dato è riportabile a "da verificare".
    if ((await repo.getMeta('autoConfirm')) && !ex.warnings.length) {
      let n = 0;
      for (const f of merged) {
        if (f.status !== 'proposed' || f.conf !== 'high' || f.kind !== 'extracted' || !AUTO_KEYS.includes(f.key)) continue;
        const p = topLevelPatch(f, [], []); const k = Object.keys(p)[0];
        if (k && doc[k] != null && doc[k] !== '' && String(doc[k]) !== String(p[k])) continue;
        f.status = 'confirmed'; Object.assign(patch, p); n++;
      }
      if (n) notes.push(`${n} dati confermati automaticamente (alta affidabilità)`);
    }
    const proposed = merged.filter((f) => f.status === 'proposed').length;
    return await repo.update('documents', id, {
      ...patch, text: t.slice(0, MAX_TEXT), textSource: src, fields: merged, processing: processingOf(merged), procError: '', extractedAt: nowIso(),
      history: hist(doc, `Elaborazione (${src}): ${proposed} dat${proposed === 1 ? 'o proposto' : 'i proposti'}${notes.length ? `; ${notes.join('; ')}` : ''}${t.length > MAX_TEXT ? `; testo salvato troncato a ${MAX_TEXT} caratteri` : ''}`),
    });
  } catch (e) {
    try { await repo.update('documents', id, { processing: 'error', procError: String(e.message || e).slice(0, 280) }); } catch { /* il file originale resta comunque intatto */ }
    return null;
  }
}

function validate(key, value) {
  const v = String(value ?? '').trim();
  if (!v) return 'Valore vuoto.';
  if (['date', 'expires', 'warrantyEnd'].includes(key) && !isDate(v)) return 'Data non valida (AAAA-MM-GG).';
  if (AMOUNT_KEYS.includes(key) && !(Number.isFinite(Number(v.replace(',', '.'))) && Number(v.replace(',', '.')) >= 0)) return 'Importo non valido.';
  return '';
}

/** Conferma, corregge, rifiuta o riporta a "proposto" un dato. Applica ai campi del documento solo conferme/correzioni. */
export async function reviewField(id, key, action, newValue) {
  const doc = await repo.get('documents', id);
  if (!doc) throw new DomusError('NOT_FOUND', 'Documento non trovato.');
  const fields = (doc.fields || []).map((f) => ({ ...f }));
  const f = fields.find((x) => x.key === key);
  if (!f) throw new DomusError('NOT_FOUND', 'Dato non trovato (rielabora il documento).');
  const label = f.label.toLowerCase();
  let patch = {}, entry;
  if (action === 'confirm') { f.status = 'confirmed'; entry = `Confermato ${label}: ${display(f)}`; }
  else if (action === 'correct') {
    const err = validate(key, newValue); if (err) throw new DomusError('VALIDATION', err);
    const nv = AMOUNT_KEYS.includes(key) ? Number(String(newValue).replace(',', '.')).toFixed(2) : String(newValue).trim();
    f.original = f.original || f.value; f.value = nv; f.status = 'corrected'; f.kind = 'manual'; f.conf = 'high'; entry = `Corretto ${label}: ${display(f)} (letto: ${f.original})`;
  } else if (action === 'reject') { f.status = 'rejected'; entry = `Rifiutato ${label}: ${display(f)}`; }
  else if (action === 'reset') { f.status = 'proposed'; entry = `Riportato a proposto: ${label}`; }
  else throw new DomusError('VALIDATION', 'Azione non valida.');
  if (action === 'confirm' || action === 'correct') { const s = await repo.snapshot(); patch = topLevelPatch(f, s.properties, s.categories); }
  return repo.update('documents', id, { ...patch, fields, processing: processingOf(fields), history: hist(doc, entry) });
}

/** Imposta lo stato di pagamento: solo l'utente può dichiararlo (mai dedotto dalla presenza del documento). */
export async function setPayState(id, payState) {
  const doc = await repo.get('documents', id);
  return repo.update('documents', id, { payState, history: hist(doc, `Pagamento: ${{ paid: 'pagato', unpaid: 'da pagare', unknown: 'non verificato' }[payState]}`) });
}

const confirmedValue = (doc, key) => (doc.fields || []).find((f) => f.key === key && (f.status === 'confirmed' || f.status === 'corrected'))?.value;

/** Proposta confermata dall'utente: attività di scadenza collegata al documento. Idempotente. */
export async function createExpiryTask(docId) {
  const doc = await repo.get('documents', docId);
  if (!doc?.expires) throw new DomusError('VALIDATION', 'Il documento non ha una scadenza confermata.');
  const links = await repo.linksOf('document', docId);
  const ex = links.find((l) => l.type === 'task' && l.rec.due === doc.expires && l.rec.status === 'open');
  if (ex) return { task: ex.rec, existing: true };
  const task = await repo.create('tasks', { title: `Scadenza: ${doc.name}`, due: doc.expires, priority: 'normal', propertyId: doc.propertyId, notes: `Origine: documento "${doc.name}" (scadenza confermata dall'utente).` });
  await repo.link('task', task.id, 'document', docId);
  await repo.update('documents', docId, { history: hist(doc, `Creata attività di scadenza per il ${formatIT(doc.expires)}`) });
  return { task, existing: false };
}

/** Proposta confermata: scheda garanzia (Casa → manutenzioni) dalla fine garanzia confermata. Idempotente. */
export async function createWarranty(docId) {
  const doc = await repo.get('documents', docId);
  const end = confirmedValue(doc || {}, 'warrantyEnd');
  if (!end) throw new DomusError('VALIDATION', 'Conferma prima la "Fine garanzia".');
  const links = await repo.linksOf('document', docId);
  const ex = links.find((l) => l.type === 'maintenance' && l.rec.kind === 'garanzia' && l.rec.warrantyEnd === end);
  if (ex) return { record: ex.rec, existing: true };
  const model = confirmedValue(doc, 'model'), serial = confirmedValue(doc, 'serial');
  const record = await repo.create('maintenance', { title: `Garanzia: ${model || doc.name}`, kind: 'garanzia', propertyId: doc.propertyId, warrantyEnd: end, cost: doc.amount, notes: [serial && `Matricola: ${serial}`, doc.issuer && `Fornitore: ${doc.issuer}`, `Documento: ${doc.name}`].filter(Boolean).join('\n') });
  await repo.link('maintenance', record.id, 'document', docId);
  await repo.update('documents', docId, { history: hist(doc, `Creata scheda garanzia fino al ${formatIT(end)}`) });
  return { record, existing: false };
}

export { findRelated };

/** Esegue una proposta (creazione o collegamento) scelta dall'utente. Idempotente: se non è più valida, non fa nulla. */
export async function applyProposal(docId, proposalId) {
  const [doc, snap] = await Promise.all([repo.get('documents', docId), repo.snapshot()]);
  if (!doc) throw new DomusError('NOT_FOUND', 'Documento non trovato.');
  const p = buildProposals(doc, snap, todayStr()).find((x) => x.id === proposalId);
  if (!p) throw new DomusError('NOT_FOUND', 'Proposta non più disponibile (forse già applicata).');
  let id = p.existingId;
  if (p.action === 'create') { const data = Object.fromEntries(Object.entries(p.data).filter(([, v]) => v !== undefined && v !== '')); id = (await repo.create(STORE_OF[p.type], data)).id; }
  await repo.link('document', docId, p.type, id);
  await repo.update('documents', docId, { history: hist(doc, p.action === 'create' ? `Creato dal documento: ${p.title}` : `Collegato: ${p.title}`) });
  return { type: p.type, id, created: p.action === 'create', title: p.title };
}

/**
 * Dopo un aggiornamento con regole di lettura migliorate rielabora i documenti già caricati, UNA volta per versione delle regole.
 * È solo additivo: i dati confermati, corretti o rifiutati non cambiano; compaiono solo dati nuovi, da verificare.
 */
export async function upgradeDocuments() {
  const v = (await repo.getMeta('extractorVersion')) || 0;
  if (v >= EXTRACTOR_VERSION) return null;
  const docs = (await repo.snapshot()).documents.filter((d) => d.text || d.mime === 'application/pdf' || (d.mime || '').startsWith('text/'));
  let touched = 0, added = 0;
  for (const d of docs) {
    const before = (d.fields || []).filter((f) => f.status === 'proposed').length;
    const r = await processDocument(d.id);
    if (!r) continue;
    const after = (r.fields || []).filter((f) => f.status === 'proposed').length;
    if (after > before) { touched++; added += after - before; }
  }
  await repo.setMeta('extractorVersion', EXTRACTOR_VERSION);
  await repo.audit('upgrade', `Rielaborazione automatica (regole v${EXTRACTOR_VERSION}): ${docs.length} documenti, ${added} nuovi dati proposti`);
  return { docs: docs.length, touched, added };
}
