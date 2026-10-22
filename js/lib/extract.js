// Estrazione di dati strutturati da testo di documento. Modulo PURO (nessun accesso a DOM o IndexedDB), testabile da Node.
//
// IMPORTANTE — natura del sistema: sono regole deterministiche (parole chiave, formati di date/importi, controllo
// della partita IVA), NON un modello di intelligenza artificiale. Ogni dato prodotto riporta:
//   kind  : 'extracted' (letto nel testo) | 'calculated' (derivato da altri dati) | 'inferred' (ipotesi) | 'manual'
//   conf  : 'high' | 'medium' | 'low'   (affidabilità stimata dalla regola)
//   snippet: riga di testo da cui proviene (provenienza)
//   status: nasce sempre 'proposed'; diventa 'confirmed'/'corrected'/'rejected' solo per azione dell'utente.
import { isDate, addMonths } from './dates.js';
import { norm } from './search.js';

const MESI = { gennaio: 1, gen: 1, febbraio: 2, feb: 2, marzo: 3, mar: 3, aprile: 4, apr: 4, maggio: 5, mag: 5, giugno: 6, giu: 6, luglio: 7, lug: 7, agosto: 8, ago: 8, settembre: 9, set: 9, sett: 9, ottobre: 10, ott: 10, novembre: 11, nov: 11, dicembre: 12, dic: 12 };
const pad = (n) => String(n).padStart(2, '0');

/** Tutte le date presenti in una stringa: [{iso, index, raw}] */
export function findDates(s) {
  const out = [];
  for (const m of s.matchAll(/(?<![\d/.-])(\d{1,2})\s?[/.\-]\s?(\d{1,2})\s?[/.\-]\s?(\d{4}|\d{2})(?![\d/.-])/g)) {
    let [, d, mo, y] = m; if (y.length === 2) y = '20' + y;
    const iso = `${y}-${pad(mo)}-${pad(d)}`;
    if (isDate(iso) && +y >= 1990 && +y <= 2100) out.push({ iso, index: m.index, raw: m[0] });
  }
  for (const m of s.matchAll(/(?<!\d)(\d{1,2})\s+(gennaio|gen|febbraio|feb|marzo|mar|aprile|apr|maggio|mag|giugno|giu|luglio|lug|agosto|ago|settembre|sett|set|ottobre|ott|novembre|nov|dicembre|dic)\.?\s+(\d{4})(?!\d)/gi)) {
    const iso = `${m[3]}-${pad(MESI[m[2].toLowerCase()])}-${pad(m[1])}`;
    if (isDate(iso)) out.push({ iso, index: m.index, raw: m[0] });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Importi in formato italiano/internazionale: [{value:'1234.56', index, raw}] (value = stringa con 2 decimali) */
export function findAmounts(s) {
  const out = [];
  for (const m of s.matchAll(/(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})(?![\d])/g)) {
    let raw = m[1], v;
    const lc = raw.lastIndexOf(','), ld = raw.lastIndexOf('.');
    if (lc > ld) v = raw.replace(/\./g, '').replace(',', '.'); else v = raw.replace(/,/g, '');
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n < 1e9) out.push({ value: n.toFixed(2), index: m.index, raw });
  }
  return out;
}

