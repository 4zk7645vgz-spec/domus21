import { h, icon } from './h.js';
import * as repo from '../data/repo.js';
import { STORE_OF, TYPE_LABEL } from '../data/schema.js';
import { hrefOf, ICON_OF } from './common.js';
import { pickFrom, confirmDialog, toast, showError, editEntity } from './kit.js';
import { formatIT } from '../lib/dates.js';

export const titleOf = (r) => r.title || r.name || '(senza titolo)';
export const subOf = (type, r) => ({ task: r.status === 'done' ? 'Completata' : r.due ? `Scadenza ${formatIT(r.due)}` : 'Senza scadenza', document: r.date ? formatIT(r.date) : '', practice: r.entity || '', contact: r.company || '', property: r.address || '', maintenance: r.nextDue ? `Prossima ${formatIT(r.nextDue)}` : '', utility: r.provider || '', contract: r.counterparty || '' }[type] || '');

/** Importa uno o più file scelti dall'utente (dentro un gesto utente). */
export function pickAndImport({ links = [], onDone } = {}) {
  const input = h('input', { type: 'file', multiple: true, class: 'sr-only', 'aria-hidden': 'true', tabindex: '-1' });
  document.body.append(input);
  input.addEventListener('change', async () => {
    const files = [...input.files]; input.remove();
    let n = 0;
    for (const f of files) {
      try { await repo.importDocument(f, { links }); n++; }
      catch (e) {
        if (e.code === 'DUPLICATE') {
          const again = await confirmDialog({ title: 'File già presente', message: `${e.message}\nImportarlo comunque come nuovo documento?`, confirmLabel: 'Importa comunque' });
          if (again) { try { await repo.importDocument(f, { links, allowDuplicate: true }); n++; } catch (e2) { showError(e2); } }
          else if (links.length) { for (const l of links) await repo.link(l.type, l.id, 'document', e.existing.id).catch(() => {}); n++; toast('Documento esistente collegato.', 'ok'); }
        } else showError(e);
      }
    }
    if (n) toast(`${n} documento/i salvato/i nella memoria interna di Domus (non ancora esportato in File).`, 'ok', 5000);
    onDone?.();
  });
  input.addEventListener('cancel', () => input.remove());
  input.click();
}

/** Pannello "Collegati": mostra, collega e scollega. Scollegare non elimina mai l'elemento collegato. */
export async function linksPanel(type, id, ctx, kinds = ['document']) {
  const links = await repo.linksOf(type, id);
  const box = h('div');
  for (const kind of kinds) {
    const mine = links.filter((l) => l.type === kind);
    const ul = h('ul', { class: 'list' }, mine.map((l) => h('li', { class: 'with-act' },
      h('a', { class: 'row', href: hrefOf(l.type, l.id) }, h('span', { class: 'row-lead' }, icon(ICON_OF[l.type], 20)), h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, titleOf(l.rec)), h('span', { class: 'row-sub' }, subOf(l.type, l.rec)))),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Scollega ${titleOf(l.rec)} (non elimina l'elemento)`, onclick: async () => { await repo.unlink(l.relId); toast('Collegamento rimosso. L\'elemento non è stato eliminato.'); ctx.refresh(); } }, icon('close', 18)))));
    const add = h('button', { class: 'btn', type: 'button', onclick: async () => {
      const snap = await repo.snapshot();
      const taken = new Set(mine.map((m) => m.id));
      const items = snap[STORE_OF[kind]].filter((r) => !taken.has(r.id) && r.id !== id).map((r) => ({ id: r.id, title: titleOf(r), sub: subOf(kind, r) }));
      const pick = await pickFrom({ title: `Collega ${TYPE_LABEL[kind].toLowerCase()}`, items, empty: `Nessun elemento di tipo "${TYPE_LABEL[kind]}" da collegare.` });
      if (pick) { try { await repo.link(type, id, kind, pick.id); ctx.refresh(); } catch (e) { showError(e); } }
    } }, icon('link', 18), `Collega ${TYPE_LABEL[kind].toLowerCase()} esistente`);
    const extra = [];
    if (kind === 'document') extra.push(h('button', { class: 'btn', type: 'button', onclick: () => pickAndImport({ links: [{ type, id }], onDone: ctx.refresh }) }, icon('plus', 18), 'Aggiungi file'));
    if (kind === 'task') extra.push(h('button', { class: 'btn', type: 'button', onclick: async () => {
      const t = await editEntity({ store: 'tasks', title: 'Nuova attività collegata', defaults: type === 'property' ? { propertyId: id } : {} });
      if (t) { await repo.link(type, id, 'task', t.id); ctx.refresh(); }
    } }, icon('plus', 18), 'Nuova attività'));
    box.append(h('h2', { class: 'sec' }, h('span', null, kind === 'document' ? 'Documenti collegati' : `${TYPE_LABEL[kind]} collegate`)),
      mine.length ? h('div', { class: 'card' }, ul) : h('p', { class: 'muted small' }, 'Nessun elemento collegato.'), h('div', { class: 'btn-row' }, extra, add));
  }
  return box;
}
