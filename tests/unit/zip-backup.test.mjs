import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { writeZip, readZip, crc32 } from '../../js/lib/zip.js';
import { buildBackup, inspectBackup, planMerge, safeName } from '../../js/lib/backup-core.js';
import { STORES } from '../../js/data/schema.js';
import { sha256 } from '../../js/lib/hash.js';

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);
const base = (id, extra = {}) => ({ id, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...extra });
const empty = () => Object.fromEntries(STORES.map((s) => [s, []]));
async function sampleSnap() {
  const snap = empty(); const bytes = enc('contenuto pdf finto');
  snap.tasks = [base('t1', { title: 'Task', status: 'open', priority: 'normal' })];
  snap.documents = [base('d1', { name: 'Polizza/2026.pdf', hasBlob: true, exportState: 'none', sha256: await sha256(bytes), size: bytes.length, mime: 'application/pdf' })];
  snap.relationships = [base('r1', { aType: 'task', aId: 't1', bType: 'document', bId: 'd1' })];
  return { snap, bytes };
}
const blobs = (bytes) => async (id) => (id === 'd1' ? new Blob([bytes]) : null);

test('CRC32 noto', () => { assert.equal(crc32(enc('123456789')), 0xcbf43926); });

test('zip: roundtrip e lettura deflate (come creato da "Comprimi" di iOS)', async () => {
  const z = await writeZip([{ name: 'a/b.txt', data: enc('ciao àèì') }, { name: 'vuoto', data: new Uint8Array(0) }]);
  const r = await readZip(z);
  assert.equal(dec(await r.read('a/b.txt')), 'ciao àèì'); assert.equal((await r.read('vuoto')).length, 0);
  const data = enc('x'.repeat(500)), comp = deflateRawSync(data), name = enc('f.txt');
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc32(data), 14);
  lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
  ch.writeUInt32LE(crc32(data), 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
  const cdOff = 30 + name.length + comp.length, end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + name.length, 12); end.writeUInt32LE(cdOff, 16);
  const rz = await readZip(new Blob([lh, name, comp, ch, name, end]));
  assert.equal((await rz.read('f.txt')).length, 500);
});

test('zip: file malformati e nomi pericolosi rifiutati', async () => {
  await assert.rejects(readZip(new Blob([enc('non è uno zip affatto, proprio no')])), /ZIP/);
  await assert.rejects(readZip(new Blob([])), /ZIP/);
  await assert.rejects(readZip(await writeZip([{ name: '../evil', data: enc('x') }])), /non ammesso/);
  const ok = await writeZip([{ name: 'a', data: enc('abc') }]);
  const buf = new Uint8Array(await ok.arrayBuffer()); buf[31 + 1] ^= 0xff; // byte del dato (header 30 + nome 1)
  const r = await readZip(new Blob([buf]));
  await assert.rejects(r.read('a'), /CRC/);
});

test('backup: creazione, ispezione e integrità (con documenti)', async () => {
  const { snap, bytes } = await sampleSnap();
  const { blob, manifest } = await buildBackup({ snapshot: snap, getBlob: blobs(bytes), includeDocs: true });
  assert.equal(manifest.files.length, 1); assert.equal(manifest.counts.tasks, 1); assert.ok(manifest.excluded.length);
  assert.match(manifest.files[0].path, /^documents\/d1\/Polizza_2026\.pdf$/);
  const r = await inspectBackup(blob);
  assert.ok(r.ok, r.errors.join(';')); assert.equal(r.stores.tasks.length, 1); assert.ok(r.fileIds.has('d1'));
});

test('backup solo dati: valido, senza file', async () => {
  const { snap, bytes } = await sampleSnap();
  const { blob, manifest } = await buildBackup({ snapshot: snap, getBlob: blobs(bytes), includeDocs: false });
  assert.equal(manifest.files.length, 0); assert.match(manifest.excluded[0], /solo dati/);
  const r = await inspectBackup(blob); assert.ok(r.ok); assert.equal(r.fileIds.size, 0);
});

