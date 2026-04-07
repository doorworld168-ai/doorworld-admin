// Supabase storage upload via n8n proxy — no key exposed in frontend
const N8N_UPLOAD_URL = `${import.meta.env.VITE_N8N_BASE_URL}/webhook/admin-upload`;
const PROXY_TOKEN = import.meta.env.VITE_PROXY_TOKEN;
const SB_PUBLIC_URL = import.meta.env.VITE_SUPABASE_PUBLIC_URL;

export async function uploadFile(bucket, filePath, file) {
  // Convert file to base64 and send through n8n proxy
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  const res = await fetch(N8N_UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: PROXY_TOKEN,
      bucket,
      filePath,
      fileBase64: base64,
      contentType: file.type
    })
  });
  if (!res.ok) throw new Error('上傳失敗');
  return `${SB_PUBLIC_URL}/${bucket}/${filePath}`;
}

export function getPublicUrl(bucket, filePath) {
  return `${SB_PUBLIC_URL}/${bucket}/${filePath}`;
}
