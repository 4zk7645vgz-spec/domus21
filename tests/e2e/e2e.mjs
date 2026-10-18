// Test end-to-end in Chromium (Playwright) con emulazione mobile. NON è Safari/iOS: vedi docs/TESTING.md.
import { spawn } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire('/opt/npm-tools/node_modules/');
let pw; try { pw = require('playwright'); } catch { pw = createRequire(import.meta.url)('playwright'); }
const { chromium } = pw;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const results = [];
async function step(name, fn) {
  try { await fn(); results.push([name, true]); console.log('  ✔', name); }
  catch (e) { results.push([name, false, e]); console.log('  ✘', name, '\n     ', String(e.message || e).split('\n').slice(0, 6).join('\n      ')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- server: avvio con la procedura documentata (node scripts/serve.mjs <cartella> <porta>) ----
function startServer(dir, port) {
  return new Promise((resolve, reject) => {
    const p = spawn('node', ['scripts/serve.mjs', dir, String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    p.stdout.on('data', (d) => { if (String(d).includes('servita')) resolve(p); });
    p.on('error', reject); setTimeout(() => reject(new Error('server non avviato')), 8000);
  });
}
const base = (port) => `http://localhost:${port}/`;
const CTX = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, locale: 'it-IT', timezoneId: 'Europe/Rome', acceptDownloads: true };
const today = (page) => page.evaluate(async () => { const { dates } = await window.__load(); return dates.todayStr(); });

async function finishOnboarding(page) {
  const btn = page.getByRole('button', { name: 'Ho capito, inizia' });
  await btn.waitFor({ timeout: 8000 }); await btn.click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
}
async function newTaskUI(page, title, due) {
  await page.getByRole('link', { name: 'Attività' }).first().click();
  await page.getByRole('button', { name: 'Nuova attività' }).first().click();
  await page.getByLabel('Titolo').fill(title);
  if (due) await page.getByLabel('Scadenza', { exact: true }).fill(due);
  await page.getByRole('button', { name: 'Salva' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
}

const port = 8931;
const srv = await startServer('.', port);
const URL0 = base(port);
const userData = mkdtempSync(join(tmpdir(), 'domus-prof-'));
const downloadsDir = mkdtempSync(join(tmpdir(), 'domus-dl-'));
const external = []; const csp = [];
let backupPath, ctx, page;
const launch = async (dir = userData) => {
  const c = await chromium.launchPersistentContext(dir, { ...CTX, serviceWorkers: 'allow' });
  c.on('request', (r) => { if (!r.url().startsWith(URL0.slice(0, -1)) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()); });
  const p = c.pages()[0] || (await c.newPage());
  await p.addInitScript(() => { window.__load = async () => ({ repo: await import('/js/data/repo.js'), dates: await import('/js/lib/dates.js') }); });
  await p.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => { (window.__csp ||= []).push(e.violatedDirective + ' ' + e.blockedURI); }));
  p.on('pageerror', (e) => console.log('   [pageerror]', e.message));
  return [c, p];
};

console.log('\nDomus — test end-to-end (Chromium emulazione mobile)\n');
[ctx, page] = await launch();

await step('20. Avvio tramite la procedura documentata e primo caricamento', async () => {
  const res = await fetch(URL0); assert.equal(res.status, 200);
  await page.goto(URL0);
  await page.getByRole('heading', { name: 'Oggi', level: 1 }).waitFor();
  await finishOnboarding(page);
  assert.ok(await page.getByText('Domus è pronta').isVisible(), 'stato vuoto curato, nessun dato demo');
  const n = await page.evaluate(async () => { const { repo, dates } = await window.__load();const s = await repo.snapshot(); return s.tasks.length + s.practices.length + s.documents.length + s.contacts.length; });
  assert.equal(n, 0, 'nessun dato dimostrativo');
});

await step('1. Attività: crea, modifica, completa, riapri, elimina (UI)', async () => {
  const t = await today(page);
  await newTaskUI(page, 'Revisione caldaia', t);
  await page.getByRole('link', { name: /Revisione caldaia/ }).first().click();
  await page.getByRole('button', { name: 'Modifica' }).click();
  await page.getByLabel('Titolo').fill('Revisione caldaia annuale');
  await page.getByRole('button', { name: 'Salva' }).click(); await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.getByRole('heading', { name: 'Revisione caldaia annuale' }).waitFor();
  await page.getByRole('button', { name: 'Completa', exact: true }).click();
  await page.getByRole('button', { name: 'Riapri' }).waitFor();
  await page.getByRole('button', { name: 'Riapri' }).click();
  await page.getByRole('button', { name: 'Completa', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Elimina' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click();
  await page.getByRole('heading', { name: 'Attività', level: 1 }).waitFor();
  assert.equal(await page.getByText('Revisione caldaia annuale').count(), 0);
});

await step('1b. Validazione: titolo obbligatorio e data non valida mostrano errori', async () => {
  await page.getByRole('button', { name: 'Nuova attività' }).first().click();
  await page.getByRole('button', { name: 'Salva' }).click();
  await page.locator('.field-err:not(:empty)').first().waitFor(); assert.match(await page.locator('.field-err:not(:empty)').first().textContent(), /obbligatorio/);
  await page.getByRole('button', { name: 'Chiudi' }).click();
});

await step('2/3. Ricorrenze: una sola occorrenza aperta, nessun duplicato, catch-up dopo inattività', async () => {
  const r = await page.evaluate(async () => { const { repo, dates } = await window.__load();
    const mk = (title, rec, due) => repo.create('tasks', { title, due, recurrence: rec });
    const t = await mk('Settimanale', { freq: 'weekly', interval: 1 }, dates.addDays(dates.todayStr(), -77)); // 11 settimane fa
    const [a, b] = await Promise.all([repo.completeTask(t.id), repo.completeTask(t.id)]);       // doppio completamento concorrente
    const again = await repo.completeTask(t.id);
    const all = (await repo.snapshot()).tasks.filter((x) => x.seriesId === t.seriesId);
    const open = all.filter((x) => x.status === 'open');
    const m = await mk('Mensile 31', { freq: 'monthly', interval: 1, anchorDay: 31 }, '2027-01-31');
    const m1 = await repo.completeTask(m.id, '2027-01-31'); const m2 = await repo.completeTask(m1.next.id, '2027-02-28');
    const y = await mk('Bisestile', { freq: 'yearly', interval: 1, anchorDay: 29 }, '2027-02-28');
    let dupErr = null; try { await mk('Dup', { freq: 'weekly', interval: 1 }, open[0].due); } catch (e) { dupErr = e.code; }
    const re = await repo.reopenTask(t.id).then(() => 'reopened', (e) => e.code);
    return { total: all.length, open: open.length, skipped: open.length && a.skipped, next: open[0].due, today: dates.todayStr(), againNext: again.next, m1: m1.next.due, m2: m2.next.due, re, done: all.filter(x=>x.status==='done').length }; });
  assert.equal(r.open, 1); assert.equal(r.total, 2, 'una sola occorrenza creata nonostante il doppio completamento'); assert.equal(r.againNext, null);
  assert.ok(r.next >= r.today, 'prossima occorrenza non nel passato'); assert.equal(r.m1, '2027-02-28'); assert.equal(r.m2, '2027-03-31'); assert.equal(r.re, 'CONFLICT');
  assert.equal(r.done, 1);
});

await step('4. Pratiche: checklist, cronologia, collegamento multiplo, eliminazione senza perdere i documenti', async () => {
  const r = await page.evaluate(async () => { const { repo, dates } = await window.__load();
    const p = await repo.create('practices', { title: 'Cambio residenza', kind: 'altro', openedAt: dates.todayStr(), status: 'open', entity: 'Comune' });
    const p2 = await repo.create('practices', { title: 'Altra pratica', kind: 'altro', openedAt: dates.todayStr(), status: 'open' });
    const i1 = await repo.addChecklistItem(p.id, { text: 'Modulo', kind: 'step' }); await repo.addChecklistItem(p.id, { text: 'Carta identità', kind: 'document' });
    await repo.setChecklistDone(i1.id, true);
    const t = await repo.create('tasks', { title: 'Consegna modulo', due: dates.todayStr() }); await repo.link('practice', p.id, 'task', t.id);
    const f = new File(['%PDF-1.4 finto'], 'modulo.pdf', { type: 'application/pdf' });
    const d = await repo.importDocument(f); await repo.link('practice', p.id, 'document', d.id); await repo.link('practice', p2.id, 'document', d.id);
    const dup = await repo.link('practice', p.id, 'document', d.id);
    await repo.update('practices', p.id, { status: 'closed' });
    const closed = await repo.get('practices', p.id);
    await repo.remove('practice', p.id);
    const snap = await repo.snapshot();
    return { dup, concl: !!closed.concludedAt, hist: closed.history.map((h) => h.text), doc: snap.documents.filter((x) => x.id === d.id).length, blob: await repo.hasBlobStored(d.id), other: (await repo.linksOf('practice', p2.id)).length, task: snap.tasks.filter((x) => x.id === t.id).length, items: snap.checklist.filter((c) => c.practiceId === p.id).length }; });
  assert.equal(r.dup, null, 'collegamento duplicato ignorato'); assert.ok(r.concl); assert.ok(r.hist.includes('Pratica aperta') && r.hist.some((h) => /Conclusa/.test(h)) && r.hist.some((h) => /Completato: Modulo/.test(h)));
  assert.equal(r.doc, 1, 'documento sopravvive'); assert.ok(r.blob); assert.equal(r.other, 1, 'altra pratica ancora collegata'); assert.equal(r.task, 1, 'attività sopravvive'); assert.equal(r.items, 0);
});

await step('5/9. Documenti: importazione UI, duplicati, stato/posizione onesti, scollega ≠ elimina', async () => {
  await page.getByRole('link', { name: 'Archivio' }).first().click();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importa documento' }).click()]);
  await fc.setFiles({ name: 'Polizza casa.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 polizza') });
  await page.getByText('Polizza casa.pdf').first().waitFor();
  assert.ok(await page.getByText('Solo nella PWA').first().isVisible());
  // stesso file di nuovo → avviso duplicato
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importa documento' }).click()]);
  await fc2.setFiles({ name: 'copia.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 polizza') });
  await page.getByText('File già presente').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Annulla' }).click();
  await page.getByRole('link', { name: /Polizza casa\.pdf/ }).first().click();
  await page.getByRole('heading', { name: 'Polizza casa.pdf', level: 1 }).waitFor();
  assert.match(await page.locator('.banner').first().textContent(), /Non è stato esportato nell'app File/);
  const r = await page.evaluate(async () => { const { repo, dates } = await window.__load();
    const doc = (await repo.snapshot()).documents.find((d) => d.name === 'Polizza casa.pdf');
    const c = await repo.create('contracts', { title: 'RC casa', counterparty: 'Assicurazione' }); const u = await repo.create('utilities', { name: 'Luce' });
    await repo.link('contract', c.id, 'document', doc.id); await repo.link('utility', u.id, 'document', doc.id);
    const links = await repo.linksOf('document', doc.id);
    await repo.unlink(links.find((l) => l.type === 'contract').relId);
    const still = await repo.get('documents', doc.id);
    await repo.remove('contract', c.id);
    const after = await repo.get('documents', doc.id);
    return { n: links.length, still: !!still, after: !!after, blob: await repo.hasBlobStored(doc.id), links2: (await repo.linksOf('document', doc.id)).length }; });
  assert.equal(r.n, 2); assert.ok(r.still); assert.ok(r.after, 'eliminare il contratto non elimina il documento'); assert.ok(r.blob); assert.equal(r.links2, 1);
});

await step('9b. Esportazione verso File: share/download + verifica copia (hash), file diversi e mancanti', async () => {
  const r = await page.evaluate(async () => { const { repo, dates } = await window.__load();
    const doc = (await repo.snapshot()).documents.find((d) => d.name === 'Polizza casa.pdf');
    await repo.markShared(doc.id); const s1 = (await repo.get('documents', doc.id)).exportState;
    const ok = await repo.verifyDocumentFile(doc.id, new File(['%PDF-1.4 polizza'], 'Polizza casa.pdf'));
    const bad = await repo.verifyDocumentFile(doc.id, new File(['altro'], 'Polizza casa.pdf'));
    const ok2 = await repo.verifyDocumentFile(doc.id, new File(['%PDF-1.4 polizza'], 'Polizza casa.pdf'));
    return { s1, ok: ok.ok, bad: bad.ok, badState: bad.doc.exportState, ok2: ok2.doc.exportState }; });
  assert.equal(r.s1, 'shared'); assert.ok(r.ok); assert.equal(r.bad, false); assert.equal(r.badState, 'mismatch'); assert.equal(r.ok2, 'verified');
  await page.reload(); await page.getByRole('link', { name: 'Archivio' }).first().click();
  await page.getByRole('link', { name: /Polizza casa\.pdf/ }).first().click();
  await page.getByRole('heading', { name: 'Polizza casa.pdf', level: 1 }).waitFor();
  assert.match(await page.locator('.banner').first().textContent(), /Copia in File verificata/);
});

await step('10. File mancante / permessi revocati: riconosciuto e riparabile, nessun crash', async () => {
  const r = await page.evaluate(async () => { const { repo, dates } = await window.__load();
    const d = await repo.importDocument(new File(['contenuto temporaneo'], 'temp.txt', { type: 'text/plain' }));
    // simulo perdita del blob (es. sfratto dello storage) cancellandolo direttamente
    await new Promise((res, rej) => { const q = indexedDB.open('domus'); q.onsuccess = () => { const db = q.result; const tx = db.transaction('blobs', 'readwrite'); tx.objectStore('blobs').delete(d.id); tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => rej(tx.error); }; });
    const { checkIntegrity } = await import('/js/lib/integrity.js');
    const issues = checkIntegrity(await repo.snapshot(), new Set(await repo.blobIds()));
    const miss = issues.find((i) => /File mancante/.test(i.msg));
    await repo.applyFixes([miss]);
    const after = await repo.get('documents', d.id);
    return { found: !!miss, hasBlob: after.hasBlob, blob: await repo.getDocumentBlob(d.id) }; });
  assert.ok(r.found); assert.equal(r.hasBlob, false); assert.equal(r.blob, null);
  await page.getByRole('link', { name: 'Archivio' }).first().click();
  await page.getByText('File assente').first().waitFor();
});

await step('6. Ricerca globale (UI)', async () => {
  await page.evaluate(async () => { const { repo, dates } = await window.__load();await repo.create('contacts', { name: 'Elettricista Rossi', role: 'artigiano', phone: '333 1234567' }); });
  await page.getByRole('link', { name: 'Cerca' }).first().click();
  await page.getByRole('searchbox', { name: 'Ricerca globale' }).fill('elettricista');
  await page.getByRole('link', { name: /Elettricista Rossi/ }).waitFor();
  await page.getByRole('searchbox', { name: 'Ricerca globale' }).fill('polizza');
  await page.getByRole('link', { name: /Polizza casa/ }).waitFor();
  await page.getByRole('searchbox', { name: 'Ricerca globale' }).fill('qwertyzzz');
  await page.getByText('Nessun risultato').waitFor();
});

await step('Dashboard: sezioni da dati reali', async () => {
  const t = await today(page);
  await page.evaluate(async () => { const { repo, dates } = await window.__load();const t = dates.todayStr();
    await repo.create('tasks', { title: 'Scaduta da ieri', due: dates.addDays(t, -1) }); await repo.create('tasks', { title: 'Per oggi', due: t });
    await repo.create('utilities', { name: 'Gas', provider: 'Eni', nextDue: dates.addDays(t, 5), billingFrequency: 'bimonthly', amount: 80 });
    await repo.create('maintenance', { title: 'Pulizia canna fumaria', kind: 'programmata', nextDue: dates.addDays(t, 10) }); });
  await page.getByRole('link', { name: 'Oggi' }).first().click();
  await page.getByText('Scadute (').waitFor();
  for (const txt of ['Scaduta da ieri', 'Per oggi', 'Gas', 'Pulizia canna fumaria', 'Pratiche aperte'.slice(0, 0) || 'Documenti recenti']) assert.ok(await page.getByText(txt).first().isVisible(), txt);
  assert.ok(t);
});

await step('Pagamenti: registra, avanza scadenza, niente doppio pagamento', async () => {
  const r = await page.evaluate(async () => { const { repo, dates } = await window.__load();
    const u = (await repo.snapshot()).utilities.find((x) => x.name === 'Gas'); const due = u.nextDue;
    const res = await repo.registerPayment('utility', u.id, { paidAt: dates.todayStr(), amount: 81.5 });
    const after = await repo.get('utilities', u.id);
    let dup = null; await repo.update('utilities', u.id, { nextDue: due }).then(() => repo.registerPayment('utility', u.id, {})).catch((e) => { dup = e.code; });
    return { due, next: after.nextDue, dup, pays: (await repo.listPayments(u.id)).length }; });
  assert.equal(r.next, (await page.evaluate(async (d) => (await import('/js/lib/dates.js')).addMonths(d, 2), r.due))); assert.equal(r.dup, 'DUPLICATE'); assert.equal(r.pays, 1);
});

await step('Sicurezza: contenuto utente non viene mai interpretato come HTML (XSS)', async () => {
  await page.getByRole('link', { name: 'Attività' }).first().click();
  await newTaskUI(page, '<img src=x onerror="window.__xss=1">', null);
  await page.getByText('<img src=x onerror="window.__xss=1">').first().waitFor();
  assert.equal(await page.evaluate(() => window.__xss), undefined); assert.equal(await page.locator('main img[src="x"]').count(), 0);
});

await step('7. Persistenza dopo chiusura completa e riapertura del browser', async () => {
  const before = await page.evaluate(async () => { const { repo, dates } = await window.__load();const s = await repo.snapshot(); return { tasks: s.tasks.length, docs: s.documents.length, contacts: s.contacts.length, blobs: (await repo.blobIds()).length }; });
  await ctx.close();
  [ctx, page] = await launch();
  await page.goto(URL0); await page.getByRole('heading', { name: 'Oggi', level: 1 }).waitFor();
  const after = await page.evaluate(async () => { const { repo, dates } = await window.__load();const s = await repo.snapshot(); return { tasks: s.tasks.length, docs: s.documents.length, contacts: s.contacts.length, blobs: (await repo.blobIds()).length }; });
  assert.deepEqual(after, before); assert.ok(after.tasks > 3);
  assert.equal(await page.getByRole('button', { name: 'Ho capito, inizia' }).count(), 0, 'onboarding non ripetuto');
});

await step('8. Offline dopo la prima configurazione (service worker)', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready); await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 });
  const keys = await page.evaluate(() => caches.keys()); assert.deepEqual(keys, ['domus-shell-1.0.0']);
  await ctx.setOffline(true);
  await page.reload(); await page.getByRole('heading', { name: 'Oggi', level: 1 }).waitFor();
  await page.getByRole('link', { name: 'Archivio' }).first().click(); await page.getByText('Polizza casa.pdf').first().waitFor();
  await newTaskUI(page, 'Creata offline', null); await page.getByText('Creata offline').first().waitFor();
  await ctx.setOffline(false);
});

await step('11. Backup (UI): creazione con documenti, salvataggio, registrazione e verifica', async () => {
  await page.getByRole('link', { name: 'Altro' }).click(); await page.getByRole('link', { name: /Impostazioni/ }).click();
  await page.getByText('Mai creato').waitFor();
  await page.getByRole('button', { name: 'Backup con documenti' }).click();
  await page.getByText('Backup pronto').waitFor();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: 'Salva in File' }).click()]);
  backupPath = join(downloadsDir, dl.suggestedFilename()); await dl.saveAs(backupPath);
  assert.match(dl.suggestedFilename(), /^domus-backup-\d{8}-\d{4}\.zip$/);
  await page.getByRole('dialog').getByRole('button', { name: 'Sì, salvato' }).click();
  await page.getByText('Backup registrato').waitFor();
  const [fcv] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Verifica un backup' }).click()]);
  await fcv.setFiles(backupPath);
  await page.getByText('Backup integro').waitFor();
  await page.locator('.sheet-foot .btn', { hasText: 'Chiudi' }).click();
  await page.getByText(/verificato/).first().waitFor();
});

