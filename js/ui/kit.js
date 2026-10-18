import { h, icon } from './h.js';
import * as repo from '../data/repo.js';
import { sanitize, SCHEMA } from '../data/schema.js';
import { FREQS } from '../lib/recurrence.js';

// ---------- toast ----------
let toastHost;
export function toast(msg, kind = 'info', ms = 3800) {
  toastHost ||= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const t = h('div', { class: `toast ${kind}` }, msg);
  toastHost.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? Math.max(ms, 7000) : ms);
}
export function showError(e) {
  console.error(e);
  const msg = e && e.message ? e.message : String(e);
  toast(msg, 'error');
  try { const log = JSON.parse(sessionStorage.getItem('domus-errors') || '[]'); log.push({ at: new Date().toISOString(), msg: msg.slice(0, 300) }); sessionStorage.setItem('domus-errors', JSON.stringify(log.slice(-20))); } catch { /* storage non disponibile */ }
}

// ---------- sheet (finestra modale dal basso) ----------
const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let sheetSeq = 0;
export function openSheet({ title, body, footer, onClose, tall = false }) {
  const prevFocus = document.activeElement;
  const root = document.getElementById('app');
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Chiudi', onclick: () => close() }, icon('close'));
  const titleEl = h('h2', { id: `sheet-t-${++sheetSeq}`, class: 'sheet-title' }, title);
  const sheet = h('div', { class: `sheet${tall ? ' tall' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleEl.id },
    h('div', { class: 'sheet-head' }, titleEl, closeBtn), h('div', { class: 'sheet-body' }, body), footer ? h('div', { class: 'sheet-foot' }, footer) : null);
  const back = h('div', { class: 'backdrop', onclick: (e) => { if (e.target === back) close(); } }, sheet);
  let closed = false;
  function close(result) {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', onKey, true);
    back.remove();
    if (!document.querySelector('.backdrop')) root.removeAttribute('inert');
    if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch { /* elemento rimosso */ }
    onClose?.(result);
  }
  function onKey(e) {
    if (back !== [...document.querySelectorAll('.backdrop')].at(-1)) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...sheet.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey, true);
  document.body.append(back); root.setAttribute('inert', '');
  const first = sheet.querySelector('input,select,textarea') || closeBtn;
  requestAnimationFrame(() => first.focus({ preventScroll: true }));
  return { close, el: sheet };
}
export function confirmDialog({ title, message, confirmLabel = 'Conferma', danger = false, cancelLabel = 'Annulla' }) {
  return new Promise((resolve) => {
    let ans = false;
    const ok = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: () => { ans = true; s.close(); } }, confirmLabel);
    const s = openSheet({ title, body: h('p', { class: 'pre' }, message), footer: [h('button', { class: 'btn', type: 'button', onclick: () => s.close() }, cancelLabel), ok], onClose: () => resolve(ans) });
  });
}

// ---------- form generico da schema ----------
let fid = 0;
export function buildForm(fields, values = {}, refs = {}, { withTags = false, tagNames = [] } = {}) {
  const inputs = new Map(), errEls = new Map();
  const wrap = (f, input, extra) => {
    const err = h('div', { class: 'field-err', id: `${input.id}-e`, role: 'alert' });
    errEls.set(f.k, err);
    input.setAttribute('aria-describedby', err.id);
    return h('div', { class: 'field' }, h('label', { for: input.id }, f.label, f.req ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null), input, extra, err);
  };
  const els = [];
  for (const f of fields) {
    if (f.hidden) continue;
    const v = values[f.k]; const iid = `f${++fid}-${f.k}`; let input;
    if (f.type === 'rec') {
      const r = v || {};
      const freq = h('select', { id: iid }, h('option', { value: '' }, 'Non ricorrente'), FREQS.map(([val, l]) => h('option', { value: val, selected: r.freq === val }, l)));
      const interval = h('input', { type: 'number', min: 1, max: 366, inputmode: 'numeric', value: r.interval || 1, 'aria-label': 'Ripeti ogni (numero di periodi)' });
      const until = h('input', { type: 'date', value: r.until || '', 'aria-label': 'Termina il (opzionale)' });
      const sub = h('div', { class: 'rec-sub', hidden: !r.freq }, h('label', null, 'Ogni ', interval, ' periodo/i'), h('label', null, 'Fino al ', until));
      freq.addEventListener('change', () => { sub.hidden = !freq.value; });
      freq.rec = { interval, until };
      inputs.set(f.k, freq);
      els.push(wrap(f, freq, sub)); continue;
    }
    if (f.type === 'text') input = h('textarea', { id: iid, rows: 3, value: v ?? '' });
    else if (f.type === 'enum') input = h('select', { id: iid }, f.values.map(([val, l]) => h('option', { value: val, selected: (v ?? f.def) === val }, l)));
    else if (f.type === 'id' && f.ref) input = h('select', { id: iid }, h('option', { value: '' }, '— nessuno —'), (refs[f.ref] || []).map((o) => h('option', { value: o.id, selected: v === o.id }, o.name || o.title)));
    else if (f.type === 'bool') {
      input = h('input', { id: iid, type: 'checkbox', checked: v ?? f.def ?? false });
      inputs.set(f.k, input);
      const err = h('div', { class: 'field-err', id: `${iid}-e`, role: 'alert' }); errEls.set(f.k, err);
      els.push(h('div', { class: 'field check' }, input, h('label', { for: iid }, f.label), err)); continue;
    } else if (f.type === 'date') input = h('input', { id: iid, type: 'date', value: v || '' });
    else if (f.type === 'num') input = h('input', { id: iid, type: 'text', inputmode: 'decimal', value: v ?? '', autocomplete: 'off' });
    else input = h('input', { id: iid, type: f.k === 'email' ? 'email' : f.k === 'phone' ? 'tel' : 'text', value: v ?? '', maxlength: 300, autocomplete: 'off' });
    inputs.set(f.k, input); els.push(wrap(f, input));
  }
  let tagsInput;
  if (withTags) { tagsInput = h('input', { id: `f${++fid}-tags`, type: 'text', value: tagNames.join(', '), placeholder: 'es. garanzia, 2026' }); els.push(h('div', { class: 'field' }, h('label', { for: tagsInput.id }, 'Tag (separati da virgola)'), tagsInput)); }
  const el = h('form', { class: 'form', novalidate: true, onsubmit: (e) => e.preventDefault() }, els);
  return {
    el,
    read() {
      const out = {};
      for (const f of fields) {
        const i = inputs.get(f.k); if (!i) continue;
        if (f.type === 'bool') out[f.k] = i.checked;
        else if (f.type === 'rec') out[f.k] = i.value ? { freq: i.value, interval: Number(i.rec.interval.value) || 1, ...(i.rec.until.value ? { until: i.rec.until.value } : {}) } : undefined;
        else out[f.k] = i.value === '' ? undefined : i.value;
      }
      return out;
    },
    tagNames: () => (tagsInput ? tagsInput.value.split(',').map((s) => s.trim()).filter(Boolean) : null),
    showErrors(errors) {
      for (const [, e] of errEls) e.textContent = '';
      let first;
      for (const er of errors) { const e = errEls.get(er.k); if (e) { e.textContent = er.msg; first ||= inputs.get(er.k); } }
      first?.focus();
    },
  };
}

export async function loadRefs() {
  const s = await repo.snapshot();
  return { categories: [...s.categories].sort((a, b) => a.name.localeCompare(b.name, 'it')), properties: s.properties, contacts: s.contacts, _snap: s };
}

/** Finestra di creazione/modifica di un'entità. Risolve con il record salvato (o null se annullata). */
export function editEntity({ store, title, record, defaults = {}, withTags = false, afterSave, extraTop }) {
  return new Promise((resolve) => {
    (async () => {
      const refs = await loadRefs();
      const flds = SCHEMA[store];
      const vals = { ...defaults, ...(record || {}) };
      const tagNames = withTags ? (vals.tagIds || []).map((i) => refs._snap.tags.find((t) => t.id === i)?.name).filter(Boolean) : [];
      const form = buildForm(flds, vals, refs, { withTags, tagNames });
      let saved = null;
      const save = h('button', { class: 'btn primary', type: 'button' }, 'Salva');
      const s = openSheet({ title, body: [extraTop, form.el], footer: [h('button', { class: 'btn', type: 'button', onclick: () => s.close() }, 'Annulla'), save], tall: true, onClose: () => resolve(saved) });
      const submit = async () => {
        save.disabled = true;
        try {
          const data = { ...form.read() };
          if (withTags) data.tagIds = await repo.tagIdsFor(form.tagNames());
          const pre = sanitize(store, { ...(record || {}), ...data });
          if (pre.errors.length) { form.showErrors(pre.errors); return; }
          saved = record ? await repo.update(store, record.id, data) : await repo.create(store, data);
          await afterSave?.(saved);
          s.close(saved);
        } catch (e) {
          if (e.code === 'VALIDATION' && e.errors) form.showErrors(e.errors); else showError(e);
        } finally { save.disabled = false; }
      };
      save.addEventListener('click', submit);
      form.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit(); } });
    })().catch((e) => { showError(e); resolve(null); });
  });
}

export function pickFrom({ title, items, empty = 'Nessun elemento disponibile.' }) {
  return new Promise((resolve) => {
    let res = null;
    const list = h('ul', { class: 'list' }, items.map((it) => h('li', null, h('button', { class: 'row', type: 'button', onclick: () => { res = it; s.close(); } }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, it.title), it.sub ? h('span', { class: 'row-sub' }, it.sub) : null)))));
    const s = openSheet({ title, body: items.length ? list : h('p', { class: 'muted' }, empty), onClose: () => resolve(res) });
  });
}
