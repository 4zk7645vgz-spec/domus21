// Modello dati: definizione dichiarativa di entità, validazione/sanificazione (usata sia dai moduli sia dall'importazione dei backup).
import { isDate } from '../lib/dates.js';

export const ENTITY_TYPES = ['task', 'practice', 'document', 'property', 'maintenance', 'utility', 'contract', 'contact'];
export const STORE_OF = { task: 'tasks', practice: 'practices', document: 'documents', property: 'properties', maintenance: 'maintenance', utility: 'utilities', contract: 'contracts', contact: 'contacts' };
export const TYPE_OF = Object.fromEntries(Object.entries(STORE_OF).map(([t, s]) => [s, t]));
export const TYPE_LABEL = { task: 'Attività', practice: 'Pratica', document: 'Documento', property: 'Immobile', maintenance: 'Manutenzione', utility: 'Utenza', contract: 'Contratto', contact: 'Contatto' };
export const STORES = ['tasks', 'practices', 'checklist', 'documents', 'properties', 'maintenance', 'utilities', 'contracts', 'payments', 'contacts', 'categories', 'tags', 'relationships', 'audit'];

const F = (k, type, label, o = {}) => ({ k, type, label, ...o });
const opts = (...a) => a.map((x) => (Array.isArray(x) ? x : [x, x[0].toUpperCase() + x.slice(1)]));

export const PRIORITIES = opts(['low', 'Bassa'], ['normal', 'Normale'], ['high', 'Alta']);
export const FREQ_BILL = opts(['none', 'Una tantum / nessuna'], ['monthly', 'Mensile'], ['bimonthly', 'Bimestrale'], ['quarterly', 'Trimestrale'], ['semiannual', 'Semestrale'], ['yearly', 'Annuale']);
export const BILL_MONTHS = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12 };
export const PRACTICE_STATUS = opts(['open', 'Aperta'], ['waiting', 'In attesa'], ['closed', 'Conclusa'], ['archived', 'Archiviata']);
export const DOC_KINDS = opts(['nd', 'Non classificato'], ['fattura', 'Fattura'], ['ricevuta', 'Ricevuta / scontrino'], ['preventivo', 'Preventivo'], ['contratto', 'Contratto'], ['polizza', 'Polizza assicurativa'], ['bolletta', 'Bolletta / utenza'], ['garanzia', 'Garanzia'], ['manuale', 'Manuale'], ['certificato', 'Certificato / dichiarazione'], ['altro', 'Altro']);
export const PROCESSING = opts(['pending', 'In attesa'], ['processing', 'In elaborazione'], ['review', 'Da verificare'], ['done', 'Elaborato'], ['error', 'Errore']);
export const PAY_STATES = opts(['unknown', 'Non verificato'], ['unpaid', 'Da pagare'], ['paid', 'Pagato']);
export const FIELD_STATUS = ['proposed', 'confirmed', 'corrected', 'rejected'];
export const EXPORT_STATES = ['none', 'shared', 'verified', 'mismatch'];

