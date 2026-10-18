// Livello A (accesso diretto a una cartella): attivo SOLO se il browser espone showDirectoryPicker.
// Su Safari iOS l'API non è disponibile: questo modulo resta inerte e l'app usa il Livello B (condivisione + verifica).
import * as repo from './repo.js';
import { sha256 } from '../lib/hash.js';

export const supported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
const KEY = 'dirHandle';

export async function connect() {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'domus' });
  await repo.setMeta(KEY, handle);
  return handle.name;
}
export async function disconnect() { await repo.setMeta(KEY, null); }
export async function status() {
  const h = await repo.getMeta(KEY);
  if (!h) return null;
  let perm = 'prompt';
  try { perm = await h.queryPermission({ mode: 'readwrite' }); } catch { perm = 'denied'; }
  return { name: h.name, permission: perm };
}
/** Salva un documento nella cartella collegata e lo rilegge per verificarne l'hash. Richiede un gesto utente. */
export async function saveDoc(doc) {
  const handle = await repo.getMeta(KEY);
  if (!handle) throw new Error('Nessuna cartella collegata.');
  let perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') throw new Error('Permesso sulla cartella negato o scaduto: ricollega la cartella.');
  const blob = await repo.getDocumentBlob(doc.id);
  if (!blob) throw new Error('File assente nella PWA.');
  const fh = await handle.getFileHandle(doc.name.replace(/[\\/]/g, '_'), { create: true });
  const w = await fh.createWritable(); await w.write(blob); await w.close();
  const back = await fh.getFile();
  const ok = (await sha256(back)) === doc.sha256;
  await repo.update('documents', doc.id, ok ? { exportState: 'verified', verifiedAt: new Date().toISOString(), externalName: back.name, dirName: handle.name } : { exportState: 'mismatch', externalName: back.name });
  if (!ok) throw new Error('Verifica fallita: il file scritto non coincide con l\'originale.');
  return `Salvato e verificato in "${handle.name}".`;
}
