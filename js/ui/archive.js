import { h, icon, fmtBytes, clear } from './h.js';
import * as repo from '../data/repo.js';
import { row, card, empty, kv, chips, nav, dueText, hrefOf, ICON_OF } from './common.js';
import { editEntity, confirmDialog, openSheet, toast, showError } from './kit.js';
import { linksPanel, pickAndImport } from './links.js';
import { deliver } from '../lib/deliver.js';
import { writeZip } from '../lib/zip.js';
import { formatIT, todayStr, addDays, cmp } from '../lib/dates.js';
import { norm } from '../lib/search.js';
import * as dirs from '../data/dirs.js';

/** Stato e posizione effettiva del file: non dichiara mai "salvato in File" senza evidenza. */
export function docStatus(d) {
  if (!d.hasBlob) return { key: 'missing', label: 'File assente', cls: 'danger', where: 'Solo metadati: il contenuto non è nella memoria della PWA (ripristinare da backup o reimportare il file).' };
  const when = (x) => (x ? formatIT(x.slice(0, 10)) : '');
  switch (d.exportState) {
    case 'verified': return { key: 'verified', label: 'Copia in File verificata', cls: 'ok', where: `Memoria interna di Domus + copia verificata${d.dirName ? ` nella cartella "${d.dirName}"` : ''}${d.externalName ? ` (${d.externalName})` : ''} il ${when(d.verifiedAt)}.` };
    case 'shared': return { key: 'shared', label: 'Condiviso, da verificare', cls: 'accent', where: `Memoria interna di Domus. Inviato al foglio di condivisione il ${when(d.exportedAt)}: Domus non può sapere dove è stato salvato. Usa "Verifica copia in File".` };
    case 'mismatch': return { key: 'mismatch', label: 'Copia diversa', cls: 'danger', where: 'La copia scelta in File NON coincide con il documento in Domus (modificata o diversa).' };
    default: return { key: 'internal', label: 'Solo nella PWA', cls: 'warn', where: 'Solo nella memoria interna di Domus. Non è stato esportato nell\'app File.' };
  }
}

