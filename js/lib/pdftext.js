// Lettore di testo PDF scritto per Domus (nessuna libreria). Legge i PDF "con testo selezionabile" prodotti da software
// reali (Word/LibreOffice, browser, gestionali, fatture elettroniche, portali): oggetti anche compressi (ObjStm),
// filtri Flate/ASCII85/ASCIIHex, font semplici e font CID con ToUnicode, larghezze dei glifi, ricostruzione di righe e colonne.
// NON legge: PDF scansionati (solo immagini → serve il testo incollato), PDF cifrati, font CID senza ToUnicode, filtri LZW/JBIG2.
// In questi casi ok:false con il motivo, e l'app guida l'utente a incollare il testo (es. "Copia testo" di iOS).
export const PDF_MAX_BYTES = 30 * 1024 * 1024;
const MAX_PAGES = 150, MAX_OPS = 4_000_000;

const latin1 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return s; };
const bytesOf = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };

// ---------- sintassi PDF ----------
const WS = /[\0\t\n\f\r ]/, DELIM = /[()<>[\]{}/%]/;
function skipWs(p) { for (;;) { const c = p.s[p.i]; if (c === undefined) return; if (WS.test(c)) p.i++; else if (c === '%') { while (p.i < p.s.length && p.s[p.i] !== '\n' && p.s[p.i] !== '\r') p.i++; } else return; } }
const REF = /\s+(\d+)\s+R(?![A-Za-z0-9])/y;
/** Valore PDF: numero | '/Nome' | {s} stringa | {ref} | array | dict (oggetto semplice) | {kw} parola chiave | null | bool */
export function parseValue(p) {
  skipWs(p); const s = p.s, c = s[p.i];
  if (c === undefined) return { kw: '' };
  if (c === '/') { let j = p.i + 1; while (j < s.length && !WS.test(s[j]) && !DELIM.test(s[j])) j++; const n = s.slice(p.i + 1, j).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))); p.i = j; return '/' + n; }
  if (c === '(') {
    let d = 1, out = ''; p.i++;
    while (p.i < s.length && d > 0) {
      const ch = s[p.i];
      if (ch === '\\') {
        const n = s[p.i + 1];
        if (n >= '0' && n <= '7') { let o = n, k = 2; while (k < 4 && s[p.i + k] >= '0' && s[p.i + k] <= '7') o += s[p.i + k++]; out += String.fromCharCode(parseInt(o, 8) & 255); p.i += k; continue; }
        const m = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[n];
        if (m !== undefined) out += m; else if (n === '\n' || n === '\r') { if (n === '\r' && s[p.i + 2] === '\n') p.i++; } else out += n ?? '';
        p.i += 2; continue;
      }
      if (ch === '(') d++; else if (ch === ')') { d--; if (!d) { p.i++; break; } }
      out += ch; p.i++;
    }
    return { s: out };
  }
  if (c === '<' && s[p.i + 1] === '<') {
    p.i += 2; const o = Object.create(null);
    for (;;) {
      skipWs(p);
      if (p.i >= s.length) break;
      if (s[p.i] === '>' && s[p.i + 1] === '>') { p.i += 2; break; }
      const k = parseValue(p);
      if (typeof k !== 'string' || k[0] !== '/') { if (k && k.kw === '') break; continue; }
      o[k.slice(1)] = parseValue(p);
    }
    return o;
  }
  if (c === '<') { const j = s.indexOf('>', p.i); const hex = s.slice(p.i + 1, j < 0 ? s.length : j).replace(/\s+/g, ''); p.i = j < 0 ? s.length : j + 1; let out = ''; for (let k = 0; k < hex.length; k += 2) out += String.fromCharCode(parseInt(hex.slice(k, k + 2).padEnd(2, '0'), 16) || 0); return { s: out }; }
  if (c === '[') { p.i++; const a = []; for (;;) { skipWs(p); if (p.i >= s.length) break; if (s[p.i] === ']') { p.i++; break; } a.push(parseValue(p)); } return a; }
  if (c === ')' || c === '>' || c === ']' || c === '{' || c === '}') { p.i++; return { kw: c }; }
  let j = p.i; while (j < s.length && !WS.test(s[j]) && !DELIM.test(s[j])) j++;
  const tok = s.slice(p.i, j); p.i = j;
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) {
    const n = parseFloat(tok);
    if (/^\d+$/.test(tok)) { REF.lastIndex = p.i; const m = REF.exec(s); if (m) { p.i = REF.lastIndex; return { ref: n }; } }
    return n;
  }
  if (tok === 'true') return true; if (tok === 'false') return false; if (tok === 'null') return null;
  return { kw: tok };
}

