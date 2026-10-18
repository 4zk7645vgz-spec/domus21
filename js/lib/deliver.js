// Consegna di un file all'utente: foglio di condivisione nativo (su iOS include "Salva su File") oppure download.
export const canShareFiles = (file) => typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

/** Ritorna 'shared' | 'cancelled' | 'downloaded'. Deve essere chiamata direttamente da un gesto dell'utente. */
export async function deliver(blob, filename) {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (canShareFiles(file)) {
    try { await navigator.share({ files: [file], title: filename }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; /* altrimenti ripiega sul download */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}
