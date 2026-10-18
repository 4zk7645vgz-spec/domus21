import { h, icon, money } from './h.js';
import { diffDays, formatIT, relative, todayStr } from '../lib/dates.js';
import { SCHEMA, TYPE_LABEL } from '../data/schema.js';

export const nav = (path) => { location.hash = path; };
export const ROUTE_OF = { task: 'tasks', practice: 'practices', document: 'archive', property: 'home/property', maintenance: 'home/maintenance', utility: 'money/utility', contract: 'money/contract', contact: 'contacts' };
export const hrefOf = (type, id) => `#/${ROUTE_OF[type]}/${id}`;
export const ICON_OF = { task: 'tasks', practice: 'practice', document: 'doc', property: 'house', maintenance: 'wrench', utility: 'money', contract: 'money', contact: 'contact' };
export const labelOf = (store, key, val) => SCHEMA[store].find((f) => f.k === key)?.values?.find(([v]) => v === val)?.[1] ?? val ?? '';

/** Riga di elenco. `href` → link; `onclick` → pulsante. */
export function row({ title, sub, meta, metaClass, href, onclick, lead, badge, cls = '', chevron = true }) {
  const inner = [lead, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), sub ? h('span', { class: 'row-sub' }, sub) : null),
    badge, meta ? h('span', { class: `row-meta ${metaClass || ''}` }, meta) : null, chevron && (href || onclick) ? h('span', { class: 'chev' }, icon('chevron', 18)) : null];
  const li = h('li', { class: cls });
  li.append(href ? h('a', { class: 'row', href }, inner) : onclick ? h('button', { class: 'row', type: 'button', onclick }, inner) : h('div', { class: 'row' }, inner));
  return li;
}
export const list = (rows) => h('ul', { class: 'list' }, rows);
export const card = (rows) => h('div', { class: 'card' }, list(rows));
export function empty(iconName, title, text, action) {
  return h('div', { class: 'empty' }, icon(iconName, 40), h('h3', null, title), h('p', null, text), action || null);
}
export function section(title, link, ...kids) { return [h('h2', { class: 'sec' }, h('span', null, title), link ? h('a', { href: link[1] }, link[0]) : null), ...kids]; }

/** Etichetta di scadenza con tono (senza allarmismo: solo colore e testo). */
export function dueEl(date, today = todayStr(), done = false) {
  if (!date) return null;
  const d = diffDays(date, today);
  const cls = done ? '' : d < 0 ? 'due-over' : d === 0 ? 'due-today' : '';
  return h('span', { class: cls }, d < 0 && !done ? `Scaduta · ${formatIT(date, false)}` : relative(date, today));
}
export const dueText = (date, today = todayStr()) => (date ? (diffDays(date, today) < 0 ? `Scaduta · ${formatIT(date, false)}` : relative(date, today)) : '');
export const kv = (pairs) => h('dl', { class: 'kv' }, pairs.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
export const segmented = (items, current, onPick) => h('div', { class: 'tabs-seg', role: 'group' }, items.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(k === current), onclick: () => onPick(k) }, l)));
export const chips = (items, current, onPick) => h('div', { class: 'chips', role: 'group' }, items.map(([k, l]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(k === current), onclick: () => onPick(k) }, l)));
export const typeLabel = (t) => TYPE_LABEL[t] || t;
export { money };
