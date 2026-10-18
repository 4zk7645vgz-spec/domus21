// Single source of truth for the database structure and the entity catalogue.

export const APP_VERSION = '1.0.0';
export const DB_NAME = 'domus';
export const SCHEMA_VERSION = 1; // bump together with a new entry in migrations.js

// name -> { indexes: [[indexName, keyPath]] }
export const STORES = {
  tasks: { indexes: [['due', 'due'], ['status', 'status'], ['recurrenceId', 'recurrenceId']] },
  recurrences: { indexes: [] },
  documents: { indexes: [['category', 'categoryId'], ['expires', 'expires']] },
  blobs: { indexes: [] },
  properties: { indexes: [] },
  maintenances: { indexes: [['next', 'nextDue'], ['propertyId', 'propertyId']] },
  utilities: { indexes: [['propertyId', 'propertyId']] },
  contracts: { indexes: [['end', 'endDate']] },
  payments: { indexes: [['contractId', 'contractId'], ['date', 'date']] },
  practices: { indexes: [['status', 'status']] },
  checklist: { indexes: [['practiceId', 'practiceId']] },
  contacts: { indexes: [] },
  categories: { indexes: [] },
  tags: { indexes: [] },
  relationships: { indexes: [['from', 'fromKey'], ['to', 'toKey']] },
  audit: { indexes: [['at', 'at']] },
  meta: { indexes: [] },
};

export const STORE_NAMES = Object.keys(STORES);
// Stores that are part of a backup (blobs are optional, audit and meta are not restored).
export const DATA_STORES = STORE_NAMES.filter((s) => !['blobs', 'audit', 'meta'].includes(s));

// Entities that can be linked through relationships.
export const LINKABLE = {
  task: 'tasks',
  document: 'documents',
  practice: 'practices',
  property: 'properties',
  maintenance: 'maintenances',
  utility: 'utilities',
  contract: 'contracts',
  contact: 'contacts',
};

export const ENTITY_LABEL = {
  task: 'Attività',
  document: 'Documento',
  practice: 'Pratica',
  property: 'Immobile',
  maintenance: 'Manutenzione',
  utility: 'Utenza',
  contract: 'Contratto',
  contact: 'Contatto',
  payment: 'Pagamento',
};

export const DEFAULT_CATEGORIES = [
  { id: 'cat-casa', name: 'Casa', kind: 'general' },
  { id: 'cat-fisco', name: 'Fisco e tasse', kind: 'general' },
  { id: 'cat-utenze', name: 'Utenze', kind: 'general' },
  { id: 'cat-assicurazioni', name: 'Assicurazioni', kind: 'general' },
  { id: 'cat-salute', name: 'Salute', kind: 'general' },
  { id: 'cat-veicoli', name: 'Veicoli', kind: 'general' },
  { id: 'cat-famiglia', name: 'Famiglia', kind: 'general' },
  { id: 'cat-altro', name: 'Altro', kind: 'general' },
];

export const DOC_CATEGORIES = [
  'Contratti', 'Bollette e fatture', 'Garanzie', 'Manuali', 'Certificati', 'Fisco', 'Assicurazioni', 'Corrispondenza', 'Altro',
];

/**
 * Where the bytes of a document live. This is deliberately explicit: a document
 * stored only inside the PWA must never be presented as "saved in Files".
 */
export const FILE_STATES = {
  'pwa-only': { label: 'Solo nella memoria dell’app', warn: true, location: 'Memoria interna di Domus (non nell’app File)' },
  'exported': { label: 'Copia esportata in File', warn: false, location: 'Memoria di Domus + copia esportata da te in File' },
  'external-only': { label: 'Solo in File (riferimento)', warn: true, location: 'Fuori da Domus: solo il riferimento è registrato' },
  'missing': { label: 'File mancante', warn: true, location: 'Non disponibile' },
  'modified': { label: 'Esportato, poi modificato', warn: true, location: 'La copia in File non corrisponde più al documento in Domus' },
};
