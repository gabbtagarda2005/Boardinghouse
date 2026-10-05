/** Firebase client (public web config only; no server secrets ever live here). */
import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider, getToken } from 'firebase/app-check';

const env = import.meta.env;

export const firebaseApp = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(firebaseApp);
// Stay signed in after closing the browser (session persistence).
setPersistence(auth, browserLocalPersistence).catch(() => {});

if (env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, `http://${window.location.hostname}:9099`, { disableWarnings: true });
}

let appCheck = null;
if (env.VITE_FIREBASE_APPCHECK_SITE_KEY) {
  appCheck = initializeAppCheck(firebaseApp, { provider: new ReCaptchaV3Provider(env.VITE_FIREBASE_APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
}

/** App Check token for API calls (null when App Check is not configured). */
export async function appCheckToken() {
  if (!appCheck) return null;
  try {
    return (await getToken(appCheck)).token;
  } catch {
    return null;
  }
}
