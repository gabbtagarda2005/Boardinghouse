/**
 * Boarding house logo: uploaded by the owner in Settings, shown in the admin web and the tenant app.
 * The image itself and the house name are public (they appear on the sign-in screens); nothing else is.
 */
const ApiError = require('../utils/ApiError');
const { getSettings, updateSettings, logoUrl, coverUrl } = require('../services/settings.service');
const { saveFile, streamFile, deleteFile, newFileName } = require('../services/storage.service');
const { audit } = require('../services/audit.service');

async function uploadLogo(req, res) {
  if (!req.file) throw ApiError.badRequest('Please choose an image for the logo (JPG, PNG or WEBP).');
  const before = await getSettings({ fresh: true });
  const path = `branding/logo-${newFileName(req.file.mimetype)}`;
  await saveFile(path, req.file.buffer, req.file.mimetype, { kind: 'logo' });
  const after = await updateSettings({ logo: { path, contentType: req.file.mimetype, updatedAt: Date.now() } });
  if (before.logo?.path) await deleteFile(before.logo.path);
  await audit({ actor: req.user, req, action: 'settings.logo', entityType: 'Setting', entityId: 'global', summary: 'Uploaded a new logo', details: {} });
  res.json({ success: true, logoUrl: logoUrl(after), message: 'Logo saved. Your tenants will see it in their app too.' });
}

async function removeLogo(req, res) {
  const before = await getSettings({ fresh: true });
  if (!before.logo?.path) return res.json({ success: true, logoUrl: null });
  await updateSettings({ logo: null });
  await deleteFile(before.logo.path);
  await audit({ actor: req.user, req, action: 'settings.logo', entityType: 'Setting', entityId: 'global', summary: 'Removed the logo', details: { removed: true } });
  res.json({ success: true, logoUrl: null, message: 'Logo removed.' });
}

/** Public: the current logo image (cache-busted by ?v=…). */
async function logoFile(_req, res) {
  const s = await getSettings();
  if (!s.logo?.path) throw ApiError.notFound('No logo has been uploaded.');
  await streamFile(s.logo.path, res, { contentType: s.logo.contentType, cache: 'public, max-age=86400' });
}

async function uploadCover(req, res) {
  if (!req.file) throw ApiError.badRequest('Please choose a photo of the boarding house (JPG, PNG or WEBP).');
  const before = await getSettings({ fresh: true });
  const path = `branding/cover-${newFileName(req.file.mimetype)}`;
  await saveFile(path, req.file.buffer, req.file.mimetype, { kind: 'cover' });
  const after = await updateSettings({ coverPhoto: { path, contentType: req.file.mimetype, updatedAt: Date.now() } });
  if (before.coverPhoto?.path) await deleteFile(before.coverPhoto.path);
  await audit({ actor: req.user, req, action: 'settings.cover', entityType: 'Setting', entityId: 'global', summary: 'Uploaded a boarding house photo', details: {} });
  res.json({ success: true, coverUrl: coverUrl(after), message: 'Photo saved. It now shows at the top of your public page.' });
}

async function removeCover(req, res) {
  const before = await getSettings({ fresh: true });
  if (!before.coverPhoto?.path) return res.json({ success: true, coverUrl: null });
  await updateSettings({ coverPhoto: null });
  await deleteFile(before.coverPhoto.path);
  await audit({ actor: req.user, req, action: 'settings.cover', entityType: 'Setting', entityId: 'global', summary: 'Removed the boarding house photo', details: { removed: true } });
  res.json({ success: true, coverUrl: null, message: 'Photo removed.' });
}

/** Public: the boarding-house cover photo. */
async function coverFile(_req, res) {
  const s = await getSettings();
  if (!s.coverPhoto?.path) throw ApiError.notFound('No photo has been uploaded.');
  await streamFile(s.coverPhoto.path, res, { contentType: s.coverPhoto.contentType, cache: 'public, max-age=86400' });
}

/** Public: what the public page shows about the house (only what the owner entered for the public). */
async function publicHouse(_req, res) {
  const s = await getSettings();
  res.json({
    success: true,
    house: { name: s.houseName, address: s.address || null, phone: s.contactPhone || null, email: s.contactEmail || null, logoUrl: logoUrl(s), coverUrl: coverUrl(s) },
    allowWaitlistInquiries: Boolean(s.allowWaitlistInquiries),
  });
}

/** Public: just the house name and logo, for the sign-in screens. */
async function publicBranding(_req, res) {
  const s = await getSettings();
  res.json({ success: true, houseName: s.houseName, logoUrl: logoUrl(s) });
}

module.exports = { uploadCover, removeCover, coverFile, publicHouse, uploadLogo, removeLogo, logoFile, publicBranding };