// ---------- filtri ----------
async function inflate(u8) {
  const ds = new DecompressionStream('deflate');
  const w = ds.writable.getWriter(); w.write(u8).catch(() => {}); w.close().catch(() => {});
  const r = ds.readable.getReader(); const parts = []; let n = 0;
  for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); n += value.length; if (n > 60 * 1024 * 1024) throw new Error('flusso troppo grande'); }
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
async function inflateLoose(u8) { for (const cut of [0, 1, 2, 3]) { try { return await inflate(u8.subarray(0, u8.length - cut)); } catch { /* riprova senza i byte finali (EOL) */ } } throw new Error('flate'); }
function ascii85(u8) {
  const s = latin1(u8).replace(/\s+/g, '').replace(/^<~/, ''); const out = []; let g = [], i = 0;
  for (; i < s.length; i++) {
    const ch = s[i]; if (ch === '~') break;
    if (ch === 'z' && !g.length) { out.push(0, 0, 0, 0); continue; }
    g.push(s.charCodeAt(i) - 33);
    if (g.length === 5) { let v = 0; for (const x of g) v = v * 85 + x; out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); g = []; }
  }
  if (g.length > 1) { const n = g.length; while (g.length < 5) g.push(84); let v = 0; for (const x of g) v = v * 85 + x; const b = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; out.push(...b.slice(0, n - 1)); }
  return Uint8Array.from(out);
}
const asciiHex = (u8) => { const h = latin1(u8).replace(/[^0-9a-fA-F>]/g, '').split('>')[0]; const o = []; for (let i = 0; i < h.length; i += 2) o.push(parseInt(h.slice(i, i + 2).padEnd(2, '0'), 16)); return Uint8Array.from(o); };