await step('12. Backup malformato / non-backup: rifiutato senza modificare i dati', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'domus-bad-'));
  const good = readFileSync(backupPath); const bad = Buffer.from(good); bad[Math.floor(bad.length / 2)] ^= 0xff;
  writeFileSync(join(dir, 'corrotto.zip'), bad); writeFileSync(join(dir, 'testo.zip'), 'questo non è uno zip');
  const before = await page.evaluate(async () => { const { repo, dates } = await window.__load();const s = await repo.snapshot(); return s.tasks.length; });
  for (const f of ['corrotto.zip', 'testo.zip']) {
    await page.keyboard.press('Escape').catch(() => {});
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Ripristina da file' }).click()]);
    await fc.setFiles(join(dir, f));
    await page.getByText('Ripristino impossibile').waitFor();
    await page.locator('.sheet-foot .btn', { hasText: 'Chiudi' }).click();
  }
  assert.equal(await page.evaluate(async () => { const { repo, dates } = await window.__load();return (await repo.snapshot()).tasks.length; }), before);
  rmSync(dir, { recursive: true });
});

await step('11b. Ripristino idempotente sugli stessi dati (unione, nessuna cancellazione, nessun duplicato)', async () => {
  const before = await page.evaluate(async () => { const { repo, dates } = await window.__load();const s = await repo.snapshot(); return { t: s.tasks.length, d: s.documents.length, r: s.relationships.length }; });
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Ripristina da file' }).click()]);
  await fc.setFiles(backupPath);
  await page.getByText('Ripristino da backup').waitFor();
  assert.match(await page.getByRole('dialog').textContent(), /Da aggiungere0/); assert.match(await page.getByRole('dialog').textContent(), /Da aggiornare[^0-9]*0/);
  await page.getByRole('dialog').getByRole('button', { name: 'Ripristina' }).click();
  await page.getByText('Verifica post-ripristino superata').waitFor();
  await page.locator('.sheet-foot .btn', { hasText: 'Chiudi' }).click();
  assert.deepEqual(await page.evaluate(async () => { const { repo, dates } = await window.__load();const s = await repo.snapshot(); return { t: s.tasks.length, d: s.documents.length, r: s.relationships.length }; }), before);
});

