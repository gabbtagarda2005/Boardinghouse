import axios from 'axios';
import { auth, appCheckToken } from '../lib/firebase';

const baseURL = import.meta.env.VITE_API_URL || '/api/v1';
/** Origin of the backend (same origin unless VITE_API_URL is an absolute URL). */
export const apiOrigin = /^https?:\/\//.test(baseURL) ? new URL(baseURL).origin : window.location.origin;
export const fileUrl = (path) => (path?.startsWith('http') ? path : `${apiOrigin}${path}`);

export const api = axios.create({ baseURL, timeout: 30000 });

// Every request carries the Firebase ID token (refreshed automatically by Firebase).
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) config.headers.Authorization = `Bearer ${await user.getIdToken()}`;
  const ac = await appCheckToken();
  if (ac) config.headers['X-Firebase-AppCheck'] = ac;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retry && auth.currentUser) {
      original._retry = true;
      original.headers.Authorization = `Bearer ${await auth.currentUser.getIdToken(true)}`;
      return api(original);
    }
    return Promise.reject(error);
  }
);

/** A plain-language message for any error. Never shows technical details. */
export function errorMessage(err, fallback) {
  const status = err?.response?.status;
  const data = err?.response?.data;
  if (status === 404 && /^Route not found/.test(data?.message || '')) {
    return 'This feature needs the latest version of the server. Please restart the backend.';
  }
  if (data && !(data instanceof Blob) && typeof data.message === 'string' && status && status < 500) return data.message;
  if (err?.code === 'ECONNABORTED') return 'This is taking too long. Please check your internet connection and try again.';
  if (err?.message === 'Network Error') return 'We can’t reach the server right now. Please check your internet connection.';
  return fallback || (err?.config?.method === 'get' ? 'We couldn’t load this information right now. Please try again.' : 'We couldn’t save this right now. Please try again.');
}

export function fieldErrors(err) {
  const details = err?.response?.data?.details;
  return Array.isArray(details) ? Object.fromEntries(details.map((d) => [d.field, d.message])) : {};
}