export const SCHEMA = {
  tasks: [
    F('title', 'str', 'Titolo', { req: true }),
    F('description', 'text', 'Descrizione'),
    F('categoryId', 'id', 'Categoria', { ref: 'categories' }),
    F('priority', 'enum', 'Priorità', { values: PRIORITIES, def: 'normal' }),
    F('status', 'enum', 'Stato', { values: opts(['open', 'Aperta'], ['done', 'Completata']), def: 'open', hidden: true }),
    F('due', 'date', 'Scadenza'),
    F('recurrence', 'rec', 'Ricorrenza'),
    F('seriesId', 'id', 'Serie', { hidden: true }),
    F('occKey', 'str', 'Chiave occorrenza', { hidden: true }),
    F('completedAt', 'iso', 'Completata il', { hidden: true }),
    F('skipped', 'num', 'Occorrenze saltate', { hidden: true }),
    F('cost', 'num', 'Costo (€)'),
    F('propertyId', 'id', 'Immobile', { ref: 'properties' }),
    F('tagIds', 'ids', 'Tag', { hidden: true }),
    F('notes', 'text', 'Note'),
  ],
  practices: [
    F('title', 'str', 'Titolo', { req: true }),
    F('kind', 'enum', 'Tipologia', { req: true, def: 'altro', values: opts(['fiscale', 'Fiscale / tributi'], ['catastale', 'Catastale / urbanistica'], ['edilizia', 'Edilizia / lavori'], ['condominio', 'Condominio'], ['assicurazione', 'Assicurazione'], ['utenze', 'Utenze / contratti'], ['veicoli', 'Veicoli'], ['altro', 'Altro']) }),
    F('entity', 'str', 'Ente o soggetto'),
    F('openedAt', 'date', 'Data di apertura', { req: true }),
    F('status', 'enum', 'Stato', { values: PRACTICE_STATUS, def: 'open', req: true }),
    F('concludedAt', 'date', 'Data di conclusione'),
    F('categoryId', 'id', 'Categoria', { ref: 'categories' }),
    F('propertyId', 'id', 'Immobile', { ref: 'properties' }),
    F('references', 'text', 'Riferimenti (protocolli, numeri pratica)'),
    F('notes', 'text', 'Note'),
    F('history', 'hist', 'Cronologia', { hidden: true }),
  ],
  checklist: [
    F('practiceId', 'id', 'Pratica', { req: true, hidden: true }),
    F('text', 'str', 'Voce', { req: true }),
    F('kind', 'enum', 'Tipo', { values: opts(['step', 'Adempimento'], ['document', 'Documento richiesto']), def: 'step' }),
    F('done', 'bool', 'Completata / ricevuta'),
    F('due', 'date', 'Scadenza intermedia'),
    F('order', 'num', 'Ordine', { hidden: true }),
  ],
  documents: [
    F('name', 'str', 'Nome', { req: true }),
    F('categoryId', 'id', 'Categoria', { ref: 'categories' }),
    F('date', 'date', 'Data del documento'),
    F('expires', 'date', 'Scadenza'),
    F('tagIds', 'ids', 'Tag', { hidden: true }),
    F('size', 'num', 'Dimensione', { hidden: true }),
    F('mime', 'str', 'Tipo', { hidden: true }),
    F('sha256', 'str', 'SHA-256', { hidden: true }),
    F('hasBlob', 'bool', 'File nella PWA', { hidden: true }),
    F('exportState', 'enum', 'Stato esportazione', { values: EXPORT_STATES.map((x) => [x, x]), def: 'none', hidden: true }),
    F('exportedAt', 'iso', 'Esportato il', { hidden: true }),
    F('verifiedAt', 'iso', 'Verificato il', { hidden: true }),
    F('externalName', 'str', 'Nome file in File', { hidden: true }),
    F('dirName', 'str', 'Cartella collegata', { hidden: true }),
    F('notes', 'text', 'Note'),
    // --- Domus 21: dati documentali (compilati solo da estrazione CONFERMATA o inserimento manuale) ---
    F('docKind', 'enum', 'Tipologia documento', { values: DOC_KINDS, def: 'nd' }),
    F('issuer', 'str', 'Emittente / fornitore'),
    F('docNo', 'str', 'Numero documento'),
    F('amount', 'num', 'Importo totale (€)'),
    F('amountNet', 'num', 'Imponibile (€)'),
    F('vatAmount', 'num', 'IVA (€)'),
    F('payState', 'enum', 'Pagamento', { values: PAY_STATES, def: 'unknown' }),
    F('propertyId', 'id', 'Immobile', { ref: 'properties' }),
    F('processing', 'enum', 'Elaborazione', { values: PROCESSING, def: 'pending', hidden: true }),
    F('procError', 'str', 'Errore di elaborazione', { hidden: true }),
    F('extractedAt', 'iso', 'Elaborato il', { hidden: true }),
    F('textSource', 'str', 'Origine del testo', { hidden: true }),
    F('text', 'text', 'Testo estratto', { hidden: true }),
    F('fields', 'fields', 'Dati estratti', { hidden: true }),
    F('history', 'hist', 'Storico modifiche', { hidden: true }),
  ],
  properties: [
    F('name', 'str', 'Nome', { req: true }),
    F('kind', 'enum', 'Tipologia', { values: opts(['abitazione', 'Abitazione'], ['seconda', 'Seconda casa'], ['locazione', 'In locazione'], ['box', 'Box / cantina'], ['altro', 'Altro']), def: 'abitazione' }),
    F('address', 'str', 'Indirizzo'),
    F('rooms', 'text', 'Ambienti (uno per riga)'),
    F('notes', 'text', 'Note (dati catastali, riferimenti)'),
  ],
  maintenance: [
    F('title', 'str', 'Titolo', { req: true }),
    F('kind', 'enum', 'Tipo', { values: opts(['programmata', 'Manutenzione programmata'], ['intervento', 'Intervento'], ['garanzia', 'Garanzia / manuale']), def: 'programmata', req: true }),
    F('propertyId', 'id', 'Immobile', { ref: 'properties' }),
    F('room', 'str', 'Ambiente'),
    F('contactId', 'id', 'Fornitore / tecnico', { ref: 'contacts' }),
    F('lastDone', 'date', 'Ultima esecuzione'),
    F('intervalMonths', 'num', 'Ripetere ogni (mesi)'),
    F('nextDue', 'date', 'Prossima scadenza'),
    F('warrantyEnd', 'date', 'Fine garanzia'),
    F('cost', 'num', 'Costo (€)'),
    F('notes', 'text', 'Note'),
    F('history', 'hist', 'Storico', { hidden: true }),
  ],
  utilities: [
    F('name', 'str', 'Servizio', { req: true }),
    F('serviceType', 'enum', 'Tipo di servizio', { values: opts(['luce', 'Luce'], ['gas', 'Gas'], ['acqua', 'Acqua'], ['internet', 'Internet'], ['telefono', 'Telefono'], ['rifiuti', 'Rifiuti'], ['condominio', 'Condominio'], ['altro', 'Altro']), def: 'altro' }),
    F('provider', 'str', 'Fornitore'),
    F('reference', 'str', 'Riferimento contratto (mai password)'),
    F('propertyId', 'id', 'Immobile', { ref: 'properties' }),
    F('startDate', 'date', 'Inizio contratto'),
    F('billingFrequency', 'enum', 'Frequenza fatturazione', { values: FREQ_BILL, def: 'monthly' }),
    F('nextDue', 'date', 'Prossima scadenza pagamento'),
    F('amount', 'num', 'Importo tipico (€)'),
    F('active', 'bool', 'Attiva', { def: true }),
    F('notes', 'text', 'Note'),
  ],
  contracts: [
    F('title', 'str', 'Titolo', { req: true }),
    F('counterparty', 'str', 'Controparte / fornitore'),
    F('kind', 'enum', 'Tipologia', { values: opts(['assicurazione', 'Assicurazione'], ['locazione', 'Locazione'], ['manutenzione', 'Manutenzione'], ['abbonamento', 'Abbonamento'], ['finanziamento', 'Finanziamento'], ['altro', 'Altro']), def: 'altro' }),
    F('propertyId', 'id', 'Immobile', { ref: 'properties' }),
    F('startDate', 'date', 'Inizio'),
    F('endDate', 'date', 'Scadenza / rinnovo'),
    F('autoRenew', 'bool', 'Rinnovo automatico'),
    F('noticeDays', 'num', 'Preavviso disdetta (giorni)'),
    F('billingFrequency', 'enum', 'Frequenza pagamento', { values: FREQ_BILL, def: 'yearly' }),
    F('nextDue', 'date', 'Prossimo pagamento'),
    F('amount', 'num', 'Importo (€)'),
    F('active', 'bool', 'Attivo', { def: true }),
    F('notes', 'text', 'Note'),
  ],
  payments: [
    F('parentType', 'enum', 'Tipo', { values: [['utility', 'utility'], ['contract', 'contract']], req: true }),
    F('parentId', 'id', 'Genitore', { req: true }),
    F('forDue', 'date', 'Scadenza saldata'),
    F('paidAt', 'date', 'Pagato il', { req: true }),
    F('amount', 'num', 'Importo (€)'),
    F('notes', 'str', 'Note'),
  ],
  contacts: [
    F('name', 'str', 'Nome', { req: true }),
    F('role', 'enum', 'Tipo', { values: opts(['tecnico', 'Tecnico'], ['artigiano', 'Artigiano'], ['fornitore', 'Fornitore'], ['ente', 'Ente / ufficio'], ['professionista', 'Professionista'], ['altro', 'Altro']), def: 'altro' }),
    F('company', 'str', 'Azienda / ente'),
    F('phone', 'str', 'Telefono'),
    F('email', 'str', 'Email'),
    F('address', 'str', 'Indirizzo'),
    F('notes', 'text', 'Note'),
  ],
  categories: [F('name', 'str', 'Nome', { req: true })],
  tags: [F('name', 'str', 'Nome', { req: true })],
  relationships: [
    F('aType', 'enum', 'A', { values: ENTITY_TYPES.map((x) => [x, x]), req: true }), F('aId', 'id', 'A id', { req: true }),
    F('bType', 'enum', 'B', { values: ENTITY_TYPES.map((x) => [x, x]), req: true }), F('bId', 'id', 'B id', { req: true }),
  ],
  audit: [F('at', 'iso', 'Quando', { req: true }), F('type', 'str', 'Tipo', { req: true }), F('summary', 'text', 'Descrizione')],
};

