// Lettore PDF MINIMALE, scritto per Domus (nessuna libreria). Estrae il testo da PDF "semplici" generati da software
// (fatture elettroniche, ricevute, estratti): stream FlateDecode con operatori di testo Tj/TJ e font a codifica semplice.
// NON legge: PDF scansionati (immagini), PDF cifrati, font con codifica CID/ToUnicode personalizzata, flussi non Flate.
// In questi casi restituisce ok:false con il motivo, e l'app chiede all'utente di incollare il testo (es. "Copia testo" di iOS).
const latin1 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return s; };
export const PDF_MAX_BYTES = 30 * 1024 * 1024;

async function inflate(u8) {
  const ds = new DecompressionStream('deflate');
  const w = ds.writable.getWriter(); w.write(u8).catch(() => {}); w.close().catch(() => {});
  const r = ds.readable.getReader(); const parts = []; let n = 0;
  for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); n += value.length; if (n > 40 * 1024 * 1024) throw new Error('flusso troppo grande'); }
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}

const WIN = { 0x80: '€', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x96: '–', 0x97: '—' };
function decodeBytes(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) { let s = ''; for (let i = 2; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]); return s; }
  let s = ''; for (const b of bytes) s += WIN[b] ?? String.fromCharCode(b); return s;
}

/** Estrae il testo da un content stream (stringa latin1). */
export function textFromContent(cs) {
  let out = '', i = 0; const n = cs.length; let arr = null; let last = [];
  const emit = (s) => { out += s; };
  const readString = () => {                       // cs[i] === '('
    const bytes = []; let depth = 1; i++;
    while (i < n && depth > 0) {
      const c = cs[i];
      if (c === '\\') {
        const d = cs[i + 1];
        if (d === 'n') bytes.push(10); else if (d === 'r') bytes.push(13); else if (d === 't') bytes.push(9); else if (d === 'b') bytes.push(8); else if (d === 'f') bytes.push(12);
        else if (d >= '0' && d <= '7') { let o = d, k = 2; while (k < 4 && cs[i + k] >= '0' && cs[i + k] <= '7') o += cs[i + k++]; bytes.push(parseInt(o, 8) & 255); i += k; continue; }
        else if (d === '\n' || d === '\r') { /* continuazione di riga */ } else bytes.push(d.charCodeAt(0) & 255);
        i += 2; continue;
      }
      if (c === '(') depth++; else if (c === ')') { depth--; if (!depth) { i++; break; } }
      bytes.push(c.charCodeAt(0) & 255); i++;
    }
    return decodeBytes(Uint8Array.from(bytes));
  };
  while (i < n) {
    const c = cs[i];
    if (c === '(') { const s = readString(); if (arr) arr.push(s); else last.push(s); continue; }
    if (c === '<' && cs[i + 1] !== '<') {
      const j = cs.indexOf('>', i); if (j < 0) break;
      const hex = cs.slice(i + 1, j).replace(/\s+/g, ''); const bytes = [];
      for (let k = 0; k + 1 < hex.length + 1; k += 2) { const v = parseInt(hex.slice(k, k + 2).padEnd(2, '0'), 16); if (!Number.isNaN(v)) bytes.push(v); }
      const s = decodeBytes(Uint8Array.from(bytes)); if (arr) arr.push(s); else last.push(s); i = j + 1; continue;
    }
    if (c === '[') { arr = []; i++; continue; }
    if (c === ']') { last = arr || []; arr = null; i++; continue; }
    if (c === '-' || c === '.' || (c >= '0' && c <= '9')) {
      let j = i + 1; while (j < n && /[0-9.]/.test(cs[j])) j++;
      if (arr) { const v = parseFloat(cs.slice(i, j)); if (v < -200) arr.push(' '); }
      i = j; continue;
    }
    if (/[A-Za-z'"*]/.test(c)) {
      let j = i + 1; while (j < n && /[A-Za-z0-9'"*]/.test(cs[j])) j++;
      const op = cs.slice(i, j); i = j;
      if (op === 'Tj' || op === 'TJ') { emit(last.join('')); last = []; }
      else if (op === "'" || op === '"') { emit('\n' + last.join('')); last = []; }
      else if (op === 'T*' || op === 'Td' || op === 'TD' || op === 'Tm' || op === 'ET') { if (!out.endsWith('\n')) emit('\n'); last = []; }
      else if (op === 'BT') last = [];
      continue;
    }
    i++;
  }
  return out;
}

/** Valuta se il testo sembra testo vero (e non codici di glifi). */
export function textQuality(t) {
  const s = t.replace(/\s+/g, ' ').trim(); if (s.length < 20) return 0;
  const good = (s.match(/[A-Za-zÀ-ÿ0-9 .,;:€%/\-()'"@&]/g) || []).length;
  const words = (s.match(/[A-Za-zÀ-ÿ]{3,}/g) || []).length;
  return (good / s.length) * Math.min(1, words / 5);
}

/** @param {ArrayBuffer} buf  @returns {Promise<{ok:boolean,text:string,reason?:string}>} */
export async function pdfToText(buf) {
  if (buf.byteLength > PDF_MAX_BYTES) return { ok: false, text: '', reason: 'file troppo grande per la lettura automatica (oltre 30 MB)' };
  const u8 = new Uint8Array(buf);
  if (latin1(u8.subarray(0, 8)).indexOf('%PDF') < 0) return { ok: false, text: '', reason: 'non è un PDF valido' };
  const bin = latin1(u8);
  if (/\/Encrypt\b/.test(bin.slice(Math.max(0, bin.length - 4096)))) return { ok: false, text: '', reason: 'PDF protetto da password' };
  if (typeof DecompressionStream === 'undefined') return { ok: false, text: '', reason: 'decompressione non supportata da questo browser' };
  let text = '', streams = 0, flate = 0, failed = 0, pos = 0;
  while (streams < 5000) {
    const sIdx = bin.indexOf('stream', pos); if (sIdx < 0) break;
    pos = sIdx + 6;
    if (bin.slice(sIdx - 3, sIdx) === 'end') continue;
    const objIdx = bin.lastIndexOf('obj', sIdx); const dict = bin.slice(objIdx < 0 ? 0 : objIdx, sIdx);
    let start = sIdx + 6; if (bin[start] === '\r') start++; if (bin[start] === '\n') start++;
    const end = bin.indexOf('endstream', start); if (end < 0) break;
    pos = end + 9; streams++;
    if (/\/Subtype\s*\/Image|\/Length1|\/FontFile|\/Type\s*\/XRef|\/Type\s*\/ObjStm/.test(dict)) continue;
    let data;
    if (/\/FlateDecode/.test(dict)) {
      flate++;
      // l'EOL prima di "endstream" non fa parte dei dati: provo senza 0, 1, 2 byte finali
      for (const cut of [0, 1, 2]) { try { data = await inflate(u8.subarray(start, end - cut)); break; } catch { /* riprova */ } }
      if (!data) { failed++; continue; }
    } else if (!/\/Filter/.test(dict)) data = u8.subarray(start, end); else continue;
    const cs = latin1(data);
    if (!/\bBT\b/.test(cs)) continue;
    text += textFromContent(cs) + '\n';
  }
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return { ok: false, text: '', reason: flate && failed === flate ? 'flussi del PDF non leggibili' : 'nessun testo selezionabile (probabile scansione o immagine)' };
  if (textQuality(text) < 0.6) return { ok: false, text: '', reason: 'il PDF usa una codifica dei caratteri che Domus non sa leggere' };
  return { ok: true, text };
}
