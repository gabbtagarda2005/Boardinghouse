import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // On Netlify the API lives on Render: the build must know its full address.
  if (process.env.NETLIFY && mode === 'production' && !/^https:\/\//.test(env.VITE_API_URL || '')) {
    throw new Error('Set VITE_API_URL on Netlify to the Render API address, e.g. https://mcley-boardinghouse-api.onrender.com/api/v1');
  }
  if (process.env.NETLIFY && mode === 'production') {
    const missing = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'].filter((k) => !env[k]);
    if (missing.length) throw new Error(`Set these on Netlify (Site settings → Environment variables): ${missing.join(', ')}`);
    if (env.VITE_USE_FIREBASE_EMULATORS === 'true') throw new Error('VITE_USE_FIREBASE_EMULATORS must be false on Netlify.');
  }
  const target = env.VITE_PROXY_TARGET || 'http://localhost:5000';
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // Same-origin proxy to the backend in development (API + real-time updates).
      proxy: {
        '/api': { target, changeOrigin: true },
        '/socket.io': { target, ws: true, changeOrigin: true },
      },
    },
    test: { environment: 'node' },
  };
});
