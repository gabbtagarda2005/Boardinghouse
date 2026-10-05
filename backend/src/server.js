const http = require('http');
const { Server } = require('socket.io');
const env = require('./config/env');
require('./config/firebase');
const { createApp, isAllowedOrigin } = require('./app');
const { resolveUser } = require('./middleware/auth');
const { setIO } = require('./services/notification.service');
const { startScheduler } = require('./services/scheduler.service');
const { getSettings } = require('./services/settings.service');
const { checkStorage } = require('./services/storage.service');

async function start() {
  const fb = env.firebase;
  console.log(fb.useEmulators ? `[server] using the local Firebase Emulator Suite (project ${fb.projectId})` : `[server] using Firebase project ${fb.projectId}`);
  try {
    await getSettings({ fresh: true }); // checks the Firestore connection
  } catch (err) {
    throw new Error(
      fb.useEmulators
        ? 'Cannot reach the Firebase emulators. Start them first with "npm run emulators" in the project folder.'
        : `Cannot reach Firestore (${err.message}). Check FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT in backend/.env.`
    );
  }

  try {
    console.log(`[server] files are stored in ${await checkStorage()}`);
  } catch (err) {
    throw new Error(`Cannot reach file storage (${err.message}). Check FILE_STORAGE, SUPABASE_URL, SUPABASE_SERVICE_KEY and SUPABASE_BUCKET in backend/.env.`);
  }

  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: (o, cb) => cb(null, isAllowedOrigin(o)) }, path: '/socket.io' });
  // Live updates for the admin app; sockets sign in with the same Firebase ID token.
  io.use(async (socket, next) => {
    try {
      const user = await resolveUser(socket.handshake.auth?.token);
      socket.data.user = { id: user.uid, role: user.role };
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });
  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.user.id}`);
    socket.join(`role:${socket.data.user.role}`);
  });
  setIO(io);
  startScheduler();

  server.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE' ? `[server] Port ${env.port} is already in use. Close the other backend window and try again.` : err);
    process.exit(1);
  });
  // 0.0.0.0: reachable from outside the machine (Render, phones on the same Wi-Fi). Render sets PORT.
  server.listen(env.port, '0.0.0.0', () => console.log(`[server] Boarding House API ready on port ${env.port} (/api/v1, health check /api/health)`));

  const shutdown = () => {
    io.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error(`[server] Could not start: ${err.message}`);
  process.exit(1);
});
