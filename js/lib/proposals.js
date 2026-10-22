// Proposte di collegamento e creazione derivate dai dati CONFERMATI di un documento. Funzione pura.
// Nulla viene creato qui: l'interfaccia mostra la proposta e solo il tocco dell'utente la esegue (intel.applyProposal).
import { norm } from './search.js';
import { diffDays } from './dates.js';

const SERVICE_LABEL = { luce: 'Luce', gas: 'Gas', acqua: 'Acqua', internet: 'Internet', telefono: 'Telefono', rifiuti: 'Rifiuti', condominio: 'Condominio', altro: 'Utenza' };
export const confirmed = (doc, key) => (doc.fields || []).find((f) => f.key === key && (f.status === 'confirmed' || f.status === 'corrected'))?.value;
const same = (a, b) => a && b && norm(a) === norm(b);
const stripExt = (n) => String(n).replace(/\.[a-z0-9]{2,4}$/i, '');

/** Mesi di fatturazione dedotti dalla durata del periodo (solo se il periodo è confermato). */
export function billingFromPeriod(start, end) {
  if (!start || !end) return 'none';
  const d = diffDays(end, start) + 1;
  const within = (lo, hi) => d >= lo && d <= hi;
  return within(25, 35) ? 'monthly' : within(55, 70) ? 'bimonthly' : within(85, 100) ? 'quarterly' : within(170, 190) ? 'semiannual' : within(355, 375) ? 'yearly' : 'none';
}

/**
 * @param {object} doc  documento con campi/dati confermati
 * @param {object} snap snapshot (utilities, contracts, contacts, relationships…)
 * @returns {{id:string,icon:string,title:string,why:string,action:'create'|'link',type:string,existingId?:string,data?:object}[]}
 */
export function buildProposals(doc, snap, today) {
  const out = []; const linked = new Set();
  for (const r of snap.relationships || []) { if (r.aType === 'document' && r.aId === doc.id) linked.add(`${r.bType}:${r.bId}`); if (r.bType === 'document' && r.bId === doc.id) linked.add(`${r.aType}:${r.aId}`); }
  const isLinked = (type, id) => linked.has(`${type}:${id}`);
  const issuer = doc.issuer, vat = confirmed(doc, 'issuerVat'), service = confirmed(doc, 'serviceType');

  if (doc.docKind === 'bolletta' && issuer) {
    const ex = (snap.utilities || []).find((u) => same(u.provider, issuer) && (!service || u.serviceType === service));
    if (ex) { if (!isLinked('utility', ex.id)) out.push({ id: 'link-utility', icon: 'link', type: 'utility', action: 'link', existingId: ex.id, title: `Collega all'utenza "${ex.name}"`, why: 'Stessa fornitura già presente in Utenze.' }); }
    else out.push({ id: 'create-utility', icon: 'money', type: 'utility', action: 'create', title: `Crea utenza ${SERVICE_LABEL[service] || ''} ${issuer}`.replace(/\s+/g, ' ').trim(), why: 'Aggiunge la fornitura a Utenze con importo e scadenza di questo documento.',
      data: { name: `${SERVICE_LABEL[service] || 'Utenza'} ${issuer}`, serviceType: service || 'altro', provider: issuer, reference: confirmed(doc, 'pod') || confirmed(doc, 'pdr') || undefined, amount: doc.amount, nextDue: doc.expires, billingFrequency: billingFromPeriod(confirmed(doc, 'periodStart'), confirmed(doc, 'periodEnd')), propertyId: doc.propertyId, active: true } });
  }
  if ((doc.docKind === 'polizza' || doc.docKind === 'contratto') && issuer) {
    const kind = doc.docKind === 'polizza' ? 'assicurazione' : 'altro';
    const ex = (snap.contracts || []).find((c) => same(c.counterparty, issuer) && c.kind === kind);
    if (ex) { if (!isLinked('contract', ex.id)) out.push({ id: 'link-contract', icon: 'link', type: 'contract', action: 'link', existingId: ex.id, title: `Collega al contratto "${ex.title}"`, why: 'Stessa controparte e tipo già presenti.' }); }
    else out.push({ id: 'create-contract', icon: 'money', type: 'contract', action: 'create', title: `Crea ${doc.docKind === 'polizza' ? 'polizza' : 'contratto'} con ${issuer}`, why: 'Aggiunge il contratto con scadenza e importo, così compare nello scadenziario.',
      data: { title: stripExt(doc.name), counterparty: issuer, kind, endDate: doc.expires, amount: doc.amount, propertyId: doc.propertyId, billingFrequency: doc.docKind === 'polizza' ? 'yearly' : 'none', active: true } });
  }
  if (issuer) {
    const ex = (snap.contacts || []).find((c) => same(c.name, issuer) || same(c.company, issuer));
    if (ex) { if (!isLinked('contact', ex.id)) out.push({ id: 'link-contact', icon: 'contact', type: 'contact', action: 'link', existingId: ex.id, title: `Collega al contatto "${ex.name}"`, why: 'Il fornitore è già in rubrica.' }); }
    else out.push({ id: 'create-contact', icon: 'contact', type: 'contact', action: 'create', title: `Aggiungi ${issuer} ai contatti`, why: 'Raccoglie in un punto storico, documenti e spese del fornitore.', data: { name: issuer, company: issuer, role: doc.docKind === 'tributo' ? 'ente' : 'fornitore', notes: vat ? `P.IVA ${vat}` : undefined } });
  }
  // promemoria per una scadenza futura confermata
  if (doc.expires && today && doc.expires >= today) {
    const tasks = new Map((snap.tasks || []).map((t) => [t.id, t]));
    const has = [...linked].some((k) => { const [ty, id] = k.split(':'); const t = ty === 'task' && tasks.get(id); return t && t.status === 'open' && t.due === doc.expires; });
    if (!has) out.push({ id: 'create-task', icon: 'tasks', type: 'task', action: 'create', title: 'Crea un promemoria per la scadenza', why: 'Un\'attività con scadenza collegata al documento.', data: { title: `Scadenza: ${stripExt(doc.name)}`, due: doc.expires, propertyId: doc.propertyId, notes: `Origine: documento "${doc.name}" (scadenza confermata).` } });
  }
  // garanzia con fine confermata
  const wEnd = confirmed(doc, 'warrantyEnd');
  if (wEnd) {
    const has = (snap.maintenance || []).some((m) => m.kind === 'garanzia' && m.warrantyEnd === wEnd && isLinked('maintenance', m.id));
    if (!has) out.push({ id: 'create-warranty', icon: 'shield', type: 'maintenance', action: 'create', title: 'Crea la scheda garanzia', why: `Registra la garanzia fino al ${wEnd.split('-').reverse().join('/')} in Casa.`, data: { title: `Garanzia: ${confirmed(doc, 'model') || stripExt(doc.name)}`, kind: 'garanzia', warrantyEnd: wEnd, cost: doc.amount, propertyId: doc.propertyId, notes: [confirmed(doc, 'serial') && `Matricola: ${confirmed(doc, 'serial')}`, issuer && `Fornitore: ${issuer}`, `Documento: ${doc.name}`].filter(Boolean).join('\n') } });
  }
  return out;
}