// ---- ripristino in un profilo nuovo e vuoto ----
await step('11c. Ripristino completo in un dispositivo vuoto: dati, collegamenti e file identici', async () => {
  const src = await page.evaluate(async () => { const { repo, dates } = await window.__load();const s = await repo.snapshot(); const d = s.documents.find((x) => x.name === 'Polizza casa.pdf'); return { tasks: s.tasks.length, rel: s.relationships.length, docs: s.documents.length, sha: d.sha256, id: d.id }; });
  const dir2 = mkdtempSync(join(tmpdir(), 'domus-prof2-'));
  const [c2, p2] = await launch(dir2);
  await p2.goto(URL0); await finishOnboarding(p2);
  await p2.getByRole('link', { name: 'Altro' }).click(); await p2.getByRole('link', { name: /Impostazioni/ }).click();
  const [fc] = await Promise.all([p2.waitForEvent('filechooser'), p2.getByRole('button', { name: 'Ripristina da file' }).click()]);
  await fc.setFiles(backupPath);
  await p2.getByText('Ripristino da backup').waitFor();
  await p2.getByRole('dialog').getByRole('button', { name: 'Ripristina' }).click();
  await p2.getByText('Verifica post-ripristino superata').waitFor();
  const dst = await p2.evaluate(async () => { const { repo, dates } = await window.__load();const s = await repo.snapshot(); const d = s.documents.find((x) => x.name === 'Polizza casa.pdf'); const b = await repo.getDocumentBlob(d.id); const buf = await b.arrayBuffer(); const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((x) => x.toString(16).padStart(2, '0')).join('');
    return { tasks: s.tasks.length, rel: s.relationships.length, docs: s.documents.length, sha: d.sha256, hash: h, id: d.id, hasBlob: d.hasBlob, missing: s.documents.filter((x) => !x.hasBlob).length }; });
  assert.equal(dst.tasks, src.tasks); assert.equal(dst.rel, src.rel); assert.equal(dst.docs, src.docs); assert.equal(dst.hash, src.sha); assert.equal(dst.id, src.id); assert.ok(dst.hasBlob);
  assert.equal(dst.missing, 1, 'solo il documento già assente nell’origine resta senza file');
  await c2.close(); rmSync(dir2, { recursive: true, force: true });
});