export const DEFAULT_CATEGORIES = ['Casa', 'Fisco e tributi', 'Utenze', 'Assicurazioni', 'Contratti', 'Garanzie e manuali', 'Condominio', 'Veicoli', 'Salute', 'Identità e certificati'];

const LIM = { str: 300, text: 8000, id: 80, hist: 500, ids: 100 };
const isIso = (s) => typeof s === 'string' && s.length <= 40 && !Number.isNaN(Date.parse(s));
const isStr = (s) => typeof s === 'string';

/** Normalizza un valore secondo il tipo. Ritorna [valore, errore]. */
function coerce(f, v) {
  switch (f.type) {
    case 'str': if (!isStr(v)) return [, 'deve essere testo']; v = v.trim(); return v.length > LIM.str ? [, `massimo ${LIM.str} caratteri`] : [v];
    case 'text': if (!isStr(v)) return [, 'deve essere testo']; return v.length > LIM.text ? [, `massimo ${LIM.text} caratteri`] : [v.trim()];
    case 'id': return isStr(v) && v.length <= LIM.id && v ? [v] : [, 'riferimento non valido'];
    case 'ids': return Array.isArray(v) && v.length <= LIM.ids && v.every((x) => isStr(x) && x.length <= LIM.id) ? [[...new Set(v)]] : [, 'elenco non valido'];
    case 'date': return isDate(v) ? [v] : [, 'data non valida (AAAA-MM-GG)'];
    case 'iso': return isIso(v) ? [v] : [, 'data/ora non valida'];
    case 'num': { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v; return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 1e12 ? [n] : [, 'numero non valido (≥ 0)']; }
    case 'bool': return typeof v === 'boolean' ? [v] : [, 'valore sì/no non valido'];
    case 'enum': return f.values.some(([x]) => x === v) ? [v] : [, 'valore non ammesso'];
    case 'rec': {
      if (typeof v !== 'object' || !v || !['daily', 'weekly', 'monthly', 'yearly'].includes(v.freq)) return [, 'ricorrenza non valida'];
      const interval = Number(v.interval ?? 1);
      if (!Number.isInteger(interval) || interval < 1 || interval > 366) return [, 'intervallo non valido'];
      const out = { freq: v.freq, interval };
      if (v.anchorDay != null) { if (!Number.isInteger(v.anchorDay) || v.anchorDay < 1 || v.anchorDay > 31) return [, 'giorno non valido']; out.anchorDay = v.anchorDay; }
      if (v.until != null && v.until !== '') { if (!isDate(v.until)) return [, 'data fine ricorrenza non valida']; out.until = v.until; }
      return [out];
    }
    case 'fields': {
      if (!Array.isArray(v) || v.length > 80) return [, 'dati estratti non validi'];
      const out = [];
      for (const e of v) {
        if (typeof e !== 'object' || !e || !isStr(e.key) || e.key.length > 40 || !isStr(e.label) || e.label.length > 80 || !isStr(e.value) || e.value.length > 300) return [, 'dato estratto non valido'];
        if (!FIELD_STATUS.includes(e.status) || !['extracted', 'calculated', 'inferred', 'manual'].includes(e.kind) || !['high', 'medium', 'low'].includes(e.conf)) return [, 'dato estratto non valido'];
        out.push({ key: e.key, label: e.label, value: e.value, status: e.status, kind: e.kind, conf: e.conf, snippet: isStr(e.snippet) ? e.snippet.slice(0, 200) : '', ...(isStr(e.original) && e.original ? { original: e.original.slice(0, 300) } : {}) });
      }
      return [out];
    }
    case 'hist': {
      if (!Array.isArray(v) || v.length > LIM.hist) return [, 'cronologia non valida'];
      const out = [];
      for (const e of v) {
        if (typeof e !== 'object' || !e || !isIso(e.at) || !isStr(e.text) || e.text.length > 500) return [, 'voce di cronologia non valida'];
        const o = { at: e.at, text: e.text }; if (e.cost != null && Number.isFinite(e.cost)) o.cost = e.cost; out.push(o);
      }
      return [out];
    }
  }
  return [, 'tipo sconosciuto'];
}

