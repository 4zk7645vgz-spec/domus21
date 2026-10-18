import { addDays, addMonths, dayOf, parseDate, cmp } from './dates.js';

export const FREQS = [['daily', 'Ogni giorno'], ['weekly', 'Ogni settimana'], ['monthly', 'Ogni mese'], ['yearly', 'Ogni anno']];
const MAX_STEPS = 20000;

/** Prossima occorrenza STRETTAMENTE successiva a `from`, o null se oltre `until`. */
export function nextOccurrence(rule, from) {
  if (!rule || !parseDate(from)) return null;
  const n = Math.max(1, Math.floor(rule.interval || 1));
  const anchor = rule.anchorDay || dayOf(from);
  let next;
  switch (rule.freq) {
    case 'daily': next = addDays(from, n); break;
    case 'weekly': next = addDays(from, 7 * n); break;
    case 'monthly': next = addMonths(from, n, anchor); break;
    case 'yearly': next = addMonths(from, 12 * n, anchor); break;
    default: return null;
  }
  if (rule.until && cmp(next, rule.until) > 0) return null;
  return next;
}

/**
 * Dopo il completamento di un'occorrenza con scadenza `due`: restituisce la prima occorrenza
 * successiva a `due` che non sia già nel passato rispetto a `today`. Le occorrenze saltate per
 * mancato utilizzo non vengono generate (una sola occorrenza aperta per serie → nessun duplicato).
 */
export function nextAfterCompletion(rule, due, today) {
  let cur = due, skipped = 0, steps = 0;
  for (;;) {
    const n = nextOccurrence(rule, cur);
    if (!n) return null;
    if (cmp(n, today) >= 0) return { next: n, skipped };
    skipped++; cur = n;
    if (++steps > MAX_STEPS) return null;
  }
}

export function upcoming(rule, from, count = 3) {
  const out = []; let cur = from;
  while (out.length < count) { cur = nextOccurrence(rule, cur); if (!cur) break; out.push(cur); }
  return out;
}

export function describe(rule) {
  if (!rule) return '';
  const n = rule.interval || 1;
  const unit = { daily: ['giorno', 'giorni'], weekly: ['settimana', 'settimane'], monthly: ['mese', 'mesi'], yearly: ['anno', 'anni'] }[rule.freq];
  if (!unit) return '';
  return n === 1 ? `Ogni ${unit[0]}` : `Ogni ${n} ${unit[1]}`;
}
