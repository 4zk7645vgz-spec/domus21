// Scadenzario: calendario mensile con punti sui giorni, filtro per tipo e elenco del giorno/mese. Dati reali da collectDeadlines.
import { h, icon } from './h.js';
import * as repo from '../data/repo.js';
import { collectDeadlines, monthGrid, ymAdd } from '../lib/stats.js';
import { deadlineList } from './widgets.js';
import { chips, empty } from './common.js';
import { todayStr, formatIT } from '../lib/dates.js';

const MESI_LONG = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GROUPS = { all: null, pay: ['utility', 'contract', 'notice'], doc: ['document'], task: ['task', 'checklist'], house: ['maintenance', 'warranty'] };
let ym = null, kind = 'all', sel = null;

export async function view(_p, ctx) {
  const today = todayStr(); ym ||= today.slice(0, 7);
  const snap = await repo.snapshot();
  const every = collectDeadlines(snap, today);
  const all = every.filter((d) => !GROUPS[kind] || GROUPS[kind].includes(d.kind));
  const byDay = new Map(); for (const d of all) (byDay.get(d.date) || byDay.set(d.date, []).get(d.date)).push(d);
  const go = (n) => { ym = ymAdd(ym, n); sel = null; ctx.refresh(); };
  const [y, m] = ym.split('-').map(Number);
  const body = h('div');
  body.append(chips([['all', 'Tutte'], ['pay', 'Pagamenti'], ['doc', 'Documenti'], ['task', 'Attività'], ['house', 'Casa']], kind, (k) => { kind = k; sel = null; ctx.refresh(); }));
  body.append(h('div', { class: 'cal-head' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mese precedente', onclick: () => go(-1) }, icon('back')),
    h('h2', { 'aria-live': 'polite' }, `${MESI_LONG[m - 1]} ${y}`),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mese successivo', onclick: () => go(1) }, icon('chevron'))));
  const grid = h('div', { class: 'cal', role: 'group', 'aria-label': `Calendario di ${MESI_LONG[m - 1]} ${y}` }, ['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d) => h('div', { class: 'dow', 'aria-hidden': 'true' }, d)));
  for (const c of monthGrid(ym)) {
    const items = byDay.get(c.date) || []; const n = items.length;
    grid.append(h('button', { type: 'button', class: `${c.inMonth ? '' : 'out'} ${c.date === today ? 'today' : ''}`, 'aria-pressed': String(sel === c.date),
      'aria-label': `${formatIT(c.date)}${n ? `, ${n} scadenz${n === 1 ? 'a' : 'e'}` : ''}`, onclick: () => { sel = sel === c.date ? null : c.date; ctx.refresh(); } },
      +c.date.slice(8), h('span', { class: 'dots', 'aria-hidden': 'true' }, items.slice(0, 3).map((i) => h('i', { class: i.overdue ? 'late' : i.kind === 'utility' || i.kind === 'contract' || i.unpaid ? 'pay' : '' })))));
  }
  body.append(grid);
  const list = sel ? (byDay.get(sel) || []) : all.filter((d) => d.date.startsWith(ym));
  body.append(h('h2', { class: 'sec' }, h('span', null, sel ? formatIT(sel) : `Scadenze di ${MESI_LONG[m - 1]}`), sel ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { sel = null; ctx.refresh(); } }, 'Tutto il mese') : null));
  body.append(list.length ? deadlineList(list, today) : h('p', { class: 'muted' }, sel ? 'Nessuna scadenza in questo giorno.' : 'Nessuna scadenza in questo mese.'));
  const late = all.filter((d) => d.overdue && !d.date.startsWith(ym) || (d.overdue && d.date.startsWith(ym) && false));
  if (late.length && !sel) body.append(h('h2', { class: 'sec' }, h('span', null, `In ritardo (${late.length})`)), deadlineList(late.slice(0, 10), today));
  if (!every.length) return { title: 'Calendario', back: '#/more', body: empty('calendar', 'Nessuna scadenza', 'Le scadenze compaiono qui da sole: dai documenti confermati, dalle utenze, dai contratti, dalle manutenzioni e dalle attività.') };
  return { title: 'Calendario', back: '#/more', body, actions: [h('button', { class: 'btn', type: 'button', onclick: () => { ym = today.slice(0, 7); sel = today; ctx.refresh(); } }, 'Oggi')] };
}
