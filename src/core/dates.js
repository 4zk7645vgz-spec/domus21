// Date helpers. Domus works with calendar dates as "YYYY-MM-DD" strings so that
// results never depend on the device time zone or on DST changes.

const RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y, m /* 1-12 */) {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

export function isValidDate(s) {
  if (typeof s !== 'string') return false;
  const m = RE_DATE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  return y >= 1900 && y <= 2200 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function parse(s) {
  if (!isValidDate(s)) throw new RangeError(`Data non valida: ${s}`);
  const m = RE_DATE.exec(s);
  return { y: +m[1], m: +m[2], d: +m[3] };
}

export function format({ y, m, d }) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Local calendar date of a Date object (device time zone). */
export function localDateString(date = new Date()) {
  return format({ y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() });
}

/** Days since 1970-01-01 for a calendar date (pure arithmetic, no time zone). */
export function toDayNumber(s) {
  const { y, m, d } = parse(s);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function fromDayNumber(n) {
  const dt = new Date(n * 86400000);
  return format({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

export function addDays(s, n) {
  return fromDayNumber(toDayNumber(s) + n);
}

export function diffDays(a, b) {
  return toDayNumber(a) - toDayNumber(b);
}

/** Adds months, clamping the day to the end of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(s, n, anchorDay) {
  const { y, m, d } = parse(s);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12 + 1;
  const wanted = anchorDay || d;
  return format({ y: ny, m: nm, d: Math.min(wanted, daysInMonth(ny, nm)) });
}

export function addYears(s, n, anchorMonth, anchorDay) {
  const { y, m, d } = parse(s);
  const ny = y + n;
  const nm = anchorMonth || m;
  return format({ y: ny, m: nm, d: Math.min(anchorDay || d, daysInMonth(ny, nm)) });
}

export function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function weekdayIndex(s) {
  // 0 = Monday ... 6 = Sunday
  return ((toDayNumber(s) % 7) + 7 + 3) % 7;
}

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export function formatLong(s) {
  const { y, m, d } = parse(s);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
export function formatShort(s) {
  const { y, m, d } = parse(s);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/** Human-friendly distance such as "oggi", "domani", "tra 5 giorni", "3 giorni fa". */
export function relative(s, today) {
  const n = diffDays(s, today);
  if (n === 0) return 'oggi';
  if (n === 1) return 'domani';
  if (n === -1) return 'ieri';
  if (n > 1) return `tra ${n} giorni`;
  return `${-n} giorni fa`;
}
