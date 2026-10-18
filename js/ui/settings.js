import { h, icon, fmtBytes } from './h.js';
import * as repo from '../data/repo.js';
import * as bk from '../data/backup-io.js';
import * as dirs from '../data/dirs.js';
import { row, card, kv, nav } from './common.js';
import { confirmDialog, openSheet, toast, showError } from './kit.js';
import { promptForm } from './prompt.js';
import { checkIntegrity } from '../lib/integrity.js';
import { deliver } from '../lib/deliver.js';
import { buildICS } from '../lib/ics.js';
import { todayStr, formatIT, diffDays, addDays, cmp } from '../lib/dates.js';
import { APP_VERSION, SCHEMA_VERSION, BACKUP_FORMAT_VERSION } from '../version.js';
import { STORES } from '../data/schema.js';
import { checkForUpdate, swState } from '../app-sw.js';

export const daysSince = (iso, today = todayStr()) => diffDays(today, iso.slice(0, 10));
const btn = (label, fn, cls = '', ic) => h('button', { class: `btn ${cls}`, type: 'button', onclick: fn }, ic ? icon(ic, 18) : null, label);
const fileInput = (accept, onFile) => {
  const input = h('input', { type: 'file', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true', accept });
  document.body.append(input);
  input.addEventListener('change', () => { const f = input.files[0]; input.remove(); if (f) onFile(f); });
  input.addEventListener('cancel', () => input.remove()); input.click();
};

// ---------- backup ----------
async function backupFlow(includeDocs, ctx) {
  let made;
  try { toast('Preparazione del backup…'); made = await bk.createBackup(includeDocs); } catch (e) { return showError(e); }
  const { blob, manifest, missing } = made; const name = bk.backupFileName(includeDocs);
  const nd = manifest.counts.documents;
  const body = h('div', null, h('p', null, `Backup ${includeDocs ? 'con documenti' : 'solo dati'} · ${fmtBytes(blob.size)} · ${nd} documenti${includeDocs ? ` (${manifest.files.length} file inclusi)` : ' (solo metadati)'}.`),
    h('p', { class: 'small muted pre' }, 'Non incluso:\n' + manifest.excluded.map((x) => '• ' + x).join('\n')),
    missing.length ? h('div', { class: 'banner danger' }, icon('alert', 20), h('div', null, `${missing.length} documento/i senza file nella PWA non sono stati inclusi.`)) : null,
    h('p', null, 'Premi "Salva in File" e scegli la cartella Domus. Poi conferma, così Domus ricorda l\'esito.'));
  const go = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    const r = await deliver(blob, name); if (r === 'cancelled') return;
    const saved = await confirmDialog({ title: 'File salvato?', message: 'Hai salvato il backup in File (o altra destinazione sicura)? Domus non può verificarlo da sola: conferma solo se l\'hai fatto.', confirmLabel: 'Sì, salvato', cancelLabel: 'Non ancora' });
    if (saved) { await bk.recordBackup(manifest, name); toast('Backup registrato. Consiglio: usa "Verifica backup" scegliendo il file salvato.', 'ok', 6000); s.close(); ctx.refresh(); }
  } }, icon('share', 18), 'Salva in File');
  const s = openSheet({ title: 'Backup pronto', body, footer: [h('button', { class: 'btn', type: 'button', onclick: () => s.close() }, 'Chiudi'), go] });
}
function reportList(title, items, cls = '') { return items.length ? h('div', { class: `banner ${cls}` }, icon('alert', 20), h('div', null, h('b', null, title), h('ul', null, items.slice(0, 12).map((x) => h('li', null, x))))) : null; }

async function verifyFlow(ctx) {
  fileInput('.zip,application/zip', async (f) => {
    const r = await bk.inspect(f);
    const body = r.ok ? h('div', null, h('div', { class: 'banner info' }, icon('check', 20), h('div', null, h('b', null, 'Backup integro'), h('p', null, `Creato il ${formatIT(r.manifest.createdAt.slice(0, 10))} · app ${r.manifest.appVersion} · ${r.manifest.includesDocuments ? `${r.manifest.files.length} documenti inclusi` : 'solo dati'}. Tutte le somme di controllo coincidono.`))), reportList('Avvisi', r.warnings, ''))
      : reportList('Backup NON valido', r.errors, 'danger');
    if (r.ok) { const lb = await repo.getMeta('lastBackup'); if (lb) await repo.setMeta('lastBackup', { ...lb, verified: true, verifiedAt: new Date().toISOString() }); }
    const s = openSheet({ title: 'Verifica backup', body, footer: h('button', { class: 'btn primary', type: 'button', onclick: () => { s.close(); ctx.refresh(); } }, 'Chiudi') });
  });
}

