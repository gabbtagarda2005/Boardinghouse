/**
 * File storage for payment proofs, room photos, receipts and documents.
 * Two interchangeable backends (FILE_STORAGE in backend/.env):
 *   firebase — Cloud Storage for Firebase (default; needs the Blaze plan)
 *   supabase — a PRIVATE Supabase Storage bucket, reached with the server-only secret key
 * Files are never public: the apps get them through the API after an access check.
 */
const crypto = require('crypto');
const { Readable } = require('stream');
const env = require('../config/env');
const { bucket } = require('../config/firebase');
const ApiError = require('../utils/ApiError');

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

function newFileName(contentType) {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${EXT[contentType] || 'bin'}`;
}

function setHeaders(res, type, { filename, cache, inline }) {
  res.setHeader('Content-Type', type || 'application/octet-stream');
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (filename) res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${filename}"`);
}

// ---------------- Cloud Storage for Firebase ----------------
const firebaseStore = {
  async save(path, buffer, contentType, metadata) {
    await bucket()
      .file(path)
      .save(buffer, { contentType, resumable: false, metadata: { contentType, cacheControl: 'private, max-age=0', metadata } });
  },
  async stream(path, res, opts) {
    const file = bucket().file(path);
    const [exists] = await file.exists();
    if (!exists) throw ApiError.notFound('This file is no longer available.');
    const [meta] = await file.getMetadata();
    setHeaders(res, opts.contentType || meta.contentType, opts);
    await new Promise((resolve, reject) => {
      file.createReadStream().on('error', reject).on('end', resolve).pipe(res);
    });
  },
  async remove(path) {
    await bucket().file(path).delete({ ignoreNotFound: true });
  },
};

// ---------------- Supabase Storage (REST API) ----------------
const sb = env.files;
const objectUrl = (path) => `${sb.supabaseUrl}/storage/v1/object/${encodeURIComponent(sb.supabaseBucket)}/${path.split('/').map(encodeURIComponent).join('/')}`;
/** New secret keys (sb_secret_…) go in the apikey header; legacy service_role JWTs also as a Bearer token. */
function sbHeaders(extra = {}) {
  const h = { apikey: sb.supabaseKey, ...extra };
  if (sb.supabaseKey.startsWith('eyJ')) h.Authorization = `Bearer ${sb.supabaseKey}`;
  return h;
}
async function sbFail(res, what) {
  let detail = '';
  try {
    const j = await res.json();
    detail = j.message || j.error || '';
  } catch {
    /* not JSON */
  }
  console.error(`[storage] Supabase ${what} failed: HTTP ${res.status} ${detail}`);
  throw new Error(`File storage ${what} failed`);
}

const supabaseStore = {
  async save(path, buffer, contentType) {
    const res = await fetch(objectUrl(path), {
      method: 'POST',
      headers: sbHeaders({ 'Content-Type': contentType, 'x-upsert': 'true', 'cache-control': 'max-age=0' }),
      body: buffer,
    });
    if (!res.ok) await sbFail(res, 'upload');
  },
  async stream(path, res, opts) {
    const r = await fetch(objectUrl(path).replace('/storage/v1/object/', '/storage/v1/object/authenticated/'), { headers: sbHeaders() });
    if (r.status === 404 || r.status === 400) throw ApiError.notFound('This file is no longer available.');
    if (!r.ok) await sbFail(r, 'download');
    setHeaders(res, opts.contentType || r.headers.get('content-type'), opts);
    const len = r.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    await new Promise((resolve, reject) => {
      Readable.fromWeb(r.body).on('error', reject).on('end', resolve).pipe(res);
    });
  },
  async remove(path) {
    const res = await fetch(`${sb.supabaseUrl}/storage/v1/object/${encodeURIComponent(sb.supabaseBucket)}`, {
      method: 'DELETE',
      headers: sbHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: [path] }),
    });
    if (!res.ok) await sbFail(res, 'delete');
  },
};

const store = env.files.provider === 'supabase' ? supabaseStore : firebaseStore;

async function saveFile(path, buffer, contentType, metadata = {}) {
  await store.save(path, buffer, contentType, metadata);
  return { path, contentType, size: buffer.length };
}

/** Streams a stored file to the HTTP response. Callers must check access first. */
async function streamFile(path, res, { contentType, filename, cache = 'private, no-store', inline = true } = {}) {
  await store.stream(path, res, { contentType, filename, cache, inline });
}

async function deleteFile(path) {
  if (!path) return;
  await store.remove(path).catch(() => {});
}

/** Startup check: confirms the storage is reachable (used by server.js). */
async function checkStorage() {
  if (env.files.provider !== 'supabase') return 'Cloud Storage for Firebase';
  const res = await fetch(`${sb.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(sb.supabaseBucket)}`, { headers: sbHeaders() });
  if (!res.ok) await sbFail(res, `check of bucket "${sb.supabaseBucket}"`);
  const b = await res.json();
  if (b.public) console.warn(`[storage] WARNING: Supabase bucket "${sb.supabaseBucket}" is PUBLIC. Make it private in the Supabase dashboard.`);
  return `Supabase Storage (bucket "${sb.supabaseBucket}"${b.public ? ', PUBLIC!' : ', private'})`;
}

module.exports = { saveFile, streamFile, deleteFile, newFileName, checkStorage };
