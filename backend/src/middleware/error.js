const multer = require('multer');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');

function notFound(req, _res, next) {
  // Production: a plain sentence only (the technical path is for development).
  next(ApiError.notFound(env.isProd ? 'Sorry, this could not be found.' : `Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Turns every error into a plain-language message. Technical details are logged on the
 * server only and never sent to the apps.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let message = err.expose ? err.message : null;
  let code = typeof err.code === 'string' && err.expose ? err.code : undefined;
  const details = err.expose ? err.details : undefined;

  if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? `The file is too large. Please choose one smaller than ${env.uploads.maxMb} MB.` : 'The file could not be uploaded. Please try another file.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'The information sent was not valid. Please try again.';
  } else if (err.code === 'auth/email-already-exists') {
    status = 409;
    message = 'An account with this email already exists.';
  } else if (typeof err.code === 'string' && err.code.startsWith('auth/') && !err.expose) {
    status = 400;
    message =
      {
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/invalid-password': 'The password must be at least 6 characters.',
        'auth/user-not-found': 'This account could not be found.',
      }[err.code] || 'The account could not be updated. Please check the details and try again.';
  } else if (err.code === 10 || err.code === 'ABORTED') {
    status = 409;
    message = 'Someone else changed this at the same time. Please try again.';
  }

  if (status >= 500 || !message) {
    console.error('[error]', req.method, req.originalUrl, err);
    status = status >= 400 ? status : 500;
    message = req.method === 'GET' ? 'We couldn’t load this information right now. Please try again.' : 'We couldn’t save this right now. Please try again.';
    code = undefined;
  }

  res.status(status).json({ success: false, message, ...(code ? { code } : {}), ...(details ? { details } : {}) });
}

module.exports = { notFound, errorHandler };