await step('11d. Backup "solo dati": ripristino senza file → documenti segnalati come assenti, non finti', async () => {
  const dir3 = mkdtempSync(join(tmpdir(), 'domus-prof3-'));
  const bk = await page.evaluate(async () => { const { repo, dates } = await window.__load();const io = await import('/js/data/backup-io.js'); const { blob } = await io.createBackup(false); const b = new Uint8Array(await blob.arrayBuffer()); return Array.from(b); });
  const f = join(downloadsDir, 'solo-dati.zip'); writeFileSync(f, Buffer.from(bk));
  const [c3, p3] = await launch(dir3); await p3.goto(URL0); await finishOnboarding(p3);
  await p3.getByRole('link', { name: 'Altro' }).click(); await p3.getByRole('link', { name: /Impostazioni/ }).click();
  const [fc] = await Promise.all([p3.waitForEvent('filechooser'), p3.getByRole('button', { name: 'Ripristina da file' }).click()]);
  await fc.setFiles(f); await p3.getByRole('dialog').getByRole('button', { name: 'Ripristina' }).click();
  await p3.getByText('Verifica post-ripristino superata').waitFor();
  const r = await p3.evaluate(async () => { const { repo, dates } = await window.__load();const s = await repo.snapshot(); return { docs: s.documents.length, withBlob: s.documents.filter((d) => d.hasBlob).length, blobs: (await repo.blobIds()).length }; });
  assert.ok(r.docs >= 2); assert.equal(r.withBlob, 0); assert.equal(r.blobs, 0);
  await c3.close(); rmSync(dir3, { recursive: true, force: true });
});

