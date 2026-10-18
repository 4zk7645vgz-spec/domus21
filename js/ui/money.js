import { h, icon, money } from './h.js';
import * as repo from '../data/repo.js';
import { row, card, empty, kv, segmented, labelOf, nav, dueEl, dueText } from './common.js';
import { editEntity, confirmDialog, toast, showError } from './kit.js';
import { linksPanel } from './links.js';
import { promptForm } from './prompt.js';
import { todayStr, formatIT, cmp } from '../lib/dates.js';
import { buildICS } from '../lib/ics.js';
import { deliver } from '../lib/deliver.js';

let tab = 'utility';
const CFG = { utility: { store: 'utilities', one: 'Utenza', title: (r) => r.name, sub: (r) => r.provider, route: 'utility' }, contract: { store: 'contracts', one: 'Contratto', title: (r) => r.title, sub: (r) => r.counterparty, route: 'contract' } };
const add = (type, ctx) => editEntity({ store: CFG[type].store, title: `Nuov${type === 'utility' ? 'a utenza' : 'o contratto'}` }).then((r) => { if (r) { toast('Salvato', 'ok'); ctx.refresh(); } });

export async function listView(_p, ctx) {
  const snap = await repo.snapshot(); const today = todayStr();
  const c = CFG[tab];
  const items = [...snap[c.store]].sort((a, b) => cmp(a.nextDue || '9999', b.nextDue || '9999'));
  const content = items.length ? card(items.map((r) => row({ title: c.title(r), sub: [c.sub(r), r.amount != null ? money(r.amount) : ''].filter(Boolean).join(' · '), badge: r.active === false ? h('span', { class: 'badge' }, 'Chiusa') : null, meta: r.nextDue ? dueText(r.nextDue, today) : '', metaClass: r.nextDue && r.nextDue < today ? 'due-over' : '', href: `#/money/${c.route}/${r.id}` })))
    : empty('money', tab === 'utility' ? 'Nessuna utenza' : 'Nessun contratto', 'Registra fornitori, scadenze di pagamento e rinnovi. Domus non si collega a conti bancari.', h('button', { class: 'btn primary', type: 'button', onclick: () => add(tab, ctx) }, tab === 'utility' ? 'Nuova utenza' : 'Nuovo contratto'));
  return { title: 'Utenze e contratti', body: h('div', null, segmented([['utility', 'Utenze'], ['contract', 'Contratti']], tab, (k) => { tab = k; ctx.refresh(); }), content), back: '#/more', fab: { label: 'Aggiungi', onclick: () => add(tab, ctx) } };
}

export async function detailView([type, id], ctx) {
  const c = CFG[type]; if (!c) return { title: '', body: empty('alert', 'Non trovato', '') };
  const r = await repo.get(c.store, id);
  if (!r) return { title: c.one, back: '#/money', body: empty('alert', `${c.one} non trovato`, '') };
  const [pays, snap] = await Promise.all([repo.listPayments(id), repo.snapshot()]); const today = todayStr();
  pays.sort((a, b) => cmp(b.paidAt, a.paidAt));
  const prop = snap.properties.find((x) => x.id === r.propertyId)?.name;
  const info = type === 'utility'
    ? [['Servizio', labelOf('utilities', 'serviceType', r.serviceType)], ['Fornitore', r.provider], ['Riferimento', r.reference], ['Immobile', prop], ['Inizio', r.startDate ? formatIT(r.startDate) : ''], ['Fatturazione', labelOf('utilities', 'billingFrequency', r.billingFrequency)], ['Importo tipico', r.amount != null ? money(r.amount) : ''], ['Note', r.notes]]
    : [['Tipologia', labelOf('contracts', 'kind', r.kind)], ['Controparte', r.counterparty], ['Immobile', prop], ['Inizio', r.startDate ? formatIT(r.startDate) : ''], ['Scadenza', r.endDate ? h('span', null, formatIT(r.endDate), ' · ', dueEl(r.endDate, today)) : ''], ['Rinnovo auto', r.autoRenew ? `Sì${r.noticeDays ? ` · disdetta ${r.noticeDays} gg prima` : ''}` : 'No'], ['Pagamento', labelOf('contracts', 'billingFrequency', r.billingFrequency)], ['Importo', r.amount != null ? money(r.amount) : ''], ['Note', r.notes]];
  info.splice(1, 0, ['Prossima scadenza pagamento', r.nextDue ? h('span', null, formatIT(r.nextDue), ' · ', dueEl(r.nextDue, today)) : '']);
  const payDlg = async () => {
    const v = await promptForm({ title: 'Registra pagamento', submitLabel: 'Registra', values: { paidAt: today, amount: r.amount ?? '' }, fields: [{ k: 'paidAt', type: 'date', label: 'Data pagamento', req: true }, { k: 'amount', type: 'num', label: 'Importo (€)' }, { k: 'notes', type: 'str', label: 'Note' }] });
    if (!v) return;
    try { const res = await repo.registerPayment(type, id, v); toast(res.parent.nextDue ? `Registrato. Prossima scadenza: ${formatIT(res.parent.nextDue)}` : 'Pagamento registrato', 'ok'); ctx.refresh(); } catch (e) { showError(e); }
  };
  const body = h('div', null, h('div', { class: 'card pad' }, kv(info)),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: payDlg }, icon('check', 18), 'Registra pagamento'),
      r.nextDue ? h('button', { class: 'btn', type: 'button', onclick: async () => { const x = await deliver(new Blob([buildICS([{ uid: `${r.id}-${r.nextDue}`, date: r.nextDue, title: `Pagamento: ${c.title(r)}`, description: r.amount != null ? money(r.amount) : '' }])], { type: 'text/calendar' }), `domus-${r.nextDue}.ics`); if (x !== 'cancelled') toast('File calendario pronto.'); } }, icon('today', 18), 'Aggiungi al Calendario') : null),
    h('h2', { class: 'sec' }, h('span', null, 'Pagamenti registrati')),
    pays.length ? card(pays.map((p) => row({ title: formatIT(p.paidAt), sub: [p.forDue ? `Scadenza ${formatIT(p.forDue)}` : '', p.notes].filter(Boolean).join(' · '), meta: p.amount != null ? money(p.amount) : '', chevron: false }))) : h('p', { class: 'muted small' }, 'Nessun pagamento registrato.'),
    await linksPanel(type, id, ctx, ['document']),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: async () => { if (await editEntity({ store: c.store, title: `Modifica ${c.one.toLowerCase()}`, record: r })) ctx.refresh(); } }, icon('edit', 18), 'Modifica'),
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Eliminare?', message: `Verranno eliminati anche i ${pays.length} pagamenti registrati. I documenti collegati restano in archivio.`, confirmLabel: 'Elimina', danger: true })) { await repo.remove(type, id); nav('/money'); } } }, icon('trash', 18), 'Elimina')));
  return { title: c.title(r), small: true, back: '#/money', body };
}
