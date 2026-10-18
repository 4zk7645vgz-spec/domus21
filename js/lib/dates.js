// Date di calendario come stringhe 'YYYY-MM-DD' (nessun fuso orario, nessun DST).
// "Oggi" deriva dall'orologio locale del dispositivo; tutto il resto è aritmetica di calendario pura.
const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

export function parseDate(s) {
  if (typeof s !== 'string') return null;
  const m = RE.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}
export const isDate = (s) => parseDate(s) !== null;
const pad = (n, l = 2) => String(n).padStart(l, '0');
export const fmt = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

export function todayStr(now = new Date()) {
  return fmt(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
const toUTC = (s) => { const p = parseDate(s); return Date.UTC(p.y, p.m - 1, p.d); };
const fromUTC = (t) => { const d = new Date(t); return fmt(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };

export const addDays = (s, n) => fromUTC(toUTC(s) + n * 86400000);
export const diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / 86400000); // a - b

/** Aggiunge mesi con "giorno àncora": 31 gen +1 mese → 28/29 feb; poi 28 feb ancorato a 31 → 31 mar. */
export function addMonths(s, n, anchorDay) {
  const p = parseDate(s);
  const total = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(total / 12), m = (total % 12) + 1;
  const d = Math.min(anchorDay || p.d, daysInMonth(y, m));
  return fmt(y, m, d);
}
export const dayOf = (s) => parseDate(s).d;
export const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export function formatIT(s, withYear = true) {
  const p = parseDate(s);
  if (!p) return '';
  return `${p.d} ${MESI[p.m - 1]}${withYear ? ' ' + p.y : ''}`;
}
/** Etichetta relativa: "Oggi", "Domani", "Ieri", "tra 5 g", "5 g fa" */
export function relative(s, today) {
  if (!s) return '';
  const d = diffDays(s, today);
  if (d === 0) return 'Oggi';
  if (d === 1) return 'Domani';
  if (d === -1) return 'Ieri';
  if (d > 1 && d <= 60) return `tra ${d} g`;
  if (d < -1 && d >= -60) return `${-d} g fa`;
  return formatIT(s);
}
