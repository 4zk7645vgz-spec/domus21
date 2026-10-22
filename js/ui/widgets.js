// Componenti riusabili della panoramica: KPI, righe di scadenza, coda "Da sistemare".
import { h, icon, money } from './h.js';
import { hrefOf, dueText } from './common.js';
import { toast, showError } from './kit.js';
import { applyProposal } from '../data/intel.js';
import { MESI } from '../lib/stats.js';
import { DEADLINE_LABEL } from '../lib/stats.js';

export const DL_ICON = { task: 'tasks', document: 'doc', utility: 'bolt', contract: 'money', maintenance: 'wrench', warranty: 'shield', notice: 'alert', checklist: 'practice' };

export function kpi({ ic, label, value, sub, href, tone }) {
  return h('a', { class: `kpi${tone ? ` tone-${tone}` : ''}`, href }, h('div', { class: 'k-top' }, icon(ic, 18), label), h('div', { class: 'k-val' }, value), sub ? h('div', { class: 'k-sub' }, sub) : null);
}

/** Righe di scadenza con blocco data. */
export function deadlineList(items, today) {
  return h('div', { class: 'card' }, h('ul', { class: 'list' }, items.map((d) => {
    const day = d.date.slice(8), mon = MESI[+d.date.slice(5, 7) - 1];
    return h('li', null, h('a', { class: 'row', href: hrefOf(d.type, d.id) },
      h('span', { class: `dl-date${d.overdue ? ' due-over' : ''}` }, h('b', null, +day), h('span', null, mon)),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, d.title), h('span', { class: 'row-sub' }, [DEADLINE_LABEL[d.kind], d.sub, d.amount != null ? money(d.amount) : ''].filter(Boolean).join(' · '))),
      h('span', { class: `row-meta ${d.overdue ? 'due-over' : ''}` }, dueText(d.date, today)), h('span', { class: 'chev' }, icon('chevron', 18))));
  })));
}

/** Coda "Da sistemare": ogni voce apre il documento; le proposte hanno un pulsante a un tocco. */
export function inboxList(items, ctx) {
  return h('div', { class: 'card' }, h('ul', { class: 'list' }, items.map((it) => {
    const link = h('a', { class: 'row', href: it.href }, h('span', { class: 'row-lead' }, icon(it.icon, 22)), h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, it.title), it.sub ? h('span', { class: 'row-sub' }, it.sub) : null), it.action ? null : h('span', { class: 'chev' }, icon('chevron', 18)));
    if (!it.action) return h('li', { class: `tone-${it.tone}` }, link);
    const btn = h('button', { class: 'btn', type: 'button', onclick: async () => {
      btn.disabled = true;
      try { const r = await applyProposal(it.action.docId, it.action.proposalId); toast(r.created ? 'Creato e collegato al documento.' : 'Collegato.', 'ok'); } catch (e) { showError(e); }
      ctx.refresh();
    } }, it.action.label);
    return h('li', { class: `with-btn tone-${it.tone}` }, link, btn);
  })));
}
