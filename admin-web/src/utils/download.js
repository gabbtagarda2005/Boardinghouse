import { api } from '../api/client';

function filenameFrom(res, fallback) {
  const cd = res.headers['content-disposition'] || '';
  const m = /filename="?([^";]+)"?/i.exec(cd);
  return m ? m[1] : fallback;
}

/** Downloads a protected file (PDF/XLSX) using the authenticated API client. */
export async function downloadFile(url, fallbackName = 'download', params) {
  const res = await api.get(url, { responseType: 'blob', params });
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = filenameFrom(res, fallbackName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Fetches a protected file and returns an object URL for previewing (caller must revoke). */
export async function fetchObjectUrl(url) {
  const res = await api.get(url, { responseType: 'blob' });
  return { url: URL.createObjectURL(res.data), type: res.data.type };
}