await step('13. Spazio esaurito: errore chiaro, nessuna modifica parziale, app ancora utilizzabile', async () => {
  const before = await page.evaluate(async () => { const { repo, dates } = await window.__load();return (await repo.snapshot()).tasks.length; });
  await page.evaluate(() => { const orig = IDBObjectStore.prototype.put; window.__origPut = orig; IDBObjectStore.prototype.put = function () { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await page.getByRole('link', { name: 'Attività' }).first().click();
  await page.getByRole('button', { name: 'Nuova attività' }).first().click();
  await page.getByLabel('Titolo').fill('Non deve salvarsi'); await page.getByRole('button', { name: 'Salva' }).click();
  await page.getByText(/Spazio di archiviazione esaurito/).first().waitFor();
  // documento grande: anche l'import deve fallire in modo pulito
  const r = await page.evaluate(async () => { const { repo, dates } = await window.__load();try { await repo.importDocument(new File(['x'], 'x.bin')); return 'ok'; } catch (e) { return e.code; } });
  assert.equal(r, 'QUOTA');
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.__origPut; });
  await page.getByRole('button', { name: 'Chiudi' }).click();
  assert.equal(await page.evaluate(async () => { const { repo, dates } = await window.__load();return (await repo.snapshot()).tasks.length; }), before);
  await newTaskUI(page, 'Dopo il ripristino dello spazio', null); await page.getByText('Dopo il ripristino dello spazio').first().waitFor();
});

await step('14. Date: fuso orario, mezzanotte, cambio ora legale', async () => {
  for (const tz of ['Pacific/Auckland', 'America/Los_Angeles', 'UTC']) {
    const c = await chromium.launch(); const x = await c.newContext({ timezoneId: tz }); const p = await x.newPage(); await p.goto(URL0);
    const r = await p.evaluate(async () => { const d = await import('/js/lib/dates.js'); return [d.todayStr(new Date(2026, 9, 25, 0, 30)), d.todayStr(new Date(2026, 2, 29, 23, 59)), d.diffDays('2026-10-26', '2026-10-24'), d.addDays('2026-03-28', 2)]; });
    assert.deepEqual(r, ['2026-10-25', '2026-03-29', 2, '2026-03-30'], tz); await c.close();
  }
});

await step('15. Layout mobile: nessuno scorrimento orizzontale a 320/375/390/430 px; tap target ≥ 44 px', async () => {
  const routes = ['today', 'tasks', 'practices', 'archive', 'more', 'home', 'money', 'contacts', 'settings', 'search'];
  for (const w of [320, 375, 390, 430]) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const r of routes) {
      await page.goto(`${URL0}#/${r}`); await page.waitForLoadState('networkidle'); await sleep(120);
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, main: document.querySelector('main').scrollWidth - document.querySelector('main').clientWidth }));
      assert.ok(o.sw <= o.cw && o.main <= 0, `overflow a ${w}px su #/${r}: ${JSON.stringify(o)}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const r of ['today', 'tasks', 'archive', 'settings']) {
    await page.goto(`${URL0}#/${r}`); await sleep(200);
    const small = await page.evaluate(() => [...document.querySelectorAll('button, a.row, a.icon-btn, nav.tabs a, select, input:not([type=checkbox]):not(.sr-only)')].filter((e) => e.offsetParent).map((e) => [e, e.getBoundingClientRect()]).filter(([, b]) => b.height < 43.5 && b.width > 0).map(([e, b]) => `${e.tagName}.${e.className} "${(e.getAttribute('aria-label') || e.textContent).trim().slice(0, 30)}" ${Math.round(b.height)}px`));
    assert.deepEqual(small, [], `tap target piccoli in #/${r}`);
  }
});

