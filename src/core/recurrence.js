// Recurrence rules. Occurrences are always computed from the rule's anchor date
// (never iteratively from the previous occurrence) so that clamping does not
// drift: a monthly rule anchored on the 31st gives 31 Jan, 28/29 Feb, 31 Mar...
import { addDays, addMonths, addYears, parse, compare } from './dates.js';

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];
export const FREQ_LABELS = { daily: 'Giorni', weekly: 'Settimane', monthly: 'Mesi', yearly: 'Anni' };
const MAX_CATCH_UP = 120;

export function validateRule(rule) {
  const errors = [];
  if (!rule || typeof rule !== 'object') return ['Regola mancante'];
  if (!FREQUENCIES.includes(rule.freq)) errors.push('Frequenza non valida');
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 120) errors.push('Intervallo non valido');
  try { parse(rule.anchor); } catch { errors.push('Data di partenza non valida'); }
  if (rule.until != null) { try { parse(rule.until); } catch { errors.push('Data di fine non valida'); } }
  return errors;
}

/** Date of the n-th occurrence (index 0 = anchor). */
export function occurrenceDate(rule, index) {
  const k = index * rule.interval;
  const a = parse(rule.anchor);
  switch (rule.freq) {
    case 'daily': return addDays(rule.anchor, k);
    case 'weekly': return addDays(rule.anchor, 7 * k);
    case 'monthly': return addMonths(rule.anchor, k, a.d);
    case 'yearly': return addYears(rule.anchor, k, a.m, a.d);
    default: throw new RangeError('Frequenza sconosciuta');
  }
}

export function isFinished(rule, index) {
  if (rule.until && compare(occurrenceDate(rule, index), rule.until) > 0) return true;
  return false;
}

/** Default policy for missed occurrences: keep all for monthly/yearly, only the latest for daily/weekly. */
export function missedPolicy(rule) {
  return rule.missedPolicy || (rule.freq === 'monthly' || rule.freq === 'yearly' ? 'all' : 'latest');
}

/** Deterministic id: generating the same occurrence twice can never duplicate it. */
export function occurrenceId(ruleId, index) {
  return `${ruleId}#${index}`;
}

/**
 * Indexes that must exist as of `today`: every occurrence up to and including the
 * first one that is not in the past (so there is always exactly one upcoming item).
 * With policy "latest" past occurrences before the most recent one are skipped.
 */
export function indexesToMaterialize(rule, today, fromIndex = 0) {
  const out = [];
  let i = fromIndex;
  let guard = 0;
  while (guard++ < 100000) {
    if (isFinished(rule, i)) break;
    const date = occurrenceDate(rule, i);
    out.push(i);
    if (compare(date, today) >= 0) break;
    i++;
  }
  if (missedPolicy(rule) === 'latest' && out.length > 2) {
    // keep only the last past occurrence and the upcoming one
    return out.slice(-2);
  }
  if (out.length > MAX_CATCH_UP) return out.slice(-MAX_CATCH_UP);
  return out;
}

export function describeRule(rule) {
  const n = rule.interval;
  const map = {
    daily: n === 1 ? 'ogni giorno' : `ogni ${n} giorni`,
    weekly: n === 1 ? 'ogni settimana' : `ogni ${n} settimane`,
    monthly: n === 1 ? 'ogni mese' : `ogni ${n} mesi`,
    yearly: n === 1 ? 'ogni anno' : `ogni ${n} anni`,
  };
  return map[rule.freq] || '';
}
