import { h } from './h.js';
import { buildForm, openSheet } from './kit.js';

/** Piccolo modulo ad hoc: risolve con i valori letti (stringhe) oppure null. `check(values)` può restituire [{k,msg}]. */
export function promptForm({ title, fields, values = {}, submitLabel = 'Conferma', check }) {
  return new Promise((resolve) => {
    let res = null;
    const form = buildForm(fields, values);
    const ok = h('button', { class: 'btn primary', type: 'button' }, submitLabel);
    const s = openSheet({ title, body: form.el, footer: [h('button', { class: 'btn', type: 'button', onclick: () => s.close() }, 'Annulla'), ok], onClose: () => resolve(res) });
    const go = () => {
      const v = form.read();
      const errs = [];
      for (const f of fields) {
        if (f.req && v[f.k] === undefined) errs.push({ k: f.k, msg: 'obbligatorio' });
        if (f.type === 'num' && v[f.k] !== undefined) { const n = Number(String(v[f.k]).replace(',', '.')); if (!Number.isFinite(n) || n < 0) errs.push({ k: f.k, msg: 'numero non valido' }); else v[f.k] = n; }
      }
      errs.push(...(check?.(v) || []));
      if (errs.length) { form.showErrors(errs); return; }
      res = v; s.close();
    };
    ok.addEventListener('click', go);
    form.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); go(); } });
  });
}
