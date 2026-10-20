// Pannello "Dati estratti" della scheda documento: stato di elaborazione, dati proposti con provenienza e affidabilità,
// conferma / correzione / rifiuto, stato di pagamento e azioni proposte (mai eseguite senza il tuo tocco).
import { h, icon } from './h.js';
import * as intel from '../data/intel.js';
import { extractFields, findRelated, TOP_LEVEL } from '../lib/extract.js';
import { confirmDialog, toast, showError } from './kit.js';
import { promptForm } from './prompt.js';
import { formatIT } from '../lib/dates.js';
import { hrefOf } from './common.js';

export const PROC = { pending: ['In attesa', 'warn'], processing: ['In elaborazione', 'accent'], review: ['Da verificare', 'accent'], done: ['Elaborato', 'ok'], error: ['Errore', 'danger'] };
const KIND = { extracted: 'letto nel testo', calculated: 'calcolato', inferred: 'ipotesi', manual: 'inserito da te' };
const CONF = { high: 'affidabilità alta', medium: 'affidabilità media', low: 'affidabilità bassa' };
const STATUS = { proposed: ['Da verificare', 'accent'], confirmed: ['Confermato', 'ok'], corrected: ['Corretto da te', 'ok'], rejected: ['Rifiutato', 'danger'] };
const KINDS_LABEL = { fattura: 'Fattura', ricevuta: 'Ricevuta / scontrino', preventivo: 'Preventivo', contratto: 'Contratto', polizza: 'Polizza assicurativa', bolletta: 'Bolletta / utenza', garanzia: 'Garanzia', manuale: 'Manuale', certificato: 'Certificato / dichiarazione', altro: 'Altro', nd: 'Non classificato' };
const shown = (f) => (f.key === 'docKind' ? KINDS_LABEL[f.value] || f.value : intel.display(f));