/** Controllo formale della partita IVA italiana (11 cifre, cifra di controllo). */
export function vatChecksumOk(p) {
  if (!/^\d{11}$/.test(p)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) { let d = +p[i]; if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return (10 - (sum % 10)) % 10 === +p[10];
}

const KIND_RULES = {
  fattura: [['fattura', 3], ['imponibile', 1], ['codice destinatario', 1.5], ['totale documento', 1], ['p.iva', 0.5], ['partita iva', 0.5]],
  ricevuta: [['ricevuta', 3], ['scontrino', 3], ['documento commerciale', 3], ['pagamento ricevuto', 1.5]],
  preventivo: [['preventivo', 3.5], ['offerta', 1.5], ['validita offerta', 2], ['valido fino', 1.5], ['valida fino', 1.5]],
  contratto: [['contratto', 2.5], ['le parti', 1.5], ['si conviene', 1.5], ['recesso', 1], ['clausola', 1]],
  polizza: [['polizza', 3.5], ['assicurazione', 1.5], ['premio', 1.5], ['massimale', 2], ['assicurato', 1.5]],
  bolletta: [['bolletta', 3], ['pod', 1.5], ['pdr', 1.5], ['kwh', 1.5], ['smc', 1.5], ['periodo di fatturazione', 1.5], ['servizio idrico', 2], ['consumo', 0.8]],
  garanzia: [['certificato di garanzia', 4], ['garanzia', 2], ['periodo di garanzia', 2]],
  manuale: [['manuale', 3], ['istruzioni per l uso', 3], ['istruzioni', 1.5], ['avvertenze', 1.5]],
  tributo: [['modello f24', 4], ['f24', 2.5], ['imu', 3], ['tari', 3], ['tassa rifiuti', 3], ['agenzia delle entrate', 1.5], ['bollo auto', 3], ['tributo', 1.5], ['codice tributo', 3]],
  condominio: [['condominio', 2.5], ['rendiconto', 2], ['millesimi', 3], ['amministratore', 2], ['assemblea', 1.5], ['quota condominiale', 3]],
  catasto: [['visura catastale', 4.5], ['planimetria', 3], ['rendita catastale', 3.5], ['catasto', 2], ['foglio particella', 3], ['subalterno', 2.5]],
  veicolo: [['targa', 3], ['libretto di circolazione', 4], ['revisione', 2], ['rca', 2], ['autoveicolo', 2.5], ['bollo auto', 2]],
  certificato: [['dichiarazione di conformita', 4.5], ['attestato di prestazione energetica', 4.5], ['certificato', 2], ['certificazione', 2], ['collaudo', 2], ['conformita', 1]],
};
/** Fornitori riconoscibili per nome (elenco volutamente corto: i nomi sconosciuti restano "ipotesi"). */
export const KNOWN_PROVIDERS = [
  ['Enel Energia', /\benel\s+energia\b/i, 'luce'], ['Plenitude', /\bplenitude\b|\beni\s+(?:gas\s+e\s+luce|plenitude)\b/i, 'luce'], ['Edison', /\bedison\b/i, 'luce'], ['A2A', /\ba2a\b/i, 'luce'], ['Sorgenia', /\bsorgenia\b/i, 'luce'],
  ['Hera Comm', /\bhera\s+comm\b/i, 'luce'], ['Acea', /\bacea\b/i, 'luce'], ['Iren', /\biren\b/i, 'luce'], ['E.ON', /\be\.on\b/i, 'luce'], ['Italgas', /\bitalgas\b/i, 'gas'],
  ['Abbanoa', /\babbanoa\b/i, 'acqua'], ['TIM', /\btim\b|telecom\s+italia/i, 'internet'], ['Vodafone', /\bvodafone\b/i, 'internet'], ['WindTre', /\bwind\s?tre\b/i, 'telefono'], ['Fastweb', /\bfastweb\b/i, 'internet'], ['Iliad', /\biliad\b/i, 'telefono'], ['Poste Italiane', /\bposte\s+italiane\b/i, 'altro'],
  ['UnipolSai', /\bunipol(?:sai)?\b/i, 'assicurazione'], ['Generali', /\bgenerali\b/i, 'assicurazione'], ['Allianz', /\ballianz\b/i, 'assicurazione'], ['AXA', /\baxa\b/i, 'assicurazione'], ['Reale Mutua', /\breale\s+mutua\b/i, 'assicurazione'], ['Zurich', /\bzurich\b/i, 'assicurazione'],
];
export const SERVICE_RULES = { luce: ['kwh', 'energia elettrica', 'pod', 'potenza impegnata'], gas: ['smc', 'gas naturale', 'pdr', 'metano'], acqua: ['servizio idrico', 'acquedotto', 'fognatura', 'depurazione'], internet: ['fibra', 'adsl', 'internet', 'ftth'], telefono: ['linea mobile', 'sim', 'telefonia'], rifiuti: ['tari', 'tassa rifiuti'] };
/** Categoria predefinita suggerita (nome come in DEFAULT_CATEGORIES) da tipologia e servizio. */
export function suggestCategory(kind, service) {
  if (service === 'rifiuti') return 'Fisco e tributi';
  if (['luce', 'gas', 'acqua', 'internet', 'telefono'].includes(service)) return 'Utenze';
  return { bolletta: 'Utenze', polizza: 'Assicurazioni', contratto: 'Contratti', tributo: 'Fisco e tributi', condominio: 'Condominio', garanzia: 'Garanzie e manuali', manuale: 'Garanzie e manuali', veicolo: 'Veicoli', certificato: 'Casa', catasto: 'Casa', fattura: 'Casa', preventivo: 'Casa', ricevuta: 'Casa' }[kind] || '';
}
export const EXTRACTOR_VERSION = 2;
export const KIND_LABEL = { tributo: 'Tributo / F24', condominio: 'Condominio', catasto: 'Catasto / visura', veicolo: 'Veicolo', fattura: 'Fattura', ricevuta: 'Ricevuta / scontrino', preventivo: 'Preventivo', contratto: 'Contratto', polizza: 'Polizza assicurativa', bolletta: 'Bolletta / utenza', garanzia: 'Garanzia', manuale: 'Manuale', certificato: 'Certificato / dichiarazione' };

/** Classificazione per punteggio: restituisce {kind, conf, score} oppure null se nessun indizio sufficiente. */
export function classify(text) {
  const t = ' ' + norm(text).replace(/[^a-z0-9. ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const scores = [];
  for (const [kind, rules] of Object.entries(KIND_RULES)) {
    let s = 0;
    for (const [kw, w] of rules) {
      const re = new RegExp(`(?<![a-z0-9])${kw.replace(/[.]/g, '\\.')}(?![a-z0-9])`, 'g');
      const n = (t.match(re) || []).length; if (n) s += w * Math.min(n, 3) ** 0.5;
    }
    if (s) scores.push([kind, s]);
  }
  scores.sort((a, b) => b[1] - a[1]);
  if (!scores.length || scores[0][1] < 1.5) return null;
  const [kind, s1] = scores[0]; const s2 = scores[1]?.[1] || 0;
  let conf = s1 >= 4 && s1 >= 2 * s2 ? 'high' : s1 >= 2.5 ? 'medium' : 'low';
  if (s2 >= 0.7 * s1) conf = conf === 'high' ? 'medium' : 'low';   // ambiguo: declassa
  return { kind, conf, score: s1 };
}

const snip = (line) => String(line).replace(/\s+/g, ' ').trim().slice(0, 140);
const LABELS = {
  total: [[/totale\s+da\s+pagare/i, 'high'], [/importo\s+da\s+pagare/i, 'high'], [/totale\s+bolletta/i, 'high'], [/totale\s+da\s+versare/i, 'high'], [/saldo\s+da\s+pagare/i, 'high'], [/totale\s+versament[oi]/i, 'high'], [/totale\s+documento/i, 'high'], [/totale\s+fattura/i, 'high'], [/importo\s+totale/i, 'high'], [/totale\s+complessivo/i, 'high'], [/netto\s+a\s+pagare/i, 'high'], [/totale(?!\s+(?:imponibile|iva|imposta|parziale))/i, 'medium']],
  net: [[/(?:totale\s+)?imponibile/i, 'high']],
  vat: [[/(?:totale\s+)?(?:importo\s+)?\biva\b(?!\s+(?:inclusa|esclusa|compresa))/i, 'medium']],
};
const LBL_EXPIRY = /(scadenza|scade\s+il|da\s+pagare\s+entro|pagamento\s+entro|pagare\s+entro|entro\s+il|valid[ao]\s+fino\s+al|validit[àa]\s+(?:fino\s+al|offerta)?|data\s+di\s+rinnovo|rinnovo|termine\s+di\s+pagamento)/i;
const LBL_ISSUE = /(data\s+(?:di\s+)?(?:emissione|fattura|documento|ricevuta|preventivo|stipula)|emess[ao]\s+il|data\s*:)/i;

/**
 * Estrae i campi dal testo.
 * @param {string} text
 * @param {{properties?: {id:string,name:string,address?:string}[]}} [ctx]
 * @returns {{kind: ReturnType<typeof classify>, fields: object[], warnings: string[]}}
 */
export function extractFields(text, ctx = {}) {
  const src = String(text || '').replace(/ /g, ' ');
  const lines = src.split(/\r?\n/).map((l) => l.trim());
  const fields = []; const warnings = [];
  const add = (key, label, value, o = {}) => { if (value === '' || value == null) return; fields.push({ key, label, value: String(value), status: 'proposed', kind: o.kind || 'extracted', conf: o.conf || 'medium', snippet: o.snippet ? snip(o.snippet) : '' }); };
  const get = (k) => fields.find((f) => f.key === k);

  // tipologia
  const cls = classify(src);
  if (cls) add('docKind', 'Tipologia', cls.kind, { kind: 'inferred', conf: cls.conf, snippet: `riconosciuta da parole chiave (${KIND_LABEL[cls.kind] || cls.kind})` });

  // numero documento (+ data "del")
  for (const l of lines) {
    const m = /(?:fattura|ricevuta|preventivo|offerta|ordine|bolletta|documento)\s*(?:n(?:\.|°|r\.?|umero)?|nr\.?)\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9/_-]{0,24})/i.exec(l);
    if (m && /\d/.test(m[1])) { add('docNo', 'Numero documento', m[1], { conf: 'high', snippet: l }); break; }
  }

  // date: emissione e scadenza (per etichetta); "n. 12 del 03/04/2026" come emissione
  let issue = null, expiry = null;
  for (let i = 0; i < lines.length && !(issue && expiry); i++) {
    const l = lines[i], both = l + ' ' + (lines[i + 1] || '');
    if (!expiry) { const m = LBL_EXPIRY.exec(l); if (m) { const d = findDates(both.slice(m.index)).find(Boolean); if (d) expiry = { ...d, line: l }; } }
    if (!issue) {
      const m = LBL_ISSUE.exec(l);
      if (m) { const d = findDates(both.slice(m.index)).find(Boolean); if (d) issue = { ...d, line: l, conf: 'high' }; }
      else { const m2 = /\b(?:n(?:\.|°|r\.?)?\s*[\w/-]+\s+)?del\s+(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})/i.exec(l); if (m2 && /fattura|ricevuta|preventivo|offerta|bolletta|documento/i.test(l)) { const d = findDates(m2[1])[0]; if (d) issue = { ...d, line: l, conf: 'high' }; } }
    }
  }
  if (!issue) { const first = findDates(src)[0]; if (first && !(expiry && expiry.iso === first.iso)) { const line = lines.find((l) => l.includes(first.raw)) || ''; issue = { ...first, line, conf: 'low', inferred: true }; } }
  if (issue) add('date', 'Data del documento', issue.iso, { kind: issue.inferred ? 'inferred' : 'extracted', conf: issue.conf, snippet: issue.line });
  if (expiry) add('expires', 'Scadenza', expiry.iso, { conf: 'medium', snippet: expiry.line });
  if (issue && expiry && expiry.iso < issue.iso) warnings.push('La scadenza risulta precedente alla data del documento: verifica entrambe.');

  // importi
  const pick = (rules, { excludeVat = false } = {}) => {
    for (const [re, conf] of rules) {
      const hits = [];
      lines.forEach((l, i) => {
        const m = re.exec(l); if (!m) return;
        let tail = l.slice(m.index + m[0].length); if (excludeVat) tail = tail.replace(/\d{1,2}(?:[.,]\d+)?\s*%/g, ' ');
        let a = findAmounts(tail)[0]; let from = l;
        if (!a && lines[i + 1]) { a = findAmounts(lines[i + 1].replace(/\d{1,2}(?:[.,]\d+)?\s*%/g, ' '))[0]; from = l + ' ' + lines[i + 1]; }
        if (a) hits.push({ ...a, line: from, conf });
      });
      if (hits.length) {
        const vals = new Set(hits.map((h) => h.value));
        const h = hits[hits.length - 1];
        return { ...h, conf: vals.size > 1 ? 'low' : h.conf, multi: vals.size > 1 };
      }
    }
    return null;
  };
  const tot = pick(LABELS.total), net = pick(LABELS.net), vat = pick(LABELS.vat, { excludeVat: true });
  if (tot) { add('amount', 'Importo totale (€)', tot.value, { conf: tot.conf, snippet: tot.line }); if (tot.multi) warnings.push('Più importi diversi compaiono come "totale": verifica quello corretto.'); }
  if (net) add('amountNet', 'Imponibile (€)', net.value, { conf: net.conf, snippet: net.line });
  if (vat) add('vatAmount', 'IVA (€)', vat.value, { conf: vat.conf, snippet: vat.line });
  if (tot && net && !vat) { const d = +(tot.value - net.value).toFixed(2); if (d > 0 && d < +tot.value) add('vatAmount', 'IVA (€)', d.toFixed(2), { kind: 'calculated', conf: 'medium', snippet: 'totale − imponibile' }); }
  if (tot && net && vat && Math.abs(+net.value + +vat.value - +tot.value) > 0.02) warnings.push(`Incoerenza: imponibile ${net.value} + IVA ${vat.value} ≠ totale ${tot.value}. Verifica gli importi sul documento.`);
  const rate = lines.map((l) => /\biva\b[^%\n]{0,20}?(\d{1,2})\s*%/i.exec(l)).find(Boolean);
  if (rate) add('vatRate', 'Aliquota IVA (%)', rate[1], { conf: 'medium', snippet: rate.input });

  // partita IVA
  const vm = lines.map((l, i) => ({ m: /(?:p\.?\s?iva|partita\s+iva)\s*[:.]?\s*(?:IT)?\s*(\d{11})/i.exec(l), l, i })).find((x) => x.m);
  if (vm) {
    const ok = vatChecksumOk(vm.m[1]);
    add('issuerVat', 'Partita IVA', vm.m[1], { conf: ok ? 'high' : 'low', snippet: vm.l });
    if (!ok) warnings.push('La partita IVA letta non supera il controllo formale: potrebbe essere stata letta male.');
  }
  // fornitore noto (nome riconosciuto nel testo) → emittente affidabile e tipo di servizio
  const known = KNOWN_PROVIDERS.find(([, re]) => re.test(src));
  let service = known && known[2] !== 'altro' && known[2] !== 'assicurazione' ? known[2] : '';
  if (!service) { const nt0 = ' ' + norm(src) + ' '; for (const [s, kws] of Object.entries(SERVICE_RULES)) if (kws.some((k) => new RegExp(`(?<![a-z0-9])${k}(?![a-z0-9])`).test(nt0))) { service = s; break; } }
  if (service && ['bolletta', 'fattura', 'tributo', undefined].includes(cls?.kind)) add('serviceType', 'Tipo di servizio', service, { kind: 'inferred', conf: known ? 'high' : 'medium', snippet: known ? `fornitore ${known[0]}` : 'parole chiave del servizio' });
  if (known) { const l = lines.find((x) => known[1].test(x)) || ''; add('issuer', 'Emittente / fornitore', known[0], { conf: 'high', snippet: l }); }
  // periodo di riferimento e identificativi di fornitura
  for (let i = 0; i < lines.length; i++) {
    const m = /periodo\s+(?:di\s+)?(?:riferimento|fatturazione|di\s+consumo)?[^\d\n]{0,15}(?:dal\s+)?(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})\s*(?:al|-|–)\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})/i.exec(lines[i]);
    if (m) { const a = findDates(m[1])[0], b = findDates(m[2])[0]; if (a && b && a.iso <= b.iso) { add('periodStart', 'Inizio periodo', a.iso, { conf: 'high', snippet: lines[i] }); add('periodEnd', 'Fine periodo', b.iso, { conf: 'high', snippet: lines[i] }); break; } }
  }
  const pod = /\bIT\s?\d{3}\s?E\s?\d{8}\b/i.exec(src); if (pod) add('pod', 'Codice POD', pod[0].replace(/\s/g, '').toUpperCase(), { conf: 'high', snippet: lines.find((l) => l.includes(pod[0])) });
  const pdr = /\bPDR\s*[:.]?\s*(\d{14})\b/i.exec(src); if (pdr) add('pdr', 'Codice PDR', pdr[1], { conf: 'high', snippet: lines.find((l) => l.includes(pdr[1])) });
  const plate = /\btarga\s*[:.]?\s*([A-Z]{2}\s?\d{3}\s?[A-Z]{2})\b/i.exec(src); if (plate) add('plate', 'Targa', plate[1].replace(/\s/g, '').toUpperCase(), { conf: 'high', snippet: lines.find((l) => /targa/i.test(l)) });
  // categoria suggerita
  const catName = suggestCategory(cls?.kind, service); if (catName && cls && cls.conf !== 'low') add('categoryId', 'Categoria', catName, { kind: 'inferred', conf: 'medium', snippet: 'dedotta dal tipo di documento' });
  // emittente (ipotesi): prima riga con forma societaria, altrimenti la riga che precede la P.IVA
  const co = lines.find((l) => l.length >= 3 && l.length <= 70 && /\b(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|& c\.?|soc\.? coop)/i.test(l));
  if (get('issuer')) { /* già riconosciuto per nome */ } else if (co) add('issuer', 'Emittente / fornitore', co.replace(/\s+/g, ' '), { kind: 'inferred', conf: 'medium', snippet: co });
  else if (vm && vm.i > 0 && lines[vm.i - 1] && lines[vm.i - 1].length <= 70 && /[a-zà-ù]{3}/i.test(lines[vm.i - 1])) add('issuer', 'Emittente / fornitore', lines[vm.i - 1], { kind: 'inferred', conf: 'low', snippet: lines[vm.i - 1] });

  // garanzia e dati tecnici
  const gm = lines.map((l) => ({ m: /garanzia\s+(?:legale\s+)?(?:di\s+)?(\d{1,2})\s*(anni|anno|mesi|mese)/i.exec(l), l })).find((x) => x.m);
  if (gm) {
    const months = /ann/i.test(gm.m[2]) ? +gm.m[1] * 12 : +gm.m[1];
    add('warrantyMonths', 'Durata garanzia (mesi)', months, { conf: 'medium', snippet: gm.l });
    const base = get('date');
    if (base && base.kind === 'extracted') add('warrantyEnd', 'Fine garanzia (calcolata)', addMonths(base.value, months), { kind: 'calculated', conf: 'medium', snippet: `${base.value} + ${months} mesi` });
  }
  const mm = lines.map((l) => ({ m: /(?:matricola|n\.?\s*serie|seriale|serial\s*number|s\/n)\s*[:.]?\s*([A-Z0-9][A-Z0-9\-/]{3,29})/i.exec(l), l })).find((x) => x.m);
  if (mm) add('serial', 'Matricola / n. di serie', mm.m[1], { conf: 'high', snippet: mm.l });
  const md = lines.map((l) => ({ m: /modello\s*[:.]?\s*([^\n]{2,40})/i.exec(l), l })).find((x) => x.m);
  if (md) add('model', 'Modello', md.m[1].trim(), { conf: 'medium', snippet: md.l });

  // immobile (solo se nome/indirizzo compare davvero nel testo)
  const nt = norm(src);
  for (const p of ctx.properties || []) {
    const keys = [p.name, p.address].filter((x) => x && norm(x).length >= 5);
    const hit = keys.find((k) => nt.includes(norm(k)));
    if (hit) { add('propertyId', 'Immobile', p.name, { kind: 'inferred', conf: 'medium', snippet: `compare nel testo: "${hit}"` }); break; }
  }
  return { kind: cls, fields, warnings };
}

