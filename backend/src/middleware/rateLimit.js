const { rateLimit } = require('express-rate-limit');
const env = require('../config/env');

/**
 * Protects the API from abuse. Generous enough that an owner clicking around (and several
 * tenants behind the same Wi-Fi) never hit it; much higher during development.
 * Sign-in itself is handled and rate-limited by Firebase Authentication.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isProd ? 3000 : 20000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { success: false, message: 'You’re doing that very quickly. Please wait a minute and try again.' },
});

module.exports = { apiLimiter };
