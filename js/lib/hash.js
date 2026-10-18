const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function sha256(data) {
  const buf = data instanceof ArrayBuffer ? data : data instanceof Uint8Array ? data : await data.arrayBuffer();
  return hex(await crypto.subtle.digest('SHA-256', buf));
}
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