let q = '', filter = 'all';
export async function listView(_p, ctx) {
  const snap = await repo.snapshot(); const today = todayStr(); const soon = addDays(today, 60);
  const cats = new Map(snap.categories.map((c) => [c.id, c.name]));
  let docs = snap.documents.filter((d) => {
    const s = docStatus(d).key;
    if (filter === 'internal' && s !== 'internal') return false;
    if (filter === 'exported' && !['shared', 'verified'].includes(s)) return false;
    if (filter === 'issues' && !['missing', 'mismatch'].includes(s)) return false;
    if (filter === 'expiring' && !(d.expires && cmp(d.expires, soon) <= 0)) return false;
    return true;
  }).sort((a, b) => cmp(b.createdAt, a.createdAt));
  const internal = snap.documents.filter((d) => docStatus(d).key === 'internal').length;
  const listBox = h('div');
  const input = h('input', { class: 'search-in', type: 'search', placeholder: 'Cerca nei documenti', value: q, 'aria-label': 'Cerca nei documenti', oninput: (e) => { q = e.target.value; clear(listBox); listBox.append(render()); } });
  const render = () => {
    const shown = docs.filter((d) => !q || norm(`${d.name} ${cats.get(d.categoryId) || ''} ${d.notes || ''}`).includes(norm(q)));
    return shown.length ? card(shown.map((d) => { const st = docStatus(d); return row({ title: d.name, sub: [cats.get(d.categoryId), d.date ? formatIT(d.date) : '', fmtBytes(d.size)].filter(Boolean).join(' · '), badge: h('span', { class: `badge ${st.cls}` }, st.label), meta: d.expires ? `Scade ${dueText(d.expires, today)}` : '', metaClass: d.expires && d.expires < today ? 'due-over' : '', href: `#/archive/${d.id}` }); }))
      : empty('archive', snap.documents.length ? 'Nessun risultato' : 'Archivio vuoto', snap.documents.length ? 'Modifica la ricerca o il filtro.' : 'Importa i documenti (PDF, foto, scansioni) e collegali a pratiche, contratti o immobili.', snap.documents.length ? null : h('button', { class: 'btn primary', type: 'button', onclick: () => pickAndImport({ onDone: ctx.refresh }) }, 'Importa documento'));
  };
  listBox.append(render());
  const body = h('div', null,
    internal ? h('div', { class: 'banner info', role: 'note' }, icon('info', 20), h('div', null, h('b', null, `${internal} document${internal === 1 ? 'o è' : 'i sono'} solo nella memoria interna`), h('p', null, 'Non risultano in File. Esportali in una cartella "Domus" per averne una copia fuori dall\'app.'), h('button', { class: 'btn', type: 'button', onclick: () => exportAll(ctx, true) }, 'Esporta in File'))) : null,
    input, chips([['all', 'Tutti'], ['internal', 'Solo PWA'], ['exported', 'Esportati'], ['issues', 'Problemi'], ['expiring', 'In scadenza']], filter, (k) => { filter = k; ctx.refresh(); }), listBox);
  return { title: 'Archivio', body, fab: { label: 'Importa documento', onclick: () => pickAndImport({ onDone: ctx.refresh }) }, actions: [h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Esporta tutti i documenti in un archivio ZIP', onclick: () => exportAll(ctx, false) }, icon('share'))] };
}

/** Esporta i documenti (solo quelli con file) in un unico ZIP da salvare in File. */
async function exportAll(ctx, onlyInternal) {
  try {
    const snap = await repo.snapshot();
    const cats = new Map(snap.categories.map((c) => [c.id, c.name]));
    const docs = snap.documents.filter((d) => d.hasBlob && (!onlyInternal || docStatus(d).key === 'internal'));
    if (!docs.length) return toast('Nessun documento da esportare.');
    const entries = []; const used = new Set();
    for (const d of docs) {
      const blob = await repo.getDocumentBlob(d.id); if (!blob) continue;
      const clean = (s) => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 100) || 'file';
      let name = `${clean(cats.get(d.categoryId) || 'Documenti')}/${clean(d.name)}`;
      if (used.has(name)) name = `${clean(cats.get(d.categoryId) || 'Documenti')}/${d.id.slice(0, 6)}-${clean(d.name)}`;
      used.add(name); entries.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    const zip = await writeZip(entries);
    const fname = `Domus-documenti-${todayStr()}.zip`;
    const s = openSheet({ title: 'Archivio documenti pronto', body: h('p', null, `${entries.length} documenti in un archivio ZIP (${fmtBytes(zip.size)}). Scegli "Salva in File" e la cartella Domus.`),
      footer: [h('button', { class: 'btn', type: 'button', onclick: () => s.close() }, 'Chiudi'), h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        const r = await deliver(zip, fname);
        if (r === 'cancelled') return;
        for (const d of docs) if (d.exportState === 'none') await repo.markShared(d.id);
        s.close(); toast('Esportazione inviata. Per verificare una copia, apri il documento → "Verifica copia in File".', 'ok', 6000); ctx.refresh();
      } }, icon('share', 18), 'Salva in File')] });
  } catch (e) { showError(e); }
}

