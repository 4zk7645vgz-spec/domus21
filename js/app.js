import { h, icon, clear } from './ui/h.js';
import { showError, toast } from './ui/kit.js';
import * as today from './ui/today.js';
import * as tasks from './ui/tasks.js';
import * as practices from './ui/practices.js';
import * as house from './ui/house.js';
import * as money from './ui/money.js';
import * as archive from './ui/archive.js';
import * as contacts from './ui/contacts.js';
import * as search from './ui/search.js';
import * as settings from './ui/settings.js';
import * as more from './ui/more.js';
import * as expenses from './ui/expenses.js';
import { registerSW, setWaitingHandler, applyUpdate } from './app-sw.js';
import { open as openDB } from './data/db.js';

const ROUTES = {
  today: { tab: 'today', view: today.view },
  tasks: { tab: 'tasks', view: (p, c) => (p[0] ? tasks.detailView(p, c) : tasks.listView(p, c)) },
  practices: { tab: 'practices', view: (p, c) => (p[0] ? practices.detailView(p, c) : practices.listView(p, c)) },
  archive: { tab: 'archive', view: (p, c) => (p[0] ? archive.detailView(p, c) : archive.listView(p, c)) },
  more: { tab: 'more', view: more.view },
  home: { tab: 'more', view: (p, c) => (p[0] === 'property' ? house.propertyView(p.slice(1), c) : p[0] === 'maintenance' ? house.maintenanceView(p.slice(1), c) : house.listView(p, c)) },
  money: { tab: 'more', view: (p, c) => (p[0] ? money.detailView(p, c) : money.listView(p, c)) },
  contacts: { tab: 'more', view: (p, c) => (p[0] ? contacts.detailView(p, c) : contacts.listView(p, c)) },
  expenses: { tab: 'more', view: expenses.view },
  settings: { tab: 'more', view: settings.view },
  search: { tab: 'today', view: search.view },
};
const TABS = [['today', 'Oggi', 'today'], ['tasks', 'Attività', 'tasks'], ['practices', 'Pratiche', 'practice'], ['archive', 'Archivio', 'archive'], ['more', 'Altro', 'more']];

const root = document.getElementById('app');
const headerEl = h('header', { class: 'top' });
const main = h('main', { id: 'main', tabindex: '-1' });
const banner = h('div', { id: 'update-slot' });
const tabbar = h('nav', { class: 'tabs', 'aria-label': 'Navigazione principale' });
let fabEl = null, seq = 0;

function parse() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || 'today', params: parts.slice(1), q: Object.fromEntries(new URLSearchParams(qs || '')) };
}

const ctx = { refresh: () => render(true) };
async function render(keepScroll = false) {
  const my = ++seq; const { name, params, q } = parse();
  const route = ROUTES[name] || ROUTES.today;
  const scroll = keepScroll ? main.scrollTop : 0;
  let v;
  try { v = await route.view(name === 'search' ? q : params, ctx); }
  catch (e) { showError(e); v = { title: 'Errore', body: h('div', { class: 'banner danger' }, icon('alert', 20), h('div', null, h('b', null, 'Impossibile caricare la schermata'), h('p', null, e.message || String(e)))) }; }
  if (my !== seq) return; // navigazione più recente in corso
  clear(headerEl);
  if (v.back) headerEl.append(h('a', { class: 'icon-btn', href: v.back, 'aria-label': 'Indietro' }, icon('back')));
  headerEl.append(h('h1', { class: v.small ? 'small' : '' }, v.title), ...(v.actions || []));
  if (!v.back && name !== 'search') headerEl.append(h('a', { class: 'icon-btn', href: '#/search', 'aria-label': 'Cerca' }, icon('search')));
  clear(main); main.append(v.body); main.scrollTop = scroll;
  document.title = `${v.title} · Domus 21`;
  for (const a of tabbar.querySelectorAll('a')) a.toggleAttribute('aria-current', false), a.getAttribute('data-tab') === route.tab && a.setAttribute('aria-current', 'page');
  fabEl?.remove(); fabEl = null;
  if (v.fab) { fabEl = h('button', { class: 'fab', type: 'button', 'aria-label': v.fab.label, onclick: v.fab.onclick }, icon('plus', 26)); root.append(fabEl); }
  if (!keepScroll) { main.focus({ preventScroll: true }); }
}

function boot() {
  for (const [k, label, ic] of TABS) tabbar.append(h('a', { href: `#/${k}`, 'data-tab': k }, icon(ic, 24), label));
  root.append(headerEl, banner, main, tabbar);
  addEventListener('hashchange', () => render(false));
  addEventListener('unhandledrejection', (e) => { showError(e.reason); });
  addEventListener('error', (e) => { showError(e.error || e.message); });
  setWaitingHandler(() => {
    clear(banner);
    banner.append(h('div', { class: 'banner info', style: undefined, role: 'status' }, icon('info', 20), h('div', null, h('b', null, 'Aggiornamento disponibile'), h('p', null, 'I tuoi dati non verranno toccati. Applicalo quando non stai modificando nulla.'), h('button', { class: 'btn', type: 'button', onclick: applyUpdate }, 'Aggiorna ora'))));
  });
  openDB().then(() => render(false), (e) => {
    clear(main); main.append(h('div', { class: 'banner danger' }, icon('alert', 20), h('div', null, h('b', null, 'Archiviazione non disponibile'), h('p', null, e.message), h('p', null, 'In navigazione privata o con i dati del sito bloccati Domus non può salvare nulla.'))));
  });
  registerSW();
}
boot();
