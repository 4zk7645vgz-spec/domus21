// Registrazione e aggiornamento del Service Worker. Gli aggiornamenti non sono mai applicati in automatico:
// l'utente decide quando ricaricare (mai durante una modifica), e il database non viene mai toccato dagli aggiornamenti.
let reg = null, onWaiting = () => {};
export const setWaitingHandler = (fn) => { onWaiting = fn; };

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
    if (reg.waiting && navigator.serviceWorker.controller) onWaiting(reg);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) onWaiting(reg); });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; location.reload(); });
  } catch (e) { console.warn('Service Worker non registrato', e); }
}
export function applyUpdate() { reg?.waiting?.postMessage({ type: 'SKIP_WAITING' }); }
export async function checkForUpdate() {
  if (!reg) return 'Service Worker non attivo: gli aggiornamenti non sono disponibili.';
  if (!navigator.onLine) return 'Sei offline: nessun controllo possibile. L\'app continua a funzionare con la versione installata.';
  try { await reg.update(); } catch { return 'Controllo non riuscito (server non raggiungibile). Riprova più tardi: i tuoi dati non sono interessati.'; }
  if (reg.waiting) { onWaiting(reg); return 'Aggiornamento disponibile.'; }
  return 'Hai già l\'ultima versione.';
}
export async function swState() {
  if (!('serviceWorker' in navigator)) return 'non supportato';
  const r = await navigator.serviceWorker.getRegistration();
  if (!r) return 'non registrato';
  return navigator.serviceWorker.controller ? 'attivo (offline pronto)' : r.active ? 'installato (si attiva al prossimo avvio)' : 'in installazione';
}