/**
 * Unisce una nuova estrazione ai dati già presenti, senza mai sovrascrivere ciò che l'utente ha confermato/corretto/rifiutato.
 */
export function mergeFields(prev = [], next = []) {
  const keep = prev.filter((f) => f.status === 'confirmed' || f.status === 'corrected' || f.kind === 'manual');
  const byKey = new Map(keep.map((f) => [f.key, f]));
  const out = [...keep];
  for (const f of next) {
    if (byKey.has(f.key)) continue;
    const old = prev.find((p) => p.key === f.key && p.status === 'rejected');
    if (old && old.value === f.value) { out.push(old); continue; }     // rifiutato e ricomparso uguale: resta rifiutato
    out.push(f);
  }
  return out;
}

/** Campi → campi di primo livello del documento. Solo per dati confermati o corretti. */
export const TOP_LEVEL = { docKind: 'docKind', issuer: 'issuer', docNo: 'docNo', date: 'date', expires: 'expires', amount: 'amount', amountNet: 'amountNet', vatAmount: 'vatAmount' };
export function topLevelPatch(field, properties = [], categories = []) {
  if (field.key === 'categoryId') { const c = categories.find((x) => x.name === field.value); return c ? { categoryId: c.id } : {}; }
  if (field.key === 'propertyId') { const p = properties.find((x) => x.name === field.value); return p ? { propertyId: p.id } : {}; }
  const k = TOP_LEVEL[field.key]; if (!k) return {};
  return { [k]: ['amount', 'amountNet', 'vatAmount'].includes(k) ? Number(field.value) : field.value };
}

/** Stato di elaborazione risultante: 'review' se restano dati proposti, altrimenti 'done'. */
export const processingOf = (fields) => (fields.some((f) => f.status === 'proposed') ? 'review' : 'done');

/** Documenti probabilmente duplicati o collegati (stesso emittente+numero, o stesso numero e importo). Non modifica nulla. */
export function findRelated(doc, all) {
  const out = [];
  const val = (d, k) => d.fields?.find((f) => f.key === k && f.status !== 'rejected')?.value;
  const vat = val(doc, 'issuerVat'), no = doc.docNo || val(doc, 'docNo'), amt = doc.amount ?? val(doc, 'amount');
  for (const d of all) {
    if (d.id === doc.id) continue;
    const dno = d.docNo || val(d, 'docNo'), dvat = val(d, 'issuerVat'), damt = d.amount ?? val(d, 'amount');
    if (no && dno && no === dno && ((vat && dvat && vat === dvat) || (amt != null && damt != null && Number(amt) === Number(damt)))) out.push({ doc: d, reason: 'Stesso numero documento ed emittente/importo: possibile duplicato' });
    else if (doc.sha256 && d.sha256 === doc.sha256) out.push({ doc: d, reason: 'File identico' });
  }
  return out;
}
