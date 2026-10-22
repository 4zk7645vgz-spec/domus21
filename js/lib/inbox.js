// "Da sistemare": coda unica di ciò che richiede una tua decisione. Funzione pura (snapshot, oggi) → voci ordinate per priorità.
// Ogni voce porta un collegamento al documento e, se esiste una proposta eseguibile con un tocco, l'azione.
import { buildProposals } from './proposals.js';

const NEEDS_AMOUNT = ['fattura', 'ricevuta', 'bolletta', 'preventivo', 'tributo'];

export function buildInbox(snap, today) {
  const items = []; const seenCreate = new Set();
  for (const d of snap.documents || []) {
    const href = `#/archive/${d.id}`; const proposed = (d.fields || []).filter((f) => f.status === 'proposed');
    if (d.processing === 'error') items.push({ id: `err:${d.id}`, prio: 1, tone: 'danger', icon: 'alert', title: `Lettura non riuscita: ${d.name}`, sub: d.procError || 'Riprova o incolla il testo.', href });
    else if (d.processing === 'review' && proposed.length) items.push({ id: `rev:${d.id}`, prio: 3, tone: 'accent', icon: 'check', title: `Verifica ${proposed.length} dat${proposed.length === 1 ? 'o' : 'i'}: ${d.name}`, sub: 'Conferma, correggi o rifiuta quanto letto.', href });
    else if ((d.processing || 'pending') === 'pending' && !d.text) items.push({ id: `pen:${d.id}`, prio: 4, tone: 'warn', icon: 'doc', title: `Aggiungi il testo: ${d.name}`, sub: 'Nessun testo leggibile: incolla il testo copiato dall\'immagine.', href });
    if (d.processing && d.processing !== 'pending' && NEEDS_AMOUNT.includes(d.docKind) && d.amount == null && !proposed.some((f) => f.key === 'amount'))
      items.push({ id: `amt:${d.id}`, prio: 5, tone: 'warn', icon: 'money', title: `Importo non trovato: ${d.name}`, sub: 'Inseriscilo con "Modifica dati" per averlo nelle spese.', href });
    if (d.payState === 'unpaid' && d.expires && d.expires < today) items.push({ id: `late:${d.id}`, prio: 2, tone: 'danger', icon: 'alert', title: `Da pagare, scaduto: ${d.name}`, sub: d.amount != null ? `${d.amount.toFixed(2).replace('.', ',')} €` : '', href });
    if (d.processing === 'done' || d.processing === 'review') for (const p of buildProposals(d, snap, today)) if (!(p.action === 'create' && seenCreate.has(p.title)) && (p.action !== 'create' || seenCreate.add(p.title))) items.push({ id: `${p.id}:${d.id}`, prio: 6, tone: 'accent', icon: p.icon, title: p.title, sub: `Da: ${d.name}`, href, action: { label: p.action === 'link' ? 'Collega' : 'Crea', docId: d.id, proposalId: p.id } });
  }
  return items.sort((a, b) => a.prio - b.prio || a.title.localeCompare(b.title, 'it'));
}
