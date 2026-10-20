import { addDays, cmp, diffDays } from './dates.js';

const byDue = (a, b) => cmp(a.due || '9999', b.due || '9999') || (a.priority === 'high' ? -1 : 0);
/** Calcola le sezioni della dashboard dai dati reali. Funzione pura: (snapshot, oggi) → sezioni. */
export function computeDashboard(snap, today) {
  const in14 = addDays(today, 14), in30 = addDays(today, 30), in60 = addDays(today, 60);
  const open = (snap.tasks || []).filter((t) => t.status === 'open');
  const dated = open.filter((t) => t.due);
  const payments = [];
  for (const u of snap.utilities || []) if (u.active !== false && u.nextDue && cmp(u.nextDue, in30) <= 0) payments.push({ type: 'utility', id: u.id, title: u.name, sub: u.provider, due: u.nextDue, amount: u.amount });
  for (const c of snap.contracts || []) if (c.active !== false) {
    if (c.nextDue && cmp(c.nextDue, in30) <= 0) payments.push({ type: 'contract', id: c.id, title: c.title, sub: c.counterparty, due: c.nextDue, amount: c.amount });
    if (c.endDate && cmp(c.endDate, in60) <= 0) payments.push({ type: 'contract', id: c.id, title: `${c.autoRenew ? 'Rinnovo' : 'Scadenza'}: ${c.title}`, sub: c.counterparty, due: c.endDate, renewal: true });
  }
  const maint = (snap.maintenance || []).filter((m) => m.nextDue && cmp(m.nextDue, in30) <= 0).map((m) => ({ id: m.id, title: m.title, due: m.nextDue }));
  const docsExpiring = (snap.documents || []).filter((d) => d.expires && cmp(d.expires, in60) <= 0).map((d) => ({ id: d.id, title: d.name, due: d.expires }));
  const practices = (snap.practices || []).filter((p) => p.status === 'open' || p.status === 'waiting');
  const withDue = (list) => list.map((x) => ({ ...x, days: diffDays(x.due, today) })).sort((a, b) => cmp(a.due, b.due));
  return {
    today: dated.filter((t) => t.due === today).sort(byDue),
    overdue: dated.filter((t) => cmp(t.due, today) < 0).sort(byDue),
    upcoming: dated.filter((t) => cmp(t.due, today) > 0 && cmp(t.due, in14) <= 0).sort(byDue),
    undated: open.filter((t) => !t.due).length,
    practices: practices.sort((a, b) => cmp(b.updatedAt, a.updatedAt)),
    payments: withDue(payments),
    maintenance: withDue(maint),
    docsExpiring: withDue(docsExpiring),
    review: (snap.documents || []).filter((d) => d.processing === 'review'),
    toPay: (snap.documents || []).filter((d) => d.payState === 'unpaid'),
    recentDocs: [...(snap.documents || [])].sort((a, b) => cmp(b.createdAt, a.createdAt)).slice(0, 5),
    counts: { tasks: open.length, practices: practices.length, documents: (snap.documents || []).length },
    isEmpty: !['tasks', 'practices', 'documents', 'properties', 'maintenance', 'utilities', 'contracts', 'contacts'].some((s) => (snap[s] || []).length),
  };
}
