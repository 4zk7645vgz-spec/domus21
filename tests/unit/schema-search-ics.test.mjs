import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, STORES } from '../../js/data/schema.js';
import { buildIndex, query, norm } from '../../js/lib/search.js';
import { buildICS } from '../../js/lib/ics.js';
import { computeDashboard } from '../../js/lib/dashboard.js';
import { checkIntegrity } from '../../js/lib/integrity.js';

const M = { id: 'x', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
test('validazione: obbligatori, date, numeri, enum', () => {
  assert.ok(sanitize('tasks', {}).errors.length);
  const ok = sanitize('tasks', { title: ' Revisione caldaia ', due: '2026-11-01', cost: '12,50', priority: 'high' });
  assert.equal(ok.errors.length, 0); assert.equal(ok.value.title, 'Revisione caldaia'); assert.equal(ok.value.cost, 12.5);
  assert.ok(sanitize('tasks', { title: 'a', due: '2026-02-30' }).errors.length);
  assert.ok(sanitize('tasks', { title: 'a', cost: -1 }).errors.length);
  assert.ok(sanitize('tasks', { title: 'a', priority: 'urgentissima' }).errors.length);
  assert.ok(sanitize('tasks', { title: 'a', recurrence: { freq: 'monthly', interval: 1 } }).errors.length, 'ricorrenza senza scadenza');
  assert.ok(sanitize('contracts', { title: 'c', startDate: '2026-05-01', endDate: '2026-04-01' }).errors.length);
});
test('sanificazione: campi sconosciuti scartati, tipi errati rifiutati', () => {
  const r = sanitize('contacts', { name: 'Mario', evil: '<script>alert(1)</script>' });
  assert.equal(r.value.evil, undefined);
  assert.ok(sanitize('contacts', { name: { $ne: 1 } }).errors.length);
  assert.ok(sanitize('contacts', { name: 'x'.repeat(301) }).errors.length);
  assert.ok(sanitize('tasks', { title: 'a', tagIds: 'abc' }).errors.length);
  assert.ok(sanitize('nope', {}).errors.length);
});
test('importazione richiede meta valida', () => {
  assert.ok(sanitize('contacts', { name: 'a' }, { meta: true }).errors.length);
  assert.equal(sanitize('contacts', { name: 'a', ...M }, { meta: true }).errors.length, 0);
  assert.ok(sanitize('contacts', { name: 'a', ...M, updatedAt: 'ieri' }, { meta: true }).errors.length);
});
test('ricerca: accenti, AND, ranking', () => {
  const snap = { tasks: [{ id: '1', title: 'Pagare TARI', status: 'open', description: 'tributo rifiuti' }, { id: '2', title: 'Tari acconto', status: 'open' }],
    documents: [{ id: '3', name: 'Contratto luce.pdf', notes: 'Enel' }], contacts: [{ id: '4', name: 'Elettricista Rossi', company: 'Rossi srl' }], tags: [] };
  const idx = buildIndex(snap);
  assert.equal(query(idx, 'tari').length, 2); assert.equal(query(idx, 'tari rifiuti').length, 1); assert.equal(query(idx, 'ELETTRICISTA')[0].type, 'contact');
  assert.equal(query(idx, 'enel')[0].id, '3'); assert.equal(query(idx, 'zzz').length, 0); assert.equal(query(idx, '   ').length, 0); assert.equal(norm('Perché'), 'perche');
});
test('ICS: struttura, escape, righe piegate', () => {
  const s = buildICS([{ uid: 'a1', date: '2026-12-31', title: 'Pagare; "IMU", rata', description: 'riga1\nriga2 ' + 'x'.repeat(120) }], new Date('2026-10-18T10:00:00Z'));
  assert.match(s, /^BEGIN:VCALENDAR\r\n/); assert.match(s, /DTSTART;VALUE=DATE:20261231/); assert.match(s, /DTEND;VALUE=DATE:20270101/);
  assert.match(s, /SUMMARY:Pagare\\; "IMU"\\, rata/); assert.match(s, /DTSTAMP:20261018T100000Z/); assert.ok(s.endsWith('END:VCALENDAR\r\n'));
  for (const line of s.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.equal((s.match(/BEGIN:VALARM/g) || []).length, 2);
});
test('dashboard da dati reali', () => {
  const t = (id, due, status = 'open') => ({ id, title: id, due, status, priority: 'normal', createdAt: '', updatedAt: '' });
  const snap = { tasks: [t('ieri', '2026-10-17'), t('oggi', '2026-10-18'), t('presto', '2026-10-25'), t('lontano', '2027-01-01'), t('fatta', '2026-10-18', 'done'), { ...t('senza'), due: undefined }],
    utilities: [{ id: 'u', name: 'Luce', nextDue: '2026-10-30', active: true }], contracts: [{ id: 'c', title: 'RC', endDate: '2026-11-20', autoRenew: true }],
    maintenance: [{ id: 'm', title: 'Caldaia', nextDue: '2026-10-10' }], documents: [{ id: 'd', name: 'Polizza', expires: '2026-12-01', createdAt: '2026-10-01' }],
    practices: [{ id: 'p', title: 'P', status: 'open', updatedAt: '' }, { id: 'q', title: 'Q', status: 'closed', updatedAt: '' }] };
  const d = computeDashboard(snap, '2026-10-18');
  assert.deepEqual(d.overdue.map((x) => x.id), ['ieri']); assert.deepEqual(d.today.map((x) => x.id), ['oggi']); assert.deepEqual(d.upcoming.map((x) => x.id), ['presto']);
  assert.equal(d.undated, 1); assert.equal(d.payments.length, 2); assert.equal(d.maintenance[0].days, -8); assert.equal(d.docsExpiring.length, 1);
  assert.equal(d.practices.length, 1); assert.equal(d.isEmpty, false); assert.equal(computeDashboard({}, '2026-10-18').isEmpty, true);
});
test('integrità: orfani, duplicati, file mancanti', () => {
  const base = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  const snap = Object.fromEntries(STORES.map((s) => [s, []]));
  const tk = (id, due) => ({ id, title: 'A', status: 'open', priority: 'normal', seriesId: 's', recurrence: { freq: 'daily', interval: 1 }, due, ...base });
  snap.tasks = [tk('t1', '2026-10-18'), tk('t2', '2026-10-19')];
  snap.documents = [{ id: 'd1', name: 'x.pdf', hasBlob: true, exportState: 'none', ...base }];
  snap.relationships = [{ id: 'r', aType: 'task', aId: 't1', bType: 'document', bId: 'ghost', ...base }];
  const issues = checkIntegrity(snap, new Set(['orphan']));
  const msgs = issues.map((i) => i.msg).join('|');
  assert.match(msgs, /duplicate/); assert.match(msgs, /File mancante/); assert.match(msgs, /Collegamento orfano/); assert.match(msgs, /File orfano/);
  assert.equal(issues.find((i) => /File mancante/.test(i.msg)).fix.patch.hasBlob, false);
});
