// "Chiedi a Domus": risposte alle domande più comuni calcolate sui dati REALMENTE registrati, con le fonti.
// NON è un modello linguistico: riconosce un insieme limitato di intenti per parole chiave. Se non capisce, lo dice
// e ripiega sulla ricerca nel testo dei documenti, citando il documento e il passaggio.
import { norm } from './search.js';
import { computeExpenses, BUCKETS } from './expenses.js';
import { addDays, cmp, formatIT } from './dates.js';

const eur = (n) => `€ ${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const src = (type, id, title, note) => ({ type, id, title, note });
export const CAPABILITIES = 'spese (anche per anno, immobile, categoria o fornitore), documenti da verificare, cose da pagare, scadenze, garanzie, informazioni mancanti, oppure una parola da cercare nel testo dei documenti';

export function snippetOf(text, terms, w = 70) {
  const n = norm(text); let at = -1;
  for (const t of terms) { at = n.indexOf(t); if (at >= 0) break; }
  if (at < 0) return '';
  const s = text.replace(/\s+/g, ' ');
  return (at > w ? '…' : '') + s.slice(Math.max(0, at - w), at + w).trim() + '…';
}

/** @returns {{understood:boolean, lines:string[], sources:object[]}} */
export function answer(question, snap, today) {
  const q = norm(question).trim(); const terms = q.split(/\s+/).filter((w) => w.length > 2);
  const docs = snap.documents || [], lines = [], sources = [];
  if (!q) return { understood: false, lines: [`Posso rispondere su: ${CAPABILITIES}.`], sources };

  if (/da verificare|verificare|da controllare/.test(q)) {
    const list = docs.filter((d) => d.processing === 'review');
    lines.push(list.length ? `${list.length} document${list.length === 1 ? 'o ha' : 'i hanno'} dati proposti in attesa della tua verifica.` : 'Nessun documento ha dati in attesa di verifica.');
    for (const d of list) sources.push(src('document', d.id, d.name, `${d.fields.filter((f) => f.status === 'proposed').length} dati da verificare`));
    return { understood: true, lines, sources };
  }
  if (/mancant|incomplet|senza (data|importo)|non (elaborat|letti)/.test(q)) {
    const pend = docs.filter((d) => d.processing === 'pending' || !d.processing);
    const noAmt = docs.filter((d) => ['fattura', 'ricevuta', 'preventivo', 'bolletta'].includes(d.docKind) && d.amount == null);
    lines.push(`${pend.length} documenti non ancora elaborati; ${noAmt.length} fatture/ricevute/preventivi/bollette senza importo confermato.`);
    for (const d of pend.slice(0, 15)) sources.push(src('document', d.id, d.name, 'non elaborato'));
    for (const d of noAmt.slice(0, 15)) sources.push(src('document', d.id, d.name, 'importo non confermato'));
    return { understood: true, lines, sources };
  }
  if (/da pagare|devo pagare|pagare|non pagat|pagament/.test(q) && !/speso|spese|costi/.test(q)) {
    const unpaid = docs.filter((d) => d.payState === 'unpaid');
    const soon = addDays(today, 30);
    const dues = [...(snap.utilities || []).filter((u) => u.active !== false && u.nextDue && cmp(u.nextDue, soon) <= 0).map((u) => ['utility', u, u.name]), ...(snap.contracts || []).filter((c) => c.active !== false && c.nextDue && cmp(c.nextDue, soon) <= 0).map((c) => ['contract', c, c.title])];
    const tot = unpaid.reduce((s, d) => s + (d.amount || 0), 0);
    lines.push(`Documenti segnati "da pagare": ${unpaid.length}${unpaid.length ? ` (${eur(tot)})` : ''}. Pagamenti di utenze/contratti entro 30 giorni: ${dues.length}.`);
    lines.push('Un documento archiviato NON è considerato pagato: lo stato "pagato" lo imposti tu.');
    for (const d of unpaid) sources.push(src('document', d.id, d.name, d.amount != null ? eur(d.amount) : 'importo non confermato'));
    for (const [t, r, title] of dues) sources.push(src(t, r.id, title, `scade ${formatIT(r.nextDue)}`));
    return { understood: true, lines, sources };
  }
  if (/speso|spese|spesa|costi|costato|quanto/.test(q)) {
    const year = /\b(20\d\d)\b/.exec(q)?.[1];
    const prop = (snap.properties || []).find((p) => q.includes(norm(p.name)));
    const cat = (snap.categories || []).find((c) => q.includes(norm(c.name)));
    const sup = [...new Set(docs.map((d) => d.issuer).filter(Boolean))].find((s) => q.includes(norm(s)));
    const e = computeExpenses(snap, { year, propertyId: prop?.id, categoryId: cat?.id });
    const rows = sup ? e.rows.filter((d) => d.issuer === sup) : e.rows;
    const sum = { quote: 0, paid: 0, due: 0, unverified: 0 };
    for (const d of rows) sum[d.docKind === 'preventivo' ? 'quote' : d.payState === 'paid' ? 'paid' : d.payState === 'unpaid' ? 'due' : 'unverified'] += d.amount;
    const scope = [year && `anno ${year}`, prop && prop.name, cat && cat.name, sup].filter(Boolean).join(', ');
    if (!rows.length) lines.push(`Nessun importo confermato${scope ? ` per ${scope}` : ''}. Conto solo importi che hai confermato o inserito.`);
    else { lines.push(`Importi confermati${scope ? ` (${scope})` : ''}, ${rows.length} documenti:`); for (const [k, l] of Object.entries(BUCKETS)) if (sum[k]) lines.push(`${l}: ${eur(sum[k])}`); }
    if (e.noAmount) lines.push(`Attenzione: ${e.noAmount} documenti di tipo fattura/ricevuta/preventivo/bolletta non hanno un importo confermato e non sono inclusi.`);
    if (e.duplicates.length) lines.push(`${e.duplicates.length} possibili duplicati esclusi dal conteggio.`);
    for (const d of rows.slice(0, 20)) sources.push(src('document', d.id, d.name, eur(d.amount)));
    return { understood: true, lines, sources };
  }
  if (/garanzi/.test(q)) {
    const m = (snap.maintenance || []).filter((x) => x.warrantyEnd);
    lines.push(m.length ? 'Garanzie registrate (dalla più vicina):' : 'Nessuna garanzia registrata. Conferma il dato "Fine garanzia" su un documento e crea la scheda.');
    for (const x of m.sort((a, b) => cmp(a.warrantyEnd, b.warrantyEnd))) { lines.push(`${x.title}: fino al ${formatIT(x.warrantyEnd)}${cmp(x.warrantyEnd, today) < 0 ? ' (scaduta)' : ''}`); sources.push(src('maintenance', x.id, x.title, formatIT(x.warrantyEnd))); }
    return { understood: true, lines, sources };
  }
  if (/scad|rinnov/.test(q)) {
    const lim = addDays(today, 60); const items = [];
    for (const d of docs) if (d.expires && cmp(d.expires, lim) <= 0) items.push(['document', d.id, d.name, d.expires]);
    for (const t of snap.tasks || []) if (t.status === 'open' && t.due && cmp(t.due, lim) <= 0) items.push(['task', t.id, t.title, t.due]);
    for (const c of snap.contracts || []) if (c.active !== false && c.endDate && cmp(c.endDate, lim) <= 0) items.push(['contract', c.id, c.title, c.endDate]);
    items.sort((a, b) => cmp(a[3], b[3]));
    lines.push(items.length ? `${items.length} scadenze entro 60 giorni (incluse quelle già passate):` : 'Nessuna scadenza registrata entro 60 giorni.');
    for (const [t, id, title, due] of items) sources.push(src(t, id, title, `${formatIT(due)}${cmp(due, today) < 0 ? ' · scaduta' : ''}`));
    return { understood: true, lines, sources };
  }
  // ricerca testuale nel contenuto dei documenti
  const hits = [];
  for (const d of docs) {
    const hay = norm(`${d.name} ${d.issuer || ''} ${d.docNo || ''} ${d.text || ''}`);
    if (terms.length && terms.every((t) => hay.includes(t))) hits.push({ d, snip: snippetOf(d.text || d.name, terms) });
  }
  if (hits.length) {
    lines.push(`Non riconosco la domanda come una di quelle che so calcolare, ma ${hits.length} document${hits.length === 1 ? 'o contiene' : 'i contengono'} le parole cercate (passaggi sotto):`);
    for (const { d, snip } of hits.slice(0, 10)) sources.push(src('document', d.id, d.name, snip));
    return { understood: false, lines, sources };
  }
  return { understood: false, lines: [`Non ho trovato nulla e non so rispondere a questa domanda. Posso rispondere su: ${CAPABILITIES}.`], sources };
}