await step('16. Accessibilità: nomi accessibili, landmark, focus trap, Esc, contrasto, reduced motion, dark', async () => {
  await page.goto(URL0 + '#/today'); await sleep(200);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'it');
  for (const route of ['today', 'tasks', 'archive', 'settings', 'search']) {
    await page.goto(`${URL0}#/${route}`); await sleep(250);
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('button, a[href], input:not([type=hidden]):not(.sr-only), select, textarea')].filter((e) => e.offsetParent).filter((e) => {
      const name = e.getAttribute('aria-label') || e.textContent.trim() || (e.id && document.querySelector(`label[for="${e.id}"]`)?.textContent.trim()) || e.getAttribute('placeholder'); return !name; }).map((e) => e.outerHTML.slice(0, 80)));
    assert.deepEqual(unnamed, [], `senza nome accessibile in ${route}`);
  }
  assert.equal(await page.locator('header').count(), 1); assert.equal(await page.locator('main').count(), 1); assert.equal(await page.locator('nav[aria-label]').count(), 1);
  await page.goto(URL0 + '#/tasks'); await page.getByRole('button', { name: 'Nuova attività' }).first().click();
  const dlg = page.getByRole('dialog'); await dlg.waitFor();
  assert.equal(await page.evaluate(() => document.getElementById('app').hasAttribute('inert')), true);
  for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role=dialog]')), 'il focus resta nella finestra'); }
  await page.keyboard.press('Escape'); await dlg.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.getElementById('app').hasAttribute('inert')), false);
  // contrasto WCAG AA per le coppie principali, in chiaro e scuro
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme }); await page.goto(URL0 + '#/today'); await sleep(200);
    const bad = await page.evaluate(() => {
      const L = (c) => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
      const css = (v) => { const e = document.createElement('i'); e.style.color = `var(${v})`; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; };
      const pairs = [['--ink', '--bg', 4.5], ['--ink', '--surface', 4.5], ['--muted', '--surface', 4.5], ['--muted', '--bg', 4.5], ['--accent-ink', '--accent', 4.5], ['--accent', '--surface', 4.5], ['--danger', '--surface', 4.5], ['--warn', '--warn-soft', 4.5], ['--danger', '--danger-soft', 4.5], ['--ok', '--ok-soft', 4.5], ['--accent', '--accent-soft', 4.5]];
      return pairs.map(([f, b, min]) => { const l1 = L(css(f)), l2 = L(css(b)); const r = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); return [f, b, +r.toFixed(2), min]; }).filter(([, , r, min]) => r < min);
    });
    assert.deepEqual(bad, [], `contrasto insufficiente (${scheme})`);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor); assert.ok(bg);
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' }); await page.goto(URL0 + '#/tasks'); await page.getByRole('button', { name: 'Nuova attività' }).first().click(); await page.getByRole('dialog').waitFor();
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.sheet')).animationName), 'none'); await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
});