export function extractionPanel(doc, { snap, rels, ctx }) {
  const run = async (fn, okMsg) => { try { const r = await fn(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'ok'); } catch (e) { showError(e); } ctx.refresh(); };
  const [plabel, pcls] = PROC[doc.processing || 'pending'] || PROC.pending;
  const box = h('div');
  box.append(h('h2', { class: 'sec' }, h('span', null, 'Dati estratti'), h('span', { class: `badge ${pcls}` }, plabel)));
  box.append(h('p', { class: 'muted small' }, 'Domus legge il testo con regole automatiche (non è un\'intelligenza artificiale): ogni dato è una PROPOSTA con la riga d\'origine. Entra nel gestionale solo se lo confermi.'));
  if (doc.procError) box.append(h('div', { class: `banner ${doc.processing === 'error' ? 'danger' : ''}`, role: 'note' }, icon('alert', 20), h('div', null, h('b', null, doc.processing === 'error' ? 'Elaborazione non riuscita' : 'Testo non disponibile'), h('p', null, `${doc.procError} Il file originale è intatto.`))));

  const paste = h('button', { class: 'btn', type: 'button', onclick: async () => {
    const v = await promptForm({ title: 'Incolla il testo del documento', submitLabel: 'Analizza', fields: [{ k: 'text', type: 'text', label: 'Testo (su iPhone: tieni premuto sul testo dell\'immagine → "Copia testo")', req: true }] });
    if (v) run(() => intel.processDocument(doc.id, { text: v.text, source: 'testo incollato' }), 'Testo analizzato: controlla i dati proposti.');
  } }, icon('edit', 18), doc.text ? 'Sostituisci testo' : 'Incolla testo');
  const again = h('button', { class: 'btn', type: 'button', onclick: () => run(() => intel.processDocument(doc.id), 'Documento rielaborato (i dati confermati non cambiano).') }, icon('repeat', 18), doc.text ? 'Rielabora' : 'Analizza file');
  box.append(h('div', { class: 'btn-row' }, again, paste));

  const fields = doc.fields || [];
  if (doc.text) {
    const warns = extractFields(doc.text).warnings;
    for (const w of warns) box.append(h('div', { class: 'banner', role: 'note' }, icon('alert', 20), h('div', null, h('b', null, 'Da controllare'), h('p', null, w))));
  }
  const rel = findRelated(doc, snap.documents);
  for (const r of rel) box.append(h('div', { class: 'banner', role: 'note' }, icon('alert', 20), h('div', null, h('b', null, r.reason), h('a', { href: hrefOf('document', r.doc.id) }, r.doc.name))));

  const confirm = async (f, action, value) => {
    if (action === 'confirm' || action === 'correct') {
      const k = TOP_LEVEL[f.key]; const newV = action === 'correct' ? String(value) : f.value;
      const cur = k && doc[k] != null && doc[k] !== '' && !(k === 'docKind' && doc[k] === 'nd') ? String(doc[k]) : '';
      if (cur && cur !== newV && !(['amount', 'amountNet', 'vatAmount'].includes(k) && Number(cur) === Number(newV.replace(',', '.')))) {
        const ok = await confirmDialog({ title: 'Sostituire il dato esistente?', message: `${f.label}: attualmente "${cur}", il dato proposto è "${newV}". Il valore attuale verrà sostituito (resta traccia nello storico).`, confirmLabel: 'Sostituisci' });
        if (!ok) return;
      }
    }
    run(() => intel.reviewField(doc.id, f.key, action, value));
  };
  const editF = async (f) => {
    const isDate = ['date', 'expires', 'warrantyEnd'].includes(f.key), isNum = ['amount', 'amountNet', 'vatAmount'].includes(f.key);
    const v = await promptForm({ title: `Correggi: ${f.label}`, submitLabel: 'Salva correzione', values: { v: f.value }, fields: [{ k: 'v', type: isDate ? 'date' : isNum ? 'num' : 'str', label: f.label, req: true }] });
    if (v) confirm(f, 'correct', v.v);
  };

  if (!fields.length) box.append(h('p', { class: 'muted' }, doc.processing === 'pending' ? 'Nessun dato ancora. Analizza il file o incolla il testo.' : 'Nessun dato riconosciuto nel testo.'));
  else {
    const sure = fields.filter((f) => f.status === 'proposed' && f.conf === 'high' && f.kind === 'extracted');
    if (sure.length > 1) box.append(h('button', { class: 'btn', type: 'button', onclick: async () => { for (const f of sure) { try { await intel.reviewField(doc.id, f.key, 'confirm'); } catch (e) { showError(e); break; } } toast(`${sure.length} dati confermati.`, 'ok'); ctx.refresh(); } }, icon('check', 18), `Conferma i ${sure.length} dati letti con alta affidabilità`));
    const order = ['docKind', 'issuer', 'issuerVat', 'docNo', 'date', 'expires', 'amountNet', 'vatRate', 'vatAmount', 'amount', 'propertyId', 'warrantyMonths', 'warrantyEnd', 'model', 'serial'];
    const sorted = [...fields].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    box.append(h('div', { class: 'card' }, h('ul', { class: 'list' }, sorted.map((f) => {
      const [sl, sc] = STATUS[f.status];
      return h('li', { class: 'fld' },
        h('div', { class: 'fld-top' }, h('span', { class: 'fld-label' }, f.label), h('span', { class: `badge ${sc}` }, sl)),
        h('div', { class: 'fld-val' }, shown(f)),
        h('div', { class: 'fld-meta muted small' }, `${KIND[f.kind]} · ${CONF[f.conf]}${f.original ? ` · letto: ${f.original}` : ''}`),
        f.snippet ? h('div', { class: 'fld-snip small' }, `“${f.snippet}”`) : null,
        h('div', { class: 'btn-row' },
          f.status === 'proposed' ? [h('button', { class: 'btn primary', type: 'button', onclick: () => confirm(f, 'confirm') }, icon('check', 16), 'Conferma'), h('button', { class: 'btn', type: 'button', onclick: () => editF(f) }, 'Correggi'), h('button', { class: 'btn ghost', type: 'button', onclick: () => confirm(f, 'reject') }, 'Rifiuta')]
            : h('button', { class: 'btn ghost', type: 'button', onclick: () => run(() => intel.reviewField(doc.id, f.key, 'reset')) }, f.status === 'rejected' ? 'Ripristina' : 'Riporta a "da verificare"')));
    }))));
  }

  // pagamento: dichiarato solo da te
  box.append(h('h2', { class: 'sec' }, h('span', null, 'Pagamento')));
  const pay = [['unknown', 'Non verificato'], ['unpaid', 'Da pagare'], ['paid', 'Pagato']];
  box.append(h('div', { class: 'chips', role: 'group', 'aria-label': 'Stato di pagamento' }, pay.map(([k, l]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String((doc.payState || 'unknown') === k), onclick: () => run(() => intel.setPayState(doc.id, k)) }, l))));
  box.append(h('p', { class: 'muted small' }, 'Domus non considera pagato un documento solo perché è archiviato: lo stato lo imposti tu.'));

  // azioni proposte
  const acts = [];
  if (doc.expires) acts.push(h('button', { class: 'btn', type: 'button', onclick: () => run(() => intel.createExpiryTask(doc.id), (r) => (r.existing ? 'Esiste già un\'attività per questa scadenza.' : 'Attività creata e collegata al documento.')) }, icon('tasks', 18), `Crea attività per la scadenza ${formatIT(doc.expires, false)}`));
  if (fields.some((f) => f.key === 'warrantyEnd' && (f.status === 'confirmed' || f.status === 'corrected'))) acts.push(h('button', { class: 'btn', type: 'button', onclick: () => run(() => intel.createWarranty(doc.id), (r) => (r.existing ? 'Scheda garanzia già presente.' : 'Scheda garanzia creata in Casa.')) }, icon('wrench', 18), 'Crea scheda garanzia'));
  if (acts.length) box.append(h('h2', { class: 'sec' }, h('span', null, 'Azioni proposte')), h('div', { class: 'btn-row' }, acts));

  if ((doc.history || []).length) box.append(h('details', { class: 'hist' }, h('summary', null, `Storico modifiche (${doc.history.length})`), h('ul', { class: 'list' }, [...doc.history].reverse().map((e) => h('li', { class: 'small' }, `${formatIT(e.at.slice(0, 10), false)} · ${e.text}`)))));
  return box;
}