// ---------- documento ----------
class Doc {
  constructor(buf) { this.u8 = new Uint8Array(buf); this.bin = latin1(this.u8); this.objs = new Map(); this.fonts = new Map(); }
  resolve(v, d = 0) { while (v && typeof v === 'object' && 'ref' in v && d++ < 8) v = this.objs.get(v.ref)?.v; return v; }
  async streamData(o) {
    if (!o?.st) return null;
    const dict = o.v; let end = o.st.end; const len = this.resolve(dict.Length);
    if (typeof len === 'number' && o.st.start + len <= end && /^[\r\n ]*endstream/.test(this.bin.slice(o.st.start + len, o.st.start + len + 12))) end = o.st.start + len;
    let data = this.u8.subarray(o.st.start, end);
    let f = this.resolve(dict.Filter); f = f == null ? [] : Array.isArray(f) ? f.map((x) => this.resolve(x)) : [f];
    for (const x of f) {
      if (x === '/FlateDecode' || x === '/Fl') data = await inflateLoose(data);
      else if (x === '/ASCII85Decode' || x === '/A85') data = ascii85(data);
      else if (x === '/ASCIIHexDecode' || x === '/AHx') data = asciiHex(data);
      else return null;
    }
    return data;
  }
  async scan() {
    const bin = this.bin, re = /(\d+)\s+(\d+)\s+obj\b/g; let m, guard = 0;
    while ((m = re.exec(bin)) && guard++ < 400000) {
      const p = { s: bin, i: re.lastIndex };
      let v; try { v = parseValue(p); } catch { continue; }
      const o = { v };
      if (v && typeof v === 'object' && !Array.isArray(v) && !('kw' in v) && !('ref' in v) && !('s' in v)) {
        skipWs(p);
        if (bin.startsWith('stream', p.i)) {
          let st = p.i + 6; if (bin[st] === '\r') st++; if (bin[st] === '\n') st++;
          const end = bin.indexOf('endstream', st); if (end < 0) { this.objs.set(+m[1], o); break; }
          o.st = { start: st, end }; re.lastIndex = end + 9;
        }
      }
      this.objs.set(+m[1], o);
    }
    // oggetti compressi (ObjStm)
    for (const [, o] of [...this.objs]) {
      if (o.v && o.v.Type === '/ObjStm') {
        try {
          const data = await this.streamData(o); if (!data) continue;
          const s = latin1(data), n = this.resolve(o.v.N), first = this.resolve(o.v.First); const hp = { s, i: 0 }; const pairs = [];
          for (let k = 0; k < n; k++) { const a = parseValue(hp), b = parseValue(hp); if (typeof a === 'number' && typeof b === 'number') pairs.push([a, b]); }
          for (const [num, off] of pairs) { const vp = { s, i: first + off }; try { this.objs.set(num, { v: parseValue(vp) }); } catch { /* oggetto illeggibile: ignorato */ } }
        } catch { /* ObjStm non decodificabile */ }
      }
    }
  }
  pages() {
    const out = []; const seen = new Set();
    const walk = (node, inh, d) => {
      node = this.resolve(node); if (!node || typeof node !== 'object' || d > 40 || seen.has(node) || out.length >= MAX_PAGES) return; seen.add(node);
      const res = node.Resources !== undefined ? node.Resources : inh;
      if (node.Type === '/Pages' || Array.isArray(node.Kids)) for (const k of this.resolve(node.Kids) || []) walk(k, res, d + 1);
      else if (node.Type === '/Page' || node.Contents !== undefined) out.push({ page: node, res });
    };
    const root = /\/Root\s+(\d+)\s+\d+\s+R/.exec(this.bin.slice(-8192)) || [...this.bin.matchAll(/\/Root\s+(\d+)\s+\d+\s+R/g)].pop();
    if (root) { const cat = this.resolve({ ref: +root[1] }); if (cat && cat.Pages) walk(cat.Pages, undefined, 0); }
    if (!out.length) for (const [, o] of [...this.objs].sort((a, b) => a[0] - b[0])) if (o.v && o.v.Type === '/Page') out.push({ page: o.v, res: o.v.Resources });
    return out;
  }
}

