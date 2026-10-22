import { h, icon, money } from './h.js';
import * as repo from '../data/repo.js';
import { computeDashboard } from '../lib/dashboard.js';
import { todayStr, formatIT, diffDays } from '../lib/dates.js';
import { row, card, section, empty, dueText, hrefOf, nav } from './common.js';
import { taskRow, newTask } from './tasks.js';
import { editEntity, openSheet, toast } from './kit.js';
import { pickAndImport } from './links.js';
import { daysSince } from './settings.js';
import { kpi, deadlineList, inboxList } from './widgets.js';
import { buildInbox } from '../lib/inbox.js';
import { collectDeadlines, monthlySpend, spendByCategory, spendByState } from '../lib/stats.js';
import { stackedBars, hBars, donut } from './charts.js';
import { addDays } from '../lib/dates.js';

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
  const s = openSheet({ title: 'Benvenuto in Domus 21', body, footer: [ask, done], tall: true });
}

export async function view(_p, ctx) {
  await repo.ensureDefaults();
  const [snap, last, setup] = await Promise.all([repo.snapshot(), repo.getMeta('lastBackup'), repo.getMeta('setupDone')]);
  const today = todayStr(); const year = today.slice(0, 4);
  const d = computeDashboard(snap, today);
  if (!setup) queueMicrotask(() => onboarding(ctx));
  const body = h('div');
  const stale = last ? daysSince(last.at, today) : null;
  const inbox = buildInbox(snap, today);
  const dls = collectDeadlines(snap, today, { until: addDays(today, 30) });
  const taskIds = new Set([...d.overdue, ...d.today].map((t) => t.id));
  const upcoming = dls.filter((x) => !(x.kind === 'task' && taskIds.has(x.id)) && !(x.kind === 'task' && x.date === today));
  const overdueAll = dls.filter((x) => x.overdue).length;
  const next7 = dls.filter((x) => x.days >= 0 && x.days <= 7).length;
  const unpaid = snap.documents.filter((x) => x.payState === 'unpaid');
  const unpaidSum = unpaid.reduce((s, x) => s + (x.amount || 0), 0);
  const st = spendByState(snap, year); const spent = st.paid + st.due + st.unverified;

  // intestazione "viva"
  const hr = new Date().getHours(); const greet = hr < 13 ? 'Buongiorno' : hr < 19 ? 'Buon pomeriggio' : 'Buonasera';
  if (!d.isEmpty) body.append(h('div', { class: 'hero' }, h('h2', null, greet), h('p', null, inbox.length || overdueAll || next7 ? [inbox.length ? `${inbox.length} ${inbox.length === 1 ? 'cosa da sistemare' : 'cose da sistemare'}` : 'Nulla da sistemare', overdueAll ? `${overdueAll} in ritardo` : '', `${next7} scadenz${next7 === 1 ? 'a' : 'e'} entro 7 giorni`].filter(Boolean).join(' · ') : 'Tutto in ordine: nessuna scadenza vicina.')));
  if (!d.isEmpty && (!last || stale > 30)) body.append(h('div', { class: 'banner', role: 'note' }, icon('shield', 20), h('div', null, h('b', null, last ? `Ultimo backup ${stale} giorni fa` : 'Nessun backup ancora creato'), h('p', null, 'I dati sono solo su questo iPhone. Crea un backup e salvalo in File.'), h('a', { class: 'btn', href: '#/settings' }, 'Vai ai backup'))));
  if (!d.isEmpty) body.append(h('div', { class: 'kpis' },
    kpi({ ic: 'inbox', label: 'Da sistemare', value: String(inbox.length), sub: inbox.length ? 'richiedono te' : 'tutto a posto', href: '#/inbox', tone: inbox.length ? 'warn' : 'ok' }),
    kpi({ ic: 'calendar', label: 'Scadenze 30 gg', value: String(dls.length), sub: overdueAll ? `${overdueAll} in ritardo` : 'nessun ritardo', href: '#/calendar', tone: overdueAll ? 'danger' : '' }),
    kpi({ ic: 'money', label: 'Da pagare', value: money(unpaidSum), sub: unpaid.length ? `${unpaid.length} document${unpaid.length === 1 ? 'o' : 'i'}` : 'nessuno segnato', href: '#/expenses', tone: unpaid.length ? 'warn' : '' }),
    kpi({ ic: 'chart', label: `Spesa ${year}`, value: money(spent), sub: spent ? `pagato ${money(st.paid)}` : 'nessun importo confermato', href: '#/expenses' })));

  const taskList = (items) => card(items.map((t) => taskRow(t, ctx, today)));
  const parts = [];
  if (inbox.length) parts.push(section(`Da sistemare (${inbox.length})`, inbox.length > 4 ? ['Tutte', '#/inbox'] : null, inboxList(inbox.slice(0, 4), ctx)));
  if (d.overdue.length) parts.push(section(`Scadute (${d.overdue.length})`, null, taskList(d.overdue)));
  if (d.today.length || !upcoming.length) parts.push(section('Oggi', null, d.today.length ? taskList(d.today) : h('div', { class: 'card pad muted' }, 'Nessuna attività per oggi.')));
  if (upcoming.length) parts.push(section('Prossime scadenze', ['Calendario', '#/calendar'], deadlineList(upcoming.slice(0, 8), today)));

  // grafici: solo con dati reali
  const months = monthlySpend(snap, today, 12); const hasSpend = months.some((m) => m.total > 0);
  if (hasSpend) {
    parts.push(section('Spese', ['Dettaglio', '#/expenses'],
      stackedBars({ title: 'Spesa degli ultimi 12 mesi', rows: months.map((m) => ({ label: m.label, year: m.year, a: m.paid, b: m.other })), aLabel: 'Pagato', bLabel: 'Da pagare / non verificato' }),
      spendByCategory(snap, year).length ? hBars({ title: `Per categoria, ${year}`, items: spendByCategory(snap, year) }) : null,
      donut({ title: `Stato delle spese, ${year}`, items: [{ label: 'Pagato', value: st.paid }, { label: 'Da pagare', value: st.due }, { label: 'Non verificato', value: st.unverified }, { label: 'Preventivi', value: st.quote }].filter((x) => x.value > 0) })));
  }
  if (snap.properties.length) parts.push(section('Immobili', ['Tutti', '#/home'], card(snap.properties.map((p) => {
    const n = snap.documents.filter((x) => x.propertyId === p.id).length; const nd = collectDeadlines(snap, today, { propertyId: p.id, until: addDays(today, 60) }).length;
    return row({ title: p.name, sub: [p.address, `${n} documenti`, nd ? `${nd} scadenze` : ''].filter(Boolean).join(' · '), lead: h('span', { class: 'row-lead' }, icon('house', 22)), href: `#/home/property/${p.id}` });
  }))));
  if (d.practices.length) parts.push(section(`Pratiche aperte (${d.practices.length})`, ['Tutte', '#/practices'], card(d.practices.slice(0, 4).map((p) => row({ title: p.title, sub: p.entity, meta: p.status === 'waiting' ? 'In attesa' : '', href: hrefOf('practice', p.id) })))));
  if (d.recentDocs.length) parts.push(section('Documenti recenti', ['Archivio', '#/archive'], card(d.recentDocs.map((x) => row({ title: x.name, sub: [x.issuer, x.date ? formatIT(x.date) : ''].filter(Boolean).join(' · '), href: hrefOf('document', x.id) })))));
  if (d.undated) parts.push(h('p', { class: 'muted small' }, `${d.undated} attività aperte senza scadenza.`));
  if (d.isEmpty) body.append(empty('house', 'Domus 21 è pronta', 'Importa il primo documento: Domus lo legge, propone i dati e costruisce da sola scadenze, spese e collegamenti.', h('button', { class: 'btn primary', type: 'button', onclick: () => pickAndImport({ onDone: ctx.refresh }) }, 'Importa un documento')));
  body.append(...parts.flat(), ...section('Azioni rapide', null, quickActions(ctx)));
  return { title: 'Oggi', sub: formatIT(today), body, tabHome: true };
}