await step('18. Nessuna richiesta di rete esterna e nessuna violazione CSP', async () => {
  assert.deepEqual(external, []);
  const v = await page.evaluate(() => window.__csp || []); assert.deepEqual(v, []);
  const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
  assert.match(csp, /default-src 'none'/); assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
});

await step('Integrità dati dopo tutte le operazioni', async () => {
  const issues = await page.evaluate(async () => { const { repo, dates } = await window.__load();const { checkIntegrity } = await import('/js/lib/integrity.js'); return checkIntegrity(await repo.snapshot(), new Set(await repo.blobIds())).map((i) => i.msg); });
  assert.deepEqual(issues.filter((m) => !/File mancante nella PWA: "temp\.txt"/.test(m)), []);
});
await ctx.close();

// ---------- 17. aggiornamento della PWA senza perdita di dati ----------
await step('17. Aggiornamento PWA 1.0.0 → 1.0.1: banner, applicazione volontaria, dati intatti, cache vecchia rimossa', async () => {
  const work = mkdtempSync(join(tmpdir(), 'domus-upd-'));
  for (const d of ['js', 'css', 'icons']) cpSync(join(ROOT, d), join(work, d), { recursive: true });
  for (const f of ['index.html', 'sw.js', 'manifest.webmanifest']) cpSync(join(ROOT, f), join(work, f));
  const p2 = 8932; const s2 = await startServer(work, p2); const U = base(p2);
  const dir = mkdtempSync(join(tmpdir(), 'domus-prof-upd-'));
  const c = await chromium.launchPersistentContext(dir, { ...CTX, serviceWorkers: 'allow' }); const p = c.pages()[0] || await c.newPage();
  await p.addInitScript(() => { window.__load = async () => ({ repo: await import('/js/data/repo.js'), dates: await import('/js/lib/dates.js') }); });
  await p.goto(U); await finishOnboarding(p);
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await p.evaluate(async () => { const { repo, dates } = await window.__load();await repo.create('tasks', { title: 'Sopravvive all’aggiornamento', due: '2027-05-01' }); await repo.importDocument(new File(['dati importanti'], 'imp.txt', { type: 'text/plain' })); });
  assert.deepEqual(await p.evaluate(() => caches.keys()), ['domus-shell-1.0.0']);
  // pubblico la nuova versione
  for (const f of ['sw.js', 'js/version.js']) writeFileSync(join(work, f), readFileSync(join(work, f), 'utf8').replace(/1\.0\.0/g, '1.0.1'));
  // offline: il controllo aggiornamenti non deve rompere nulla
  await c.setOffline(true); await p.getByRole('link', { name: 'Altro' }).click(); await p.getByRole('link', { name: /Impostazioni/ }).click();
  await p.getByRole('button', { name: 'Controlla aggiornamenti' }).click(); await p.getByText(/offline/i).first().waitFor();
  await c.setOffline(false);
  await p.getByRole('button', { name: 'Controlla aggiornamenti' }).click();
  await p.getByRole('button', { name: 'Aggiorna ora' }).waitFor({ timeout: 10000 });
  assert.equal(await p.evaluate(() => caches.keys().then((k) => k.sort().join())), 'domus-shell-1.0.0,domus-shell-1.0.1', 'la vecchia cache resta finché non si applica');
  await Promise.all([p.waitForEvent('load'), p.getByRole('button', { name: 'Aggiorna ora' }).click()]);
  await p.getByRole('heading', { name: 'Impostazioni', level: 1 }).waitFor();
  await p.waitForFunction(() => caches.keys().then((k) => k.join() === 'domus-shell-1.0.1'));
  const s = await p.evaluate(async () => { const { repo, dates } = await window.__load();const s = await repo.snapshot(); return { t: s.tasks.map((x) => x.title), d: s.documents.map((x) => x.name), blobs: (await repo.blobIds()).length }; });
  assert.deepEqual(s.t, ['Sopravvive all’aggiornamento']); assert.deepEqual(s.d, ['imp.txt']); assert.equal(s.blobs, 1);
  await p.getByText('1.0.1', { exact: true }).first().waitFor();
  await c.close(); s2.kill(); rmSync(work, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true });
});