// ---------- font ----------
const GLYPH = { space: ' ', Euro: '€', agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù', Agrave: 'À', Egrave: 'È', Eacute: 'É', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', ccedilla: 'ç', Ccedilla: 'Ç', degree: '°', quotesingle: "'", quoteright: '’', quoteleft: '‘', quotedblleft: '“', quotedblright: '”', endash: '–', emdash: '—', bullet: '•', hyphen: '-', minus: '-', period: '.', comma: ',', colon: ':', semicolon: ';', slash: '/', backslash: '\\', parenleft: '(', parenright: ')', percent: '%', ampersand: '&', at: '@', plus: '+', equal: '=', numbersign: '#', underscore: '_', asterisk: '*', exclam: '!', question: '?', quotedbl: '"', bracketleft: '[', bracketright: ']', less: '<', greater: '>', dollar: '$', copyright: '©', registered: '®', sterling: '£', ordmasculine: 'º', ordfeminine: 'ª', zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', fi: 'fi', fl: 'fl' };
const glyphChar = (n) => (n.length === 1 ? n : GLYPH[n] ?? (/^uni([0-9A-Fa-f]{4})$/.test(n) ? String.fromCharCode(parseInt(n.slice(3), 16)) : ''));
const WIN = new TextDecoder('windows-1252');

function parseCMap(text) {
  const map = new Map(); let codeLen = 0;
  const hex = (h) => h.replace(/\s+/g, '');
  const uni = (h) => { h = hex(h); let o = ''; for (let i = 0; i + 3 < h.length + 1; i += 4) o += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return o; };
  for (const m of text.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) { const a = /<([0-9a-fA-F\s]+)>/.exec(m[1]); if (a) codeLen = Math.max(codeLen, hex(a[1]).length / 2); }
  for (const m of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const x of m[1].matchAll(/<([0-9a-fA-F\s]+)>\s*<([0-9a-fA-F\s]*)>/g)) map.set(parseInt(hex(x[1]), 16), uni(x[2]));
  for (const m of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const x of m[1].matchAll(/<([0-9a-fA-F\s]+)>\s*<([0-9a-fA-F\s]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F\s]*>)/g)) {
      const lo = parseInt(hex(x[1]), 16), hi = Math.min(parseInt(hex(x[2]), 16), lo + 65535);
      if (x[3][0] === '[') { const items = [...x[3].matchAll(/<([0-9a-fA-F\s]*)>/g)]; for (let c = lo; c <= hi && c - lo < items.length; c++) map.set(c, uni(items[c - lo][1])); }
      else { const base = uni(x[3].slice(1, -1)); for (let c = lo; c <= hi; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - lo))); }
    }
  }
  return { map, codeLen };
}

async function fontInfo(doc, ref) {
  const key = ref && typeof ref === 'object' && 'ref' in ref ? ref.ref : null;
  if (key !== null && doc.fonts.has(key)) return doc.fonts.get(key);
  const f = doc.resolve(ref); const info = { cmap: null, codeLen: 1, type0: false, w: new Map(), dw: 1000, first: 0, missing: 500, diff: null, unmapped: 0 };
  if (f && typeof f === 'object') {
    info.type0 = f.Subtype === '/Type0';
    const tu = f.ToUnicode && doc.objs.get(f.ToUnicode.ref);
    if (tu) { try { const d = await doc.streamData(tu); if (d) { const c = parseCMap(latin1(d)); if (c.map.size) { info.cmap = c.map; info.codeLen = c.codeLen || (info.type0 ? 2 : 1); } } } catch { /* senza ToUnicode */ } }
    if (info.type0 && !info.cmap) info.codeLen = 2;
    const arr = (v) => (doc.resolve(v) || []).map((x) => doc.resolve(x));
    const desc = info.type0 ? doc.resolve(arr(f.DescendantFonts)[0]) : f;
    if (desc && typeof desc === 'object') {
      if (info.type0) {
        if (typeof doc.resolve(desc.DW) === 'number') info.dw = doc.resolve(desc.DW);
        const W = arr(desc.W);
        for (let i = 0; i < W.length;) {
          const c = W[i]; if (typeof c !== 'number') { i++; continue; }
          const nx = W[i + 1];
          if (Array.isArray(nx)) { nx.forEach((w, k) => info.w.set(c + k, doc.resolve(w))); i += 2; } else { for (let k = c; k <= nx && k - c < 70000; k++) info.w.set(k, W[i + 2]); i += 3; }
        }
      } else {
        info.first = doc.resolve(f.FirstChar) || 0; arr(f.Widths).forEach((w, k) => info.w.set(info.first + k, w));
        const fd = doc.resolve(f.FontDescriptor); if (fd && typeof doc.resolve(fd.MissingWidth) === 'number') info.missing = doc.resolve(fd.MissingWidth);
        const enc = doc.resolve(f.Encoding);
        if (enc && typeof enc === 'object' && !Array.isArray(enc) && enc.Differences) {
          info.diff = new Map(); let code = 0;
          for (const d of arr(enc.Differences)) { if (typeof d === 'number') code = d; else if (typeof d === 'string') { const ch = glyphChar(d.slice(1)); if (ch) info.diff.set(code, ch); code++; } }
        }
      }
    }
  }
  if (key !== null) doc.fonts.set(key, info);
  return info;
}
const widthOf = (fi, code) => { const w = fi.w.get(code); return typeof w === 'number' ? w : (fi.type0 ? fi.dw : fi.missing); };
/** Byte della stringa → [{ch, code}] secondo il font. */
function decodeShow(fi, s) {
  const out = [];
  if (fi && fi.cmap) {
    const n = fi.codeLen || 1;
    for (let i = 0; i + n <= s.length; i += n) { let code = 0; for (let k = 0; k < n; k++) code = (code << 8) | (s.charCodeAt(i + k) & 255); const ch = fi.cmap.get(code); if (ch === undefined) fi.unmapped++; out.push({ ch: ch ?? '', code }); }
    return out;
  }
  if (fi && fi.type0) { for (let i = 0; i + 1 < s.length; i += 2) { fi.unmapped++; out.push({ ch: '', code: ((s.charCodeAt(i) & 255) << 8) | (s.charCodeAt(i + 1) & 255) }); } return out; }
  if (s.charCodeAt(0) === 0xfe && s.charCodeAt(1) === 0xff) { for (let i = 2; i + 1 < s.length; i += 2) out.push({ ch: String.fromCharCode(((s.charCodeAt(i) & 255) << 8) | (s.charCodeAt(i + 1) & 255)), code: 0 }); return out; }
  const u = bytesOf(s);
  for (let i = 0; i < u.length; i++) out.push({ ch: fi?.diff?.get(u[i]) ?? WIN.decode(u.subarray(i, i + 1)), code: u[i] });
  return out;
}