function preview(d, blob) {
  const url = URL.createObjectURL(blob);
  if (blob.type.startsWith('image/')) {
    const s = openSheet({ title: d.name, body: h('img', { src: url, alt: d.name, class: 'preview-img' }), onClose: () => URL.revokeObjectURL(url), tall: true });
  } else {
    const w = window.open(url, '_blank', 'noopener'); if (!w) toast('Apertura bloccata: usa "Salva in File" e aprilo da lì.');
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
}

export async function detailView([id], ctx) {
  const d = await repo.get('documents', id);
  if (!d) return { title: 'Documento', back: '#/archive', body: empty('alert', 'Documento non trovato', 'Potrebbe essere stato eliminato.') };
  const [snap, rels] = await Promise.all([repo.snapshot(), repo.linksOf('document', id)]);
  const st = docStatus(d); const today = todayStr();
  const cat = snap.categories.find((c) => c.id === d.categoryId)?.name;
  const tags = (d.tagIds || []).map((i) => snap.tags.find((t) => t.id === i)?.name).filter(Boolean).join(', ');
  const linkedDir = dirs.supported() ? await dirs.status() : null;

  const save = h('button', { class: 'btn primary', type: 'button', disabled: !d.hasBlob, onclick: async () => {
    const blob = await repo.getDocumentBlob(id); if (!blob) return showError(new Error('File assente nella PWA.'));
    const r = await deliver(blob, d.name);
    if (r === 'cancelled') return;
    await repo.markShared(id); toast(r === 'shared' ? 'Inviato. Scegli "Salva su File" → cartella Domus, poi usa "Verifica copia".' : 'File scaricato. Verifica la copia quando l\'hai spostata.', 'ok', 6000); ctx.refresh();
  } }, icon('share', 18), 'Salva in File / Condividi');
  const verify = h('button', { class: 'btn', type: 'button', disabled: !d.hasBlob, onclick: () => {
    const input = h('input', { type: 'file', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' }); document.body.append(input);
    input.addEventListener('change', async () => { const f = input.files[0]; input.remove(); if (!f) return; try { const r = await repo.verifyDocumentFile(id, f); toast(r.ok ? 'Verificato: la copia in File è identica all\'originale.' : 'Attenzione: il file scelto è diverso dall\'originale.', r.ok ? 'ok' : 'error', 6000); ctx.refresh(); } catch (e) { showError(e); } });
    input.addEventListener('cancel', () => input.remove()); input.click();
  } }, icon('check', 18), 'Verifica copia in File');
  const body = h('div', null,
    h('div', { class: `banner ${st.key === 'internal' ? '' : st.key === 'missing' || st.key === 'mismatch' ? 'danger' : 'info'}`, role: 'note' }, icon(st.key === 'verified' ? 'check' : 'info', 20), h('div', null, h('b', null, st.label), h('p', null, st.where))),
    h('div', { class: 'card pad' }, kv([['Categoria', cat], ['Data', d.date ? formatIT(d.date) : ''], ['Scadenza', d.expires ? `${formatIT(d.expires)} · ${dueText(d.expires, today)}` : ''], ['Dimensione', fmtBytes(d.size)], ['Tipo', d.mime], ['Tag', tags], ['SHA-256', d.sha256 ? d.sha256.slice(0, 16) + '…' : ''], ['Note', d.notes]])),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', disabled: !d.hasBlob, onclick: async () => { const b = await repo.getDocumentBlob(id); if (b) preview(d, b); } }, icon('doc', 18), 'Apri'), save, verify),
    linkedDir ? h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => dirs.saveDoc(d).then((r) => { toast(r, 'ok'); ctx.refresh(); }).catch(showError) }, icon('archive', 18), `Salva nella cartella collegata${linkedDir.name ? ` (${linkedDir.name})` : ''}`)) : null,
    h('h2', { class: 'sec' }, h('span', null, 'Collegato a')),
    rels.length ? card(rels.map((l) => h('li', { class: 'with-act' }, h('a', { class: 'row', href: hrefOf(l.type, l.id) }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, l.rec.title || l.rec.name), h('span', { class: 'row-sub' }, l.type)))))) : h('p', { class: 'muted small' }, 'Non collegato a nessun elemento. Collegalo da pratiche, attività, immobili, utenze o contratti.'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: async () => { if (await editEntity({ store: 'documents', title: 'Modifica documento', record: d, withTags: true })) ctx.refresh(); } }, icon('edit', 18), 'Modifica dati'),
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
        const ok = await confirmDialog({ title: 'Eliminare il documento?', message: `"${d.name}" verrà eliminato da Domus${rels.length ? `, anche dai ${rels.length} elementi a cui è collegato (che non vengono eliminati)` : ''}.\nLe copie già salvate in File NON vengono toccate.`, confirmLabel: 'Elimina documento', danger: true });
        if (ok) { await repo.remove('document', id); toast('Documento eliminato'); nav('/archive'); }
      } }, icon('trash', 18), 'Elimina')));
  return { title: d.name, small: true, back: '#/archive', body };
}
