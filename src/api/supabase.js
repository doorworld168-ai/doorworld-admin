const N8N_PROXY_URL = `${import.meta.env.VITE_N8N_BASE_URL}/webhook/admin-api`;
const PROXY_TOKEN = import.meta.env.VITE_PROXY_TOKEN;

export async function sbFetch(path, opts = {}) {
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  const prefer = opts.headers?.['Prefer'] || null;
  const res = await fetch(N8N_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ token: PROXY_TOKEN, method, path, body, prefer })
  });
  if (!res.ok) throw new Error(res.statusText);
  const result = await res.json();
  if (result.error) throw new Error(result.error);
  return result.data;
}

export async function proxyCount(path) {
  const res = await fetch(N8N_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ token: PROXY_TOKEN, method: 'GET', path, count: true })
  });
  if (!res.ok) return 0;
  const result = await res.json();
  return result.count || 0;
}