// ---------- interprete dei content stream ----------
const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
const ID = [1, 0, 0, 1, 0, 0];
async function interpret(doc, cs, res, chunks, st, depth = 0) {
  const p = { s: cs, i: 0 }; const stack = []; let ctm = st.ctm || ID, tm = ID, tlm = ID;
  let fi = null, fs = 0, Tc = 0, Tw = 0, Tz = 1, Tl = 0; const gs = [];
  const fontRes = doc.resolve(res && doc.resolve(res).Font) || {}; const xo = doc.resolve(res && doc.resolve(res).XObject) || {};
  const show = (s) => {
    const items = decodeShow(fi, s); let txt = '';
    const M0 = mul(tm, ctm); const x0 = M0[4], y0 = M0[5];
    const vs = Math.abs(fs * Math.hypot(M0[2], M0[3])) || 1; let adv = 0;
    for (const { ch, code } of items) {
      const w = (fi ? widthOf(fi, code) : 500) / 1000;
      const t = (w * fs + Tc + (ch === ' ' && (!fi || fi.codeLen === 1) ? Tw : 0)) * Tz;
      txt += ch; adv += t; tm = mul([1, 0, 0, 1, t, 0], tm);
    }
    if (txt) chunks.push({ t: txt, x0, x1: x0 + adv * Math.hypot(M0[0], M0[1]), y: y0, fs: vs, pg: st.page, ord: chunks.length });
  };
  while (p.i < cs.length) {
    if (++st.ops > MAX_OPS) throw new Error('contenuto troppo complesso');
    const v = parseValue(p);
    if (v && typeof v === 'object' && !Array.isArray(v) && 'kw' in v) {
      const op = v.kw; const a = stack;
      switch (op) {
        case 'q': gs.push([ctm, fi, fs, Tc, Tw, Tz, Tl]); break;
        case 'Q': if (gs.length) [ctm, fi, fs, Tc, Tw, Tz, Tl] = gs.pop(); break;
        case 'cm': if (a.length >= 6) ctm = mul(a.slice(-6), ctm); break;
        case 'BT': tm = tlm = ID; break;
        case 'Tf': { const nm = a[a.length - 2]; fs = Number(a[a.length - 1]) || 0; fi = await fontInfo(doc, fontRes[typeof nm === 'string' ? nm.slice(1) : '']); break; }
        case 'Tc': Tc = Number(a[a.length - 1]) || 0; break;
        case 'Tw': Tw = Number(a[a.length - 1]) || 0; break;
        case 'Tz': Tz = (Number(a[a.length - 1]) || 100) / 100; break;
        case 'TL': Tl = Number(a[a.length - 1]) || 0; break;
        case 'Td': case 'TD': { const tx = Number(a[a.length - 2]) || 0, ty = Number(a[a.length - 1]) || 0; if (op === 'TD') Tl = -ty; tlm = mul([1, 0, 0, 1, tx, ty], tlm); tm = tlm; break; }
        case 'Tm': if (a.length >= 6) { tlm = tm = a.slice(-6).map(Number); } break;
        case 'T*': tlm = mul([1, 0, 0, 1, 0, -Tl], tlm); tm = tlm; break;
        case 'Tj': { const s = a[a.length - 1]; if (s && 's' in s) show(s.s); break; }
        case "'": case '"': { tlm = mul([1, 0, 0, 1, 0, -Tl], tlm); tm = tlm; const s = a[a.length - 1]; if (s && 's' in s) show(s.s); break; }
        case 'TJ': {
          const arr = a[a.length - 1]; if (!Array.isArray(arr)) break;
          let buf = '';
          const flush = () => { if (buf) { show(buf); buf = ''; } };
          for (const e of arr) {
            if (e && typeof e === 'object' && 's' in e) buf += e.s;
            else if (typeof e === 'number') {
              flush();
              const t = (-e / 1000) * fs * Tz; tm = mul([1, 0, 0, 1, t, 0], tm);
              if (e <= -180 && chunks.length) { const c = chunks[chunks.length - 1]; if (!c.t.endsWith(' ')) c.t += ' '; }
            }
          }
          flush(); break;
        }
        case 'Do': {
          const nm = a[a.length - 1]; const o = doc.resolve(xo[typeof nm === 'string' ? nm.slice(1) : '']); const ro = doc.objs.get(xo[typeof nm === 'string' ? nm.slice(1) : '']?.ref);
          if (ro && ro.v && ro.v.Subtype === '/Form' && depth < 3) {
            const data = await doc.streamData(ro).catch(() => null);
            if (data) { const m = (doc.resolve(ro.v.Matrix) || ID).map(Number); await interpret(doc, latin1(data), ro.v.Resources ?? res, chunks, { ...st, ctm: mul(m, ctm) }, depth + 1); }
          }
          void o; break;
        }
        case 'BI': { const e = cs.indexOf('EI', p.i); p.i = e < 0 ? cs.length : e + 2; break; }
        default: break;
      }
      stack.length = 0;
    } else { stack.push(v); if (stack.length > 64) stack.shift(); }
  }
}

