// Elaborazione documentale (locale): testo → dati proposti → conferma/correzione dell'utente → campi del documento.
// Regole: l'originale non viene mai toccato; i dati nascono "proposti"; solo conferma/correzione aggiornano le sezioni;
// i dati confermati non vengono sovrascritti da nuove elaborazioni; ogni passaggio rilevante finisce nello storico.
import * as repo from './repo.js';
import { DomusError } from './db.js';
import { extractFields, mergeFields, topLevelPatch, processingOf, findRelated } from '../lib/extract.js';
import { pdfToText } from '../lib/pdftext.js';
import { isDate, formatIT } from '../lib/dates.js';

export const MAX_TEXT = 8000;
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
    const merged = mergeFields(doc.fields || [], ex.fields);
    const proposed = merged.filter((f) => f.status === 'proposed').length;
    return await repo.update('documents', id, {
      text: t.slice(0, MAX_TEXT), textSource: src, fields: merged, processing: processingOf(merged), procError: '', extractedAt: nowIso(),
      history: hist(doc, `Elaborazione (${src}): ${proposed} dat${proposed === 1 ? 'o proposto' : 'i proposti'}${t.length > MAX_TEXT ? `; testo salvato troncato a ${MAX_TEXT} caratteri` : ''}`),
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
  if (action === 'confirm' || action === 'correct') patch = topLevelPatch(f, (await repo.snapshot()).properties);
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