async function restoreFlow(ctx) {
  fileInput('.zip,application/zip', async (f) => {
    let ins;
    try { ins = await bk.inspect(f); } catch (e) { return showError(e); }
    if (!ins.ok) { const s = openSheet({ title: 'Ripristino impossibile', body: reportList('Il file non è un backup valido. Nessun dato è stato modificato.', ins.errors, 'danger'), footer: h('button', { class: 'btn', type: 'button', onclick: () => s.close() }, 'Chiudi') }); return; }
    const { plan, have } = await bk.previewRestore(ins); const t = plan.totals;
    const body = h('div', null,
      h('p', null, `Backup del ${formatIT(ins.manifest.createdAt.slice(0, 10))} (${ins.manifest.includesDocuments ? 'con documenti' : 'solo dati'}).`),
      h('div', { class: 'card pad' }, kv([['Da aggiungere', t.add], ['Da aggiornare (più recenti nel backup)', t.update], ['Invariati', t.same], ['Locali più recenti (mantenuti)', t.keepLocal], ['File da ripristinare', [...Object.keys(plan.add)].includes('documents') || plan.fillBlobs.length ? 'sì' : 'no']])),
      h('p', { class: 'small muted' }, 'Il ripristino è un\'UNIONE: nessun dato esistente viene cancellato. Gli elementi aggiornati sostituiscono la versione locale più vecchia.'),
      t.update ? h('div', { class: 'banner' }, icon('alert', 20), h('div', null, h('b', null, `${t.update} elementi locali verranno sovrascritti`), h('p', null, 'Consigliato: crea prima un backup dei dati attuali.'))) : null,
      reportList('Conflitti / elementi ignorati', plan.skipped, ''), reportList('Avvisi del backup', ins.warnings, ''));
    const go = h('button', { class: `btn ${t.update ? 'danger' : 'primary'}`, type: 'button', onclick: async () => {
      go.disabled = true;
      try { const rep = await bk.applyRestore(ins, plan, have); s.close(); showReport(rep, ctx); } catch (e) { showError(e); go.disabled = false; }
    } }, t.update ? `Sovrascrivi ${t.update} e ripristina` : 'Ripristina');
    const s = openSheet({ title: 'Ripristino da backup', body, footer: [h('button', { class: 'btn', type: 'button', onclick: () => s.close() }, 'Annulla'), go], tall: true });
  });
}
function showReport(rep, ctx) {
  const s = openSheet({ title: rep.verified ? 'Ripristino verificato' : 'Ripristino con problemi', body: h('div', null,
    h('div', { class: `banner ${rep.verified ? 'info' : 'danger'}` }, icon(rep.verified ? 'check' : 'alert', 20), h('div', null, h('b', null, rep.verified ? 'Verifica post-ripristino superata' : 'Verifica non superata'), h('p', null, `Aggiunti ${rep.added}, aggiornati ${rep.updated}, mantenuti locali ${rep.keptLocal}, file ripristinati ${rep.blobsWritten}.`))),
    reportList('File non ripristinati', rep.blobsFailed, 'danger'), reportList('Problemi', rep.problems, 'danger'), reportList('Ignorati', rep.skipped, '')), footer: h('button', { class: 'btn primary', type: 'button', onclick: () => { s.close(); ctx.refresh(); } }, 'Chiudi') });
}

