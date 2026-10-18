import { h, icon, money } from './h.js';
import * as repo from '../data/repo.js';
import { computeDashboard } from '../lib/dashboard.js';
import { todayStr, formatIT, diffDays } from '../lib/dates.js';
import { row, card, section, empty, dueText, hrefOf, nav } from './common.js';
import { taskRow, newTask } from './tasks.js';
import { editEntity, openSheet, toast } from './kit.js';
import { pickAndImport } from './links.js';
import { daysSince } from './settings.js';

function quickActions(ctx) {
  const A = (ic, label, fn) => h('button', { type: 'button', onclick: fn }, icon(ic, 24), label);
  return h('div', { class: 'quick' },
    A('tasks', 'Attività', () => newTask(ctx)),
    A('practice', 'Pratica', async () => { const p = await editEntity({ store: 'practices', title: 'Nuova pratica', defaults: { openedAt: todayStr() } }); if (p) nav(`/practices/${p.id}`); }),
    A('doc', 'Documento', () => pickAndImport({ onDone: ctx.refresh })),
    A('wrench', 'Manutenzione', async () => { if (await editEntity({ store: 'maintenance', title: 'Nuova manutenzione' })) ctx.refresh(); }),
    A('money', 'Utenza', async () => { if (await editEntity({ store: 'utilities', title: 'Nuova utenza' })) ctx.refresh(); }),
    A('contact', 'Contatto', async () => { if (await editEntity({ store: 'contacts', title: 'Nuovo contatto' })) ctx.refresh(); }));
}

export async function onboarding(ctx) {
  const supportsDir = typeof window.showDirectoryPicker === 'function';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const persistState = h('p', { class: 'small muted' });
  const body = h('div', null,
    h('p', null, 'Domus conserva tutto SOLO su questo dispositivo: nessun account, nessun cloud, nessuna telemetria.'),
    !standalone ? h('div', { class: 'banner' }, icon('alert', 20), h('div', null, h('b', null, 'Installa prima l\'app'), h('p', null, 'Su iPhone i dati inseriti in Safari e quelli della app sulla schermata Home sono separati. Condividi → "Aggiungi alla schermata Home", poi apri Domus da lì prima di inserire dati.'))) : null,
    h('h3', null, 'Archivio documenti'),
    h('p', null, supportsDir ? 'Questo browser espone la selezione di cartelle: puoi collegare una cartella (verrà richiesto il permesso a ogni sessione).' : 'Safari su iPhone non permette alle app web di scrivere in una cartella scelta di File. I documenti restano nella memoria interna di Domus; per tenerne una copia in File (cartella "Domus") usa "Salva in File" dal singolo documento o dal backup. Domus indica sempre dove si trova ogni file.'),
    h('h3', null, 'Protezione dallo svuotamento'),
    h('p', null, 'iOS può eliminare i dati di un sito se manca spazio. Chiedi la conservazione persistente e fai backup regolari.'),
    persistState);
  const ask = h('button', { class: 'btn', type: 'button', onclick: async () => {
    const ok = navigator.storage?.persist ? await navigator.storage.persist() : false;
    persistState.textContent = ok ? 'Archiviazione persistente concessa dal sistema.' : 'Il sistema non ha concesso l\'archiviazione persistente (non garantita): fai backup frequenti.';
  } }, 'Richiedi archiviazione persistente');
  const done = h('button', { class: 'btn primary', type: 'button', onclick: async () => { await repo.setMeta('setupDone', true); s.close(); ctx.refresh(); } }, 'Ho capito, inizia');
  const s = openSheet({ title: 'Benvenuto in Domus', body, footer: [ask, done], tall: true });
}

export async function view(_p, ctx) {
  await repo.ensureDefaults();
  const [snap, last, setup] = await Promise.all([repo.snapshot(), repo.getMeta('lastBackup'), repo.getMeta('setupDone')]);
  const today = todayStr();
  const d = computeDashboard(snap, today);
  if (!setup) queueMicrotask(() => onboarding(ctx));
  const body = h('div');
  const stale = last ? daysSince(last.at, today) : null;
  if (!d.isEmpty && (!last || stale > 30)) body.append(h('div', { class: 'banner', role: 'note' }, icon('shield', 20), h('div', null, h('b', null, last ? `Ultimo backup ${stale} giorni fa` : 'Nessun backup ancora creato'), h('p', null, 'I dati sono solo su questo iPhone. Crea un backup e salvalo in File.'), h('a', { class: 'btn', href: '#/settings' }, 'Vai ai backup'))));
  const taskList = (items) => card(items.map((t) => taskRow(t, ctx, today)));
  const parts = [];
  if (d.overdue.length) parts.push(section(`Scadute (${d.overdue.length})`, null, taskList(d.overdue)));
  parts.push(section('Oggi', null, d.today.length ? taskList(d.today) : h('div', { class: 'card pad muted' }, d.overdue.length || d.upcoming.length ? 'Nessuna attività in scadenza oggi.' : 'Nessuna attività per oggi.')));
  if (d.upcoming.length) parts.push(section('Prossimi 14 giorni', ['Tutte', '#/tasks'], taskList(d.upcoming)));
  if (d.payments.length) parts.push(section('Pagamenti e rinnovi', ['Vedi', '#/money'], card(d.payments.map((p) => row({ title: p.title, sub: [p.sub, p.amount != null && !p.renewal ? money(p.amount) : ''].filter(Boolean).join(' · '), meta: dueText(p.due, today), metaClass: p.days < 0 ? 'due-over' : '', href: hrefOf(p.type, p.id) })))));
  if (d.maintenance.length) parts.push(section('Manutenzioni programmate', ['Vedi', '#/home'], card(d.maintenance.map((m) => row({ title: m.title, meta: dueText(m.due, today), metaClass: m.days < 0 ? 'due-over' : '', href: hrefOf('maintenance', m.id) })))));
  if (d.practices.length) parts.push(section(`Pratiche aperte (${d.practices.length})`, ['Tutte', '#/practices'], card(d.practices.slice(0, 4).map((p) => row({ title: p.title, sub: p.entity, meta: p.status === 'waiting' ? 'In attesa' : '', href: hrefOf('practice', p.id) })))));
  if (d.docsExpiring.length) parts.push(section('Documenti in scadenza', ['Archivio', '#/archive'], card(d.docsExpiring.map((x) => row({ title: x.title, meta: dueText(x.due, today), metaClass: x.days < 0 ? 'due-over' : '', href: hrefOf('document', x.id) })))));
  if (d.recentDocs.length) parts.push(section('Documenti recenti', ['Archivio', '#/archive'], card(d.recentDocs.map((x) => row({ title: x.name, sub: x.date ? formatIT(x.date) : '', href: hrefOf('document', x.id) })))));
  if (d.undated) parts.push(h('p', { class: 'muted small' }, `${d.undated} attività aperte senza scadenza.`));
  if (d.isEmpty) body.append(empty('house', 'Domus è pronta', 'Nessun dato inserito. Inizia aggiungendo la prima attività, pratica o documento.'));
  body.append(...parts.flat(), ...section('Azioni rapide', null, quickActions(ctx)));
  return { title: 'Oggi', sub: formatIT(today), body, tabHome: true };
}
