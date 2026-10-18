// ZIP minimale: scrittura "stored" (senza compressione, apribile da File/Archivio Utilità di iOS),
// lettura stored + deflate (via DecompressionStream, se disponibile). Nessun ZIP64.
const LIMITS = { entries: 20000, total: 2 * 1024 ** 3, name: 512 };
export class ZipError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

let TABLE;
function crcTable() {
  if (TABLE) return TABLE;
  TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0; }
  return TABLE;
}
export function crc32(bytes, crc = 0) {
  const t = crcTable(); let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
const u16 = (v, o, x) => v.setUint16(o, x, true), u32 = (v, o, x) => v.setUint32(o, x >>> 0, true);

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time & 0xffff, date & 0xffff];
}

/** entries: [{name, data: Uint8Array | Blob}] → Blob */
export async function writeZip(entries, now = new Date()) {
  if (entries.length > 65535) throw new ZipError('TOO_MANY', 'Troppi file per un archivio ZIP.');
  const parts = [], central = []; let offset = 0;
  const [dt, dd] = dosDateTime(now);
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    if (nameBytes.length > LIMITS.name) throw new ZipError('NAME', 'Nome file troppo lungo.');
    const bytes = e.data instanceof Uint8Array ? e.data : new Uint8Array(await e.data.arrayBuffer());
    if (bytes.length >= 0xffffffff || offset >= 0xffffffff) throw new ZipError('TOO_BIG', 'File troppo grande per un ZIP standard.');
    const crc = crc32(bytes);
    const lh = new DataView(new ArrayBuffer(30));
    u32(lh, 0, 0x04034b50); u16(lh, 4, 20); u16(lh, 6, 0x0800); u16(lh, 8, 0); u16(lh, 10, dt); u16(lh, 12, dd);
    u32(lh, 14, crc); u32(lh, 18, bytes.length); u32(lh, 22, bytes.length); u16(lh, 26, nameBytes.length); u16(lh, 28, 0);
    parts.push(lh.buffer, nameBytes, bytes);
    const ch = new DataView(new ArrayBuffer(46));
    u32(ch, 0, 0x02014b50); u16(ch, 4, 20); u16(ch, 6, 20); u16(ch, 8, 0x0800); u16(ch, 10, 0); u16(ch, 12, dt); u16(ch, 14, dd);
    u32(ch, 16, crc); u32(ch, 20, bytes.length); u32(ch, 24, bytes.length); u16(ch, 28, nameBytes.length);
    u32(ch, 42, offset);
    central.push(ch.buffer, nameBytes);
    offset += 30 + nameBytes.length + bytes.length;
  }
  const cdSize = central.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  u32(end, 0, 0x06054b50); u16(end, 8, entries.length); u16(end, 10, entries.length); u32(end, 12, cdSize); u32(end, 16, offset);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

const slice = async (blob, a, b) => new Uint8Array(await blob.slice(a, b).arrayBuffer());

/** Legge l'indice di uno ZIP (Blob/File). Restituisce {entries: Map(name→entry), read(name)→Uint8Array}. */
export async function readZip(blob) {
  const size = blob.size;
  if (size < 22) throw new ZipError('NOT_ZIP', 'Il file non è un archivio ZIP valido.');
  const tailLen = Math.min(size, 22 + 65535);
  const tail = await slice(blob, size - tailLen, size);
  const tv = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new ZipError('NOT_ZIP', 'Il file non è un archivio ZIP valido.');
  const count = tv.getUint16(eocd + 10, true), cdSize = tv.getUint32(eocd + 12, true), cdOff = tv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOff === 0xffffffff) throw new ZipError('ZIP64', 'ZIP64 non supportato.');
  if (count > LIMITS.entries) throw new ZipError('LIMIT', 'Archivio con troppi elementi.');
  if (cdOff + cdSize > size) throw new ZipError('CORRUPT', 'Archivio ZIP danneggiato (directory fuori limiti).');
  const cd = await slice(blob, cdOff, cdOff + cdSize);
  const v = new DataView(cd.buffer);
  const entries = new Map(); let p = 0, total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.length || v.getUint32(p, true) !== 0x02014b50) throw new ZipError('CORRUPT', 'Archivio ZIP danneggiato (directory centrale).');
    const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true);
    const csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
    const nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    if (nl > LIMITS.name || p + 46 + nl > cd.length) throw new ZipError('CORRUPT', 'Nome file non valido.');
    let name;
    try { name = dec.decode(cd.subarray(p + 46, p + 46 + nl)); } catch { throw new ZipError('CORRUPT', 'Nome file non valido.'); }
    p += 46 + nl + el + cl;
    if (flags & 1) throw new ZipError('ENCRYPTED', 'Archivio cifrato non supportato.');
    if (name.endsWith('/')) continue;
    // I nomi sono solo chiavi di ricerca, mai percorsi di file: rifiuto comunque quelli sospetti.
    if (name.startsWith('/') || name.includes('\\') || name.split('/').some((s) => s === '..' || s === '')) throw new ZipError('NAME', `Nome file non ammesso: ${name.slice(0, 80)}`);
    if (entries.has(name)) throw new ZipError('CORRUPT', `Voce duplicata: ${name.slice(0, 80)}`);
    total += usize;
    if (total > LIMITS.total) throw new ZipError('LIMIT', 'Archivio troppo grande.');
    entries.set(name, { name, method, crc, csize, usize, off });
  }
  async function read(name) {
    const e = entries.get(name);
    if (!e) throw new ZipError('MISSING', `File mancante nell'archivio: ${name}`);
    const lh = await slice(blob, e.off, e.off + 30);
    const lv = new DataView(lh.buffer);
    if (lh.length < 30 || lv.getUint32(0, true) !== 0x04034b50) throw new ZipError('CORRUPT', `Intestazione locale non valida: ${name}`);
    const start = e.off + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
    if (start + e.csize > size) throw new ZipError('CORRUPT', `Dati fuori limiti: ${name}`);
    let data = await slice(blob, start, start + e.csize);
    if (e.method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new ZipError('COMPRESSED', 'Questo browser non può leggere archivi compressi. Usare il backup originale non ricompresso.');
      const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(ds).arrayBuffer());
    } else if (e.method !== 0) throw new ZipError('METHOD', `Metodo di compressione ${e.method} non supportato.`);
    if (data.length !== e.usize) throw new ZipError('CORRUPT', `Dimensione errata: ${name}`);
    if (crc32(data) !== e.crc) throw new ZipError('CRC', `CRC errato: ${name}`);
    return data;
  }
  return { entries, read };
}
