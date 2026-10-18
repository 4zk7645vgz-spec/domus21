import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, isLeap, addDays, addMonths, diffDays, todayStr, formatIT, relative } from '../../js/lib/dates.js';
import { nextOccurrence, nextAfterCompletion, upcoming, describe } from '../../js/lib/recurrence.js';

test('validazione date e anni bisestili', () => {
  assert.ok(parseDate('2028-02-29')); assert.equal(parseDate('2027-02-29'), null); assert.equal(parseDate('2100-02-29'), null); assert.ok(parseDate('2000-02-29'));
  assert.equal(parseDate('2026-13-01'), null); assert.equal(parseDate('2026-1-1'), null); assert.equal(parseDate(20260101), null);
  assert.ok(isLeap(2024) && !isLeap(1900) && isLeap(2000));
});
test('aritmetica di calendario senza effetti DST', () => {
  assert.equal(addDays('2026-03-28', 2), '2026-03-30'); assert.equal(addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01'); assert.equal(diffDays('2026-03-30', '2026-03-28'), 2);
  assert.equal(diffDays('2026-10-26', '2026-10-24'), 2); assert.equal(diffDays('2027-01-01', '2026-01-01'), 365);
});
test('addMonths con giorno àncora', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28'); assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-02-28', 1, 31), '2026-03-31'); assert.equal(addMonths('2026-11-30', 3), '2027-02-28'); assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
});
test('todayStr usa il calendario locale', () => {
  assert.equal(todayStr(new Date(2026, 9, 18, 23, 59)), '2026-10-18'); assert.equal(todayStr(new Date(2026, 9, 18, 0, 1)), '2026-10-18');
});
test('formattazione', () => {
  assert.equal(formatIT('2026-10-18'), '18 ott 2026'); assert.equal(relative('2026-10-19', '2026-10-18'), 'Domani');
  assert.equal(relative('2026-10-17', '2026-10-18'), 'Ieri'); assert.equal(relative('2026-10-18', '2026-10-18'), 'Oggi');
});
test('ricorrenze: mensile ancorata al 31', () => {
  const r = { freq: 'monthly', interval: 1, anchorDay: 31 };
  assert.deepEqual(upcoming(r, '2026-01-31', 4), ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
});
test('ricorrenze: annuale 29 febbraio', () => {
  const r = { freq: 'yearly', interval: 1, anchorDay: 29 };
  assert.deepEqual(upcoming(r, '2024-02-29', 5), ['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29', '2029-02-28']);
});
test('ricorrenze: giornaliera, settimanale, intervallo, until', () => {
  assert.equal(nextOccurrence({ freq: 'daily', interval: 3 }, '2026-02-27'), '2026-03-02');
  assert.equal(nextOccurrence({ freq: 'weekly', interval: 2 }, '2026-12-25'), '2027-01-08');
  assert.equal(nextOccurrence({ freq: 'yearly', interval: 1, until: '2026-12-31' }, '2026-06-01'), null);
  assert.equal(nextOccurrence({ freq: 'boh' }, '2026-06-01'), null);
});
test('ricorrenze: dopo settimane di inattività non si generano occorrenze arretrate', () => {
  const r = { freq: 'weekly', interval: 1 };
  const x = nextAfterCompletion(r, '2026-08-01', '2026-10-18');
  assert.equal(x.next, '2026-10-24'); assert.equal(x.skipped, 11);
  assert.deepEqual(nextAfterCompletion(r, '2026-10-24', '2026-10-18'), { next: '2026-10-31', skipped: 0 });
  assert.deepEqual(nextAfterCompletion({ freq: 'monthly', interval: 1, anchorDay: 31 }, '2026-01-31', '2026-05-10'), { next: '2026-05-31', skipped: 3 });
  assert.equal(nextAfterCompletion({ freq: 'daily', interval: 1, until: '2026-10-20' }, '2026-10-19', '2026-10-25'), null);
});
test('descrizione', () => { assert.equal(describe({ freq: 'monthly', interval: 1 }), 'Ogni mese'); assert.equal(describe({ freq: 'yearly', interval: 2 }), 'Ogni 2 anni'); });