// ---------- categorie ----------
async function categoriesSheet(ctx) {
  const snap = await repo.snapshot();
  const ul = h('ul', { class: 'list' }, snap.categories.sort((a, b) => a.name.localeCompare(b.name, 'it')).map((c) => h('li', { class: 'with-act' },
    h('button', { class: 'row', type: 'button', onclick: async () => { const v = await promptForm({ title: 'Rinomina categoria', fields: [{ k: 'name', type: 'str', label: 'Nome', req: true }], values: { name: c.name } }); if (v) { await repo.update('categories', c.id, { name: v.name }); s.close(); categoriesSheet(ctx); } } }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, c.name))),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Elimina categoria ${c.name}`, onclick: async () => { if (await confirmDialog({ title: 'Eliminare la categoria?', message: `Gli elementi in "${c.name}" restano, senza categoria.`, confirmLabel: 'Elimina', danger: true })) { await repo.removeCategory(c.id); s.close(); categoriesSheet(ctx); } } }, icon('trash', 18)))));
  const s = openSheet({ title: 'Categorie', body: [h('div', { class: 'card' }, ul), h('div', { class: 'btn-row' }, btn('Nuova categoria', async () => { const v = await promptForm({ title: 'Nuova categoria', fields: [{ k: 'name', type: 'str', label: 'Nome', req: true }] }); if (v) { await repo.create('categories', { name: v.name }); s.close(); categoriesSheet(ctx); } }, '', 'plus'))], tall: true, onClose: () => ctx.refresh() });
}

// ---------- calendario ----------
async function exportCalendar() {
  const snap = await repo.snapshot(); const today = todayStr(), end = addDays(today, 365); const ev = [];
  for (const t of snap.tasks) if (t.status === 'open' && t.due && cmp(t.due, today) >= 0 && cmp(t.due, end) <= 0) ev.push({ uid: `${t.id}-${t.due}`, date: t.due, title: t.title, description: t.description });
  for (const m of snap.maintenance) if (m.nextDue && cmp(m.nextDue, today) >= 0 && cmp(m.nextDue, end) <= 0) ev.push({ uid: `${m.id}-${m.nextDue}`, date: m.nextDue, title: `Manutenzione: ${m.title}` });
  for (const u of [...snap.utilities, ...snap.contracts]) if (u.active !== false && u.nextDue && cmp(u.nextDue, today) >= 0 && cmp(u.nextDue, end) <= 0) ev.push({ uid: `${u.id}-${u.nextDue}`, date: u.nextDue, title: `Pagamento: ${u.name || u.title}` });
  for (const d of snap.documents) if (d.expires && cmp(d.expires, today) >= 0 && cmp(d.expires, end) <= 0) ev.push({ uid: `${d.id}-${d.expires}`, date: d.expires, title: `Scade documento: ${d.name}` });
  if (!ev.length) return toast('Nessuna scadenza nei prossimi 12 mesi.');
  const r = await deliver(new Blob([buildICS(ev)], { type: 'text/calendar' }), `domus-scadenze-${today}.ics`);
  if (r !== 'cancelled') toast(`${ev.length} promemoria esportati. Aprendo il file, Calendario li aggiunge: operazione manuale e una tantum.`, 'ok', 6000);
}

async function integrityFlow(ctx) {
  const issues = checkIntegrity(await repo.snapshot(), new Set(await repo.blobIds()));
  const fixable = issues.filter((i) => i.fix);
  const body = issues.length ? h('div', null, h('p', null, `${issues.length} problemi rilevati (${fixable.length} riparabili automaticamente e senza perdita di dati).`), h('ul', null, issues.slice(0, 40).map((i) => h('li', null, `${i.severity === 'error' ? '⚠ ' : ''}${i.msg}`))))
    : h('div', { class: 'banner info' }, icon('check', 20), h('div', null, h('b', null, 'Nessun problema'), h('p', null, 'Collegamenti, riferimenti, file e ricorrenze sono coerenti.')));
  const s = openSheet({ title: 'Verifica integrità', body, footer: [h('button', { class: 'btn', type: 'button', onclick: () => s.close() }, 'Chiudi'), fixable.length ? h('button', { class: 'btn primary', type: 'button', onclick: async () => { const n = await repo.applyFixes(fixable); toast(`${n} riparazioni applicate`, 'ok'); s.close(); ctx.refresh(); } }, `Ripara ${fixable.length}`) : null] });
}

export async function view(_p, ctx) {
  const [snap, last, est, persisted, dir, audit] = await Promise.all([repo.snapshot(), repo.getMeta('lastBackup'), navigator.storage?.estimate?.().catch(() => null), navigator.storage?.persisted?.().catch(() => null), dirs.supported() ? dirs.status() : null, Promise.resolve()]);
  const today = todayStr();
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const sw = await swState();
  const sec = (t) => h('h2', { class: 'sec' }, h('span', null, t));
  const body = h('div', null,
    sec('Backup e ripristino'),
    h('div', { class: 'card pad' }, kv([['Ultimo backup', last ? `${formatIT(last.at.slice(0, 10))} · ${last.includesDocuments ? 'con documenti' : 'solo dati'}${last.verified ? ' · verificato' : ' · non verificato'}` : 'Mai creato'], ['Giorni trascorsi', last ? daysSince(last.at, today) : '—']])),
    h('p', { class: 'small muted' }, 'Il backup è un file ZIP con somme di controllo, indipendente dalla memoria di Safari. Salvalo in File (iCloud Drive o "Sul mio iPhone").'),
    h('div', { class: 'btn-row' }, btn('Backup con documenti', () => backupFlow(true, ctx), 'primary', 'download'), btn('Solo dati', () => backupFlow(false, ctx), '', 'download')),
    h('div', { class: 'btn-row' }, btn('Verifica un backup', () => verifyFlow(ctx), '', 'check'), btn('Ripristina da file', () => restoreFlow(ctx), '', 'archive')),
    sec('Archivio documenti'),
    h('div', { class: 'card pad' }, dirs.supported()
      ? kv([['Cartella collegata', dir ? `${dir.name} (permesso: ${dir.permission})` : 'Nessuna'], ['Nota', 'Il permesso può scadere: viene richiesto di nuovo quando serve.']])
      : kv([['Accesso diretto a cartelle', 'Non disponibile in questo browser'], ['Come funziona', 'I file restano nella memoria interna di Domus. Per avere una copia in File usa "Salva in File" (singolo documento, ZIP dall\'Archivio o backup) e verificala con "Verifica copia in File".']])),
    dirs.supported() ? h('div', { class: 'btn-row' }, btn(dir ? 'Cambia cartella' : 'Collega cartella', async () => { try { await dirs.connect(); ctx.refresh(); } catch (e) { if (e.name !== 'AbortError') showError(e); } }, '', 'archive'), dir ? btn('Scollega', async () => { await dirs.disconnect(); ctx.refresh(); }, 'ghost') : null) : null,
    sec('Spazio e conservazione'),
    h('div', { class: 'card pad' }, kv([['Usato', est ? `${fmtBytes(est.usage)} di ${fmtBytes(est.quota)} (stima del browser)` : 'non disponibile'], ['Archiviazione persistente', persisted === null ? 'non supportata' : persisted ? 'Concessa' : 'Non concessa (iOS può eliminare i dati se manca spazio)'], ['Documenti nella PWA', `${snap.documents.filter((d) => d.hasBlob).length} (${fmtBytes(snap.documents.reduce((s, d) => s + (d.hasBlob ? d.size || 0 : 0), 0))})`]])),
    navigator.storage?.persist && !persisted ? h('div', { class: 'btn-row' }, btn('Richiedi archiviazione persistente', async () => { const ok = await navigator.storage.persist(); toast(ok ? 'Concessa' : 'Non concessa dal sistema: fai backup frequenti.', ok ? 'ok' : 'info'); ctx.refresh(); })) : null,
    sec('Organizzazione'),
    card([row({ title: 'Categorie', sub: `${snap.categories.length} categorie`, onclick: () => categoriesSheet(ctx) }), row({ title: 'Esporta scadenze in Calendario', sub: 'File .ics, azione manuale', onclick: exportCalendar }), row({ title: 'Verifica integrità dei dati', sub: 'Collegamenti, file, ricorrenze', onclick: () => integrityFlow(ctx) })]),
    sec('Promemoria'),
    h('p', { class: 'small muted' }, 'Domus non invia notifiche a app chiusa: iOS le consente solo tramite un server push, incompatibile con "nessun cloud". Le scadenze sono sempre visibili in "Oggi"; puoi esportarle nel Calendario di iOS, che ti avvisa.'),
    sec('Informazioni e diagnostica'),
    h('div', { class: 'card pad' }, kv([['Versione app', APP_VERSION], ['Schema dati', `${SCHEMA_VERSION} (formato backup ${BACKUP_FORMAT_VERSION})`], ['Modalità', standalone ? 'App sulla schermata Home' : 'Scheda del browser (installa Domus per un uso stabile)'], ['Contesto sicuro (HTTPS)', String(window.isSecureContext)], ['Service Worker', sw], ['Condivisione file', navigator.canShare ? 'disponibile' : 'non disponibile (uso il download)'], ['Selezione cartelle', dirs.supported() ? 'disponibile' : 'non disponibile'], ['Record', STORES.filter((s) => !['audit'].includes(s)).map((s) => `${s} ${snap[s].length}`).join(' · ')]])),
    h('div', { class: 'btn-row' }, btn('Controlla aggiornamenti', async () => { const r = await checkForUpdate(); toast(r, 'info', 5000); }, '', 'download')),
    (() => { let errs = []; try { errs = JSON.parse(sessionStorage.getItem('domus-errors') || '[]'); } catch { /* ignora */ } return errs.length ? h('div', { class: 'card pad small' }, h('b', null, 'Errori recenti (sessione)'), errs.map((e) => h('div', null, `${e.at.slice(11, 19)} ${e.msg}`))) : null; })(),
    snap.audit.length ? h('div', { class: 'card pad small' }, h('b', null, 'Registro attività locale'), [...snap.audit].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8).map((a) => h('div', null, `${a.at.slice(0, 16).replace('T', ' ')} · ${a.summary}`))) : null,
    h('div', { class: 'banner info' }, icon('shield', 20), h('div', null, h('b', null, 'Privacy e sicurezza'), h('p', null, 'I dati restano su questo dispositivo e non vengono mai inviati a un server. Domus non ha blocco con PIN: chiunque abbia accesso al telefono sbloccato può aprire l\'app. Usa il codice di blocco di iOS.'))));
  return { title: 'Impostazioni', body, back: '#/more' };
}
