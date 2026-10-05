const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const env = require('./config/env');
const routes = require('./routes');
const { apiLimiter } = require('./middleware/rateLimit');
const { requireAppCheck } = require('./middleware/auth');
const path = require('path');
const fs = require('fs');
const { notFound, errorHandler } = require('./middleware/error');
const { WEB_DIR } = require('./controllers/inquiry.controller');

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Allowed browser origins: CORS_ORIGINS, plus any localhost port in development
 * (e.g. the Flutter web dev server). Requests without an Origin header (mobile apps) are allowed.
 */
function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (env.corsOrigins.includes(origin)) return true;
  return !env.isProd && LOCALHOST_ORIGIN.test(origin);
}

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // The tenant app (Flutter web build), so phones on the same Wi-Fi can open it: http://<this-pc>:5000/app/
  app.get('/app', (req, res, next) => (req.path === '/app' && !req.originalUrl.startsWith('/app/') ? res.redirect('/app/') : next()));
  app.use('/app', express.static(WEB_DIR, { index: 'index.html', maxAge: '1h' }));
  app.get('/app/{*rest}', (_req, res, next) => (fs.existsSync(path.join(WEB_DIR, 'index.html')) ? res.sendFile(path.join(WEB_DIR, 'index.html')) : next()));

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

  app.use('/api/v1', apiLimiter, requireAppCheck, routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp, isAllowedOrigin };