/** Righe e colonne dai frammenti di testo posizionati (ordine: pagina, dall'alto, da sinistra). */
function layout(chunks) {
  const pages = new Map(); for (const c of chunks) (pages.get(c.pg) || pages.set(c.pg, []).get(c.pg)).push(c);
  const out = [];
  for (const [, cs] of [...pages].sort((a, b) => a[0] - b[0])) {
    cs.sort((a, b) => b.y - a.y || a.x0 - b.x0);
    const lines = [];
    for (const c of cs) { const L = lines.find((l) => Math.abs(l.y - c.y) <= 0.45 * Math.max(c.fs, l.fs)); if (L) L.items.push(c); else lines.push({ y: c.y, fs: c.fs, items: [c] }); }
    lines.sort((a, b) => b.y - a.y);
    for (const L of lines) {
      L.items.sort((a, b) => a.x0 - b.x0 || a.ord - b.ord);
      let line = '', prev = null;
      for (const c of L.items) {
        if (prev) { const gap = c.x0 - prev.x1; const sp = gap > 3 * c.fs ? '   ' : gap > 0.16 * c.fs ? ' ' : ''; if (sp && !line.endsWith(' ') && !c.t.startsWith(' ')) line += sp; }
        line += c.t; prev = c;
      }
      out.push(line.replace(/[ \t]+$/, ''));
    }
    out.push('');
  }
  return out.join('\n').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Valuta se il testo sembra testo vero (e non codici di glifi). */
export function textQuality(t) {
  const s = t.replace(/\s+/g, ' ').trim(); if (s.length < 20) return 0;
  const good = (s.match(/[A-Za-zÀ-ÿ0-9 .,;:€%/\-()'"@&]/g) || []).length;
  const words = (s.match(/[A-Za-zÀ-ÿ]{3,}/g) || []).length;
  return (good / s.length) * Math.min(1, words / 5);
}

/** Testo di un content stream senza risorse (usato nei test). */
export async function textFromContent(cs) {
  const chunks = []; await interpret(new Doc(new ArrayBuffer(0)), cs, undefined, chunks, { ops: 0, page: 0 }); return layout(chunks);
}

/** @param {ArrayBuffer} buf  @returns {Promise<{ok:boolean,text:string,reason?:string,pages?:number}>} */
export async function pdfToText(buf) {
  if (buf.byteLength > PDF_MAX_BYTES) return { ok: false, text: '', reason: 'file troppo grande per la lettura automatica (oltre 30 MB)' };
  if (typeof DecompressionStream === 'undefined') return { ok: false, text: '', reason: 'decompressione non supportata da questo browser' };
  const doc = new Doc(buf);
  if (doc.bin.slice(0, 1024).indexOf('%PDF') < 0) return { ok: false, text: '', reason: 'non è un PDF valido' };
  if (/\/Encrypt\s+(\d+\s+\d+\s+R|<<)/.test(doc.bin.slice(-16384)) || /\/Encrypt\s+\d+\s+\d+\s+R/.test(doc.bin.slice(0, 16384))) return { ok: false, text: '', reason: 'PDF protetto da password' };
  try {
    await doc.scan();
    const chunks = []; const st = { ops: 0, page: 0 }; let failed = 0, streams = 0, images = 0;
    for (const { page, res } of doc.pages()) {
      st.page++;
      let c = doc.resolve(page.Contents); c = Array.isArray(c) ? c : c ? [page.Contents] : [];
      let cs = '';
      for (const r of c) { streams++; const o = doc.objs.get(r?.ref); try { const d = await doc.streamData(o); if (d) cs += latin1(d) + '\n'; else failed++; } catch { failed++; } }
      const xo = doc.resolve(doc.resolve(res)?.XObject) || {}; for (const k in xo) { const ro = doc.objs.get(xo[k]?.ref); if (ro?.v?.Subtype === '/Image') images++; }
      if (cs) await interpret(doc, cs, res, chunks, { ...st });
    }
    const text = layout(chunks);
    const unmapped = [...doc.fonts.values()].reduce((n, f) => n + f.unmapped, 0);
    if (!text) return { ok: false, text: '', reason: images ? 'nessun testo selezionabile: il PDF contiene solo immagini (scansione)' : failed && failed === streams ? 'contenuto del PDF non leggibile' : unmapped ? 'il PDF usa font senza tabella di conversione del testo (Domus non può leggerlo)' : 'nessun testo selezionabile (probabile scansione o immagine)' };
    if (textQuality(text) < 0.6) return { ok: false, text: '', reason: 'il PDF usa una codifica dei caratteri che Domus non sa leggere' };
    return { ok: true, text, pages: st.page };
  } catch (e) { return { ok: false, text: '', reason: `lettura non riuscita (${String(e.message || e).slice(0, 80)})` }; }
}
