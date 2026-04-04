// Supabase storage upload via n8n proxy — no key exposed in frontend
const N8N_UPLOAD_URL = "https://17310a3-1.zeabur.app/webhook/admin-upload";
const PROXY_TOKEN = "dw-admin-2025-proxy";
const SB_PUBLIC_URL = "https://zklwnhxrqxspmjovohvt.supabase.co/storage/v1/object/public";

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