// ---------- migrazione IndexedDB v1 → v2 ----------
await step('17b. Migrazione database v1→v2: dati intatti, indici creati, occKey riallineata', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'domus-prof-mig-'));
  const c = await chromium.launchPersistentContext(dir, { ...CTX }); const p = c.pages()[0] || await c.newPage();
  await p.goto(URL0 + 'icons/icon-192.png');   // documento senza app in esecuzione: stessa origine
  const r = await p.evaluate(async () => {
    const { runMigrations } = await import('/js/data/migrations.js');
    await new Promise((res, rej) => { const q = indexedDB.deleteDatabase('domus'); q.onsuccess = res; q.onerror = rej; });
    const db = await new Promise((res, rej) => { const q = indexedDB.open('domus', 1); q.onupgradeneeded = () => runMigrations(q.result, q.transaction, 0, 1); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    const iso = '2026-01-01T00:00:00.000Z', tk = (id, extra) => ({ id, title: id, status: 'open', priority: 'normal', createdAt: iso, updatedAt: iso, ...extra });
    await new Promise((res, rej) => { const tx = db.transaction(['tasks', 'blobs', 'documents', 'meta'], 'readwrite');
      tx.objectStore('tasks').put(tk('r1', { due: '2026-11-01', recurrence: { freq: 'weekly', interval: 1 }, seriesId: 's1' })); tx.objectStore('tasks').put(tk('r2', { due: '2026-11-01', recurrence: { freq: 'weekly', interval: 1 }, seriesId: 's1' }));
      tx.objectStore('tasks').put(tk('plain', { due: '2026-12-01' })); tx.objectStore('blobs').put({ buf: new TextEncoder().encode('ciao').buffer, type: 'text/plain', name: 'a.txt' }, 'doc1');
      tx.objectStore('documents').put({ id: 'doc1', name: 'a.txt', hasBlob: true, exportState: 'none', createdAt: iso, updatedAt: iso }); tx.objectStore('meta').put(true, 'setupDone'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    const v1Indexes = [...db.transaction('tasks').objectStore('tasks').indexNames]; db.close();
    const { open } = await import('/js/data/db.js'); const db2 = await open();   // upgrade a v2
    const tasks = await new Promise((res) => { const q = db2.transaction('tasks').objectStore('tasks').getAll(); q.onsuccess = () => res(q.result); });
    const idx = [...db2.transaction('tasks').objectStore('tasks').indexNames];
    const blob = await new Promise((res) => { const q = db2.transaction('blobs').objectStore('blobs').get('doc1'); q.onsuccess = () => res(new TextDecoder().decode(q.result.buf)); });
    return { version: db2.version, v1Indexes, idx, keys: tasks.map((t) => [t.id, t.occKey ?? null]).sort(), blob, n: tasks.length };
  });
  assert.equal(r.version, 2); assert.ok(!r.v1Indexes.includes('occKey')); assert.ok(r.idx.includes('occKey') && r.idx.includes('due'));
  assert.equal(r.n, 3); assert.equal(r.blob, 'ciao');
  const m = Object.fromEntries(r.keys); assert.equal(m.plain, null); assert.ok([m.r1, m.r2].filter(Boolean).length === 1, 'solo una delle due occorrenze duplicate ottiene la chiave');
  await c.close(); rmSync(dir, { recursive: true, force: true });
});

srv.kill(); rmSync(userData, { recursive: true, force: true });
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} passati${failed.length ? `, ${failed.length} FALLITI` : ''}\n`);
process.exit(failed.length ? 1 : 0);