async function tamper(blob, fn) {
  const r = await readZip(blob); const out = [];
  for (const n of r.entries.keys()) out.push(await fn(n, await r.read(n)));
  return writeZip(out.filter(Boolean));
}
test('backup malformati: rilevati', async () => {
  const { snap, bytes } = await sampleSnap();
  const { blob } = await buildBackup({ snapshot: snap, getBlob: blobs(bytes), includeDocs: true });
  const man = (d, patch) => enc(JSON.stringify({ ...JSON.parse(dec(d)), ...patch }));
  const cases = {
    'data alterato': (n, d) => ({ name: n, data: n === 'data.json' ? enc(dec(d).replace('Task', 'Taxk')) : d }),
    'file alterato': (n, d) => ({ name: n, data: n.startsWith('documents/') ? enc('altro contenuto!!!!!!') : d }),
    'file mancante': (n, d) => (n.startsWith('documents/') ? null : { name: n, data: d }),
    'manifest assente': (n, d) => (n === 'manifest.json' ? null : { name: n, data: d }),
    'formato futuro': (n, d) => ({ name: n, data: n === 'manifest.json' ? man(d, { formatVersion: 99 }) : d }),
    'schema futuro': (n, d) => ({ name: n, data: n === 'manifest.json' ? man(d, { schemaVersion: 99 }) : d }),
    'formato estraneo': (n, d) => ({ name: n, data: n === 'manifest.json' ? enc('{"format":"altro"}') : d }),
    'manifest non JSON': (n, d) => ({ name: n, data: n === 'manifest.json' ? enc('{{{') : d }),
  };
  for (const [label, fn] of Object.entries(cases)) {
    const r = await inspectBackup(await tamper(blob, fn));
    assert.equal(r.ok, false, label); assert.ok(r.errors.length, label);
  }
  assert.equal((await inspectBackup(new Blob([enc('xxxx')]))).ok, false);
});

test('backup: record non validi rifiutati; script nei campi restano dati inerti', async () => {
  const { snap, bytes } = await sampleSnap();
  snap.tasks[0].due = '2026-99-99';
  const bad = await buildBackup({ snapshot: snap, getBlob: blobs(bytes), includeDocs: false });
  const r = await inspectBackup(bad.blob); assert.equal(r.ok, false); assert.match(r.errors.join(), /tasks/);
  const s2 = (await sampleSnap()).snap; s2.tasks[0].title = '<img src=x onerror=alert(1)>'; s2.tasks[0].extra = 'ignorato';
  const b2 = await buildBackup({ snapshot: s2, getBlob: blobs(bytes), includeDocs: false });
  const r2 = await inspectBackup(b2.blob);
  assert.ok(r2.ok); assert.equal(r2.stores.tasks[0].extra, undefined);
});

test('merge: aggiunte, aggiornamenti, locali più recenti, conflitti', () => {
  const local = empty(), inc = empty();
  local.tasks = [base('a', { title: 'locale', updatedAt: '2026-10-10T00:00:00.000Z' }), base('b', { title: 'vecchio' }), base('c', { title: 'uguale' }), base('d', { title: 'D', occKey: 's:2026-11-01' })];
  inc.tasks = [base('a', { title: 'backup' }), base('b', { title: 'nuovo', updatedAt: '2026-10-05T00:00:00.000Z' }), base('c', { title: 'uguale' }), base('n', { title: 'nuovo elemento' }), base('e', { title: 'dup', occKey: 's:2026-11-01' })];
  local.documents = [base('x', { name: 'x', sha256: 'aa' })]; inc.documents = [base('x', { name: 'x', sha256: 'bb', updatedAt: '2026-10-09T00:00:00.000Z' })];
  const p = planMerge(local, inc);
  assert.deepEqual(p.add.tasks, ['n']); assert.deepEqual(p.update.tasks, ['b']); assert.deepEqual(p.keepLocal.tasks, ['a']); assert.deepEqual(p.same.tasks, ['c']);
  assert.ok(p.skipped.some((s) => /duplicata/.test(s))); assert.ok(p.skipped.some((s) => /file locale diverso/.test(s))); assert.equal(p.needsConfirm, true);
  assert.equal(planMerge(local, empty()).needsConfirm, false);
});

test('safeName', () => { assert.equal(safeName('a/b\\c:d.pdf'), 'a_b_c_d.pdf'); assert.equal(safeName('..'), 'file'); assert.equal(safeName(''), 'file'); });
