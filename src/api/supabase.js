const N8N_PROXY_URL = `${import.meta.env.VITE_N8N_BASE_URL}/webhook/admin-api`;
const PROXY_TOKEN = import.meta.env.VITE_PROXY_TOKEN;

function getAuth() {
  const jwt = sessionStorage.getItem('dw_token');
  if (jwt) return { sessionToken: jwt };
  return { token: PROXY_TOKEN };
}

export async function sbFetch(path, opts = {}) {
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  const prefer = opts.headers?.['Prefer'] || null;
  const res = await fetch(N8N_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ ...getAuth(), method, path, body, prefer })
  });
  if (!res.ok) throw new Error(res.statusText);
  const result = await res.json();
  if (result.error) {
    if (result.error === 'Unauthorized' || result.error === '請重新登入') {
      sessionStorage.removeItem('dw_token');
      sessionStorage.removeItem('dw_auth');
      window.location.reload();
      return;
    }
    throw new Error(result.error);
  }
  return result.data;
}

export async function proxyCount(path) {
  const res = await fetch(N8N_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ ...getAuth(), method: 'GET', path, count: true })
  });
  if (!res.ok) return 0;
  const result = await res.json();
  return result.count || 0;
}