const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && false);

/**
 * Sanifica un record per `store`. Campi non previsti vengono scartati (nessun codice/campo arbitrario passa).
 * `meta`: richiede id/createdAt/updatedAt validi (importazione) .
 */
export function sanitize(store, input, { meta = false } = {}) {
  const fields = SCHEMA[store];
  if (!fields) return { errors: [`archivio sconosciuto: ${store}`] };
  if (typeof input !== 'object' || !input || Array.isArray(input)) return { errors: ['record non valido'] };
  const out = {}, errors = [];
  for (const f of fields) {
    let v = input[f.k];
    if (empty(v)) {
      if (f.req) errors.push({ k: f.k, label: f.label, msg: 'obbligatorio' });
      else if (f.type === 'bool') out[f.k] = f.def ?? false;
      else if (f.def !== undefined && f.type === 'enum') out[f.k] = f.def;
      else if (f.type === 'ids') out[f.k] = [];
      else if (f.type === 'hist') out[f.k] = [];
      continue;
    }
    const [val, err] = coerce(f, v);
    if (err) errors.push({ k: f.k, label: f.label, msg: err }); else out[f.k] = val;
  }
  if (meta) {
    if (!isStr(input.id) || !input.id || input.id.length > LIM.id) errors.push({ k: 'id', label: 'id', msg: 'identificativo non valido' });
    if (!isIso(input.createdAt)) errors.push({ k: 'createdAt', label: 'createdAt', msg: 'non valido' });
    if (!isIso(input.updatedAt)) errors.push({ k: 'updatedAt', label: 'updatedAt', msg: 'non valido' });
    out.id = input.id; out.createdAt = input.createdAt; out.updatedAt = input.updatedAt;
  }
  // regole incrociate
  if (store === 'tasks' && out.recurrence && !out.due) errors.push({ k: 'due', label: 'Scadenza', msg: 'obbligatoria per le attività ricorrenti' });
  if (store === 'contracts' && out.startDate && out.endDate && out.endDate < out.startDate) errors.push({ k: 'endDate', label: 'Scadenza', msg: 'precedente alla data di inizio' });
  if (store === 'practices' && out.concludedAt && out.concludedAt < out.openedAt) errors.push({ k: 'concludedAt', label: 'Data di conclusione', msg: 'precedente alla data di apertura' });
  if (store === 'practices' && out.status === 'closed' && !out.concludedAt) { /* impostata dal repository */ }
  return { value: out, errors };
}
export const errText = (errors) => errors.map((e) => (typeof e === 'string' ? e : `${e.label}: ${e.msg}`)).join('; ');
