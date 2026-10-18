import * as repo from './repo.js';
import * as db from './db.js';
import { DomusError } from './db.js';
import { buildBackup, inspectBackup, planMerge } from '../lib/backup-core.js';
import { sha256 } from '../lib/hash.js';
import { STORES } from './schema.js';

export const backupFileName = (includeDocs, d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `domus-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${includeDocs ? '' : '-solo-dati'}.zip`;
};

export async function createBackup(includeDocs) {
  const snapshot = await repo.snapshot();
  return buildBackup({ snapshot, getBlob: repo.getDocumentBlob, includeDocs });
}
/** Da chiamare solo dopo conferma dell'utente di aver salvato il file. */
export async function recordBackup(manifest, filename) {
  await repo.setMeta('lastBackup', { at: new Date().toISOString(), includesDocuments: manifest.includesDocuments, name: filename, counts: manifest.counts, verified: false });
  await repo.audit('backup', `Backup ${manifest.includesDocuments ? 'completo' : 'solo dati'}: ${filename}`);
}
export const inspect = inspectBackup;

export async function previewRestore(inspected) {
  const local = await repo.snapshot();
  const have = new Map();
  for (const id of await repo.blobIds()) have.set(id, true);
  const plan = planMerge(local, inspected.stores, { localDocSha: have, fileIds: inspected.fileIds });
  return { plan, local, have };
}

export async function applyRestore(inspected, plan, have) {
  const report = { added: 0, updated: 0, keptLocal: plan.totals.keepLocal, same: plan.totals.same, skipped: plan.skipped.slice(), blobsWritten: 0, blobsFailed: [], problems: [], verified: false };
  const apply = new Map(); // store → Set(ids)
  for (const k of ['add', 'update']) for (const [s, ids] of Object.entries(plan[k])) { const set = apply.get(s) || new Set(); ids.forEach((i) => set.add(i)); apply.set(s, set); }
  const blobTodo = new Set(plan.fillBlobs);
  for (const id of apply.get('documents') || []) if (inspected.fileIds.has(id)) blobTodo.add(id);

  // 1) tutti i record in un'unica transazione atomica (tutto o niente)
  await db.run(STORES, 'readwrite', async (t) => {
    for (const [s, ids] of apply) {
      for (const rec of inspected.stores[s]) {
        if (!ids.has(rec.id)) continue;
        const out = { ...rec };
        if (s === 'documents') out.hasBlob = have.get(rec.id) ? true : false; // verrà portato a true dopo la scrittura del file
        await t.put(s, out);
      }
    }
  });
  for (const k of ['add', 'update']) report[k === 'add' ? 'added' : 'updated'] = plan.totals[k];

  // 2) file dei documenti, uno per transazione, con verifica dell'hash
  const docById = new Map(inspected.stores.documents.map((d) => [d.id, d]));
  const fentry = new Map((inspected.manifest.files || []).map((f) => [f.id, f]));
  for (const id of blobTodo) {
    const f = fentry.get(id); const doc = docById.get(id);
    try {
      const bytes = await inspected.zip.read(f.path);
      if ((await sha256(bytes)) !== f.sha256) throw new DomusError('HASH', 'hash non coincide');
      await db.run(['blobs', 'documents'], 'readwrite', async (t) => {
        await t.put('blobs', { buf: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), type: doc.mime || 'application/octet-stream', name: doc.name }, id);
        const d = await t.get('documents', id); if (d) { d.hasBlob = true; await t.put('documents', d); }
      });
      report.blobsWritten++;
    } catch (e) { report.blobsFailed.push(`${doc?.name || id}: ${e.message}`); if (e.code === 'QUOTA') break; }
  }

  // 3) verifica a posteriori
  const after = await repo.snapshot();
  const blobIds = new Set(await repo.blobIds());
  for (const [s, ids] of apply) {
    const m = new Map(after[s].map((r) => [r.id, r]));
    for (const id of ids) {
      const want = inspected.stores[s].find((r) => r.id === id);
      const got = m.get(id);
      if (!got) report.problems.push(`${s}: record non ripristinato (${id.slice(0, 8)}…)`);
      else if (got.updatedAt !== want.updatedAt) report.problems.push(`${s}: versione inattesa (${id.slice(0, 8)}…)`);
    }
  }
  for (const id of blobTodo) {
    if (report.blobsFailed.some((x) => x.startsWith(docById.get(id)?.name || id))) continue;
    const b = await repo.getDocumentBlob(id);
    if (!b || (await sha256(b)) !== fentry.get(id).sha256) report.problems.push(`File non verificato: ${docById.get(id)?.name}`);
  }
  for (const d of after.documents) if (d.hasBlob && !blobIds.has(d.id)) report.problems.push(`Documento senza file: ${d.name}`);
  report.verified = report.problems.length === 0 && report.blobsFailed.length === 0;
  await repo.audit('restore', `Ripristino: +${report.added} aggiornati ${report.updated}, file ${report.blobsWritten}${report.verified ? ', verificato' : ', CON PROBLEMI'}`);
  return report;
}
