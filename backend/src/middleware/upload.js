const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PROOF_TYPES = [...IMAGE_TYPES, 'application/pdf'];

/** Files are kept in memory briefly, checked, then saved to Cloud Storage. */
function makeUploader(allowed, maxFiles) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.uploads.maxMb * 1024 * 1024, files: maxFiles },
    fileFilter: (_req, file, cb) => {
      if (!allowed.includes(file.mimetype)) {
        return cb(ApiError.badRequest(allowed.includes('application/pdf') ? 'Please upload a photo (JPG, PNG or WEBP) or a PDF.' : 'Please upload a photo (JPG, PNG or WEBP).'));
      }
      return cb(null, true);
    },
  });
}

const roomPhotoUpload = makeUploader(IMAGE_TYPES, 6);
const proofUpload = makeUploader(PROOF_TYPES, 1);
const logoUpload = makeUploader(IMAGE_TYPES, 1);
const photoUpload = makeUploader(IMAGE_TYPES, 1);
const coverUpload = makeUploader(IMAGE_TYPES, 1);

/** Rejects files whose content doesn't match their declared type (e.g. a renamed .exe). */
function isGenuine(file) {
  const b = file.buffer;
  if (!b || b.length < 4) return false;
  switch (file.mimetype) {
    case 'image/jpeg':
      return b[0] === 0xff && b[1] === 0xd8;
    case 'image/png':
      return b.subarray(0, 4).toString('hex') === '89504e47';
    case 'image/webp':
      return b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
    case 'application/pdf':
      return b.subarray(0, 4).toString() === '%PDF';
    default:
      return false;
  }
}

function verifyFileSignature(req, _res, next) {
  const files = req.files || (req.file ? [req.file] : []);
  if (files.some((f) => !isGenuine(f))) return next(ApiError.badRequest('This file could not be read as a photo or PDF. Please choose another file.'));
  return next();
}

module.exports = { roomPhotoUpload, proofUpload, logoUpload, photoUpload, coverUpload, verifyFileSignature };
