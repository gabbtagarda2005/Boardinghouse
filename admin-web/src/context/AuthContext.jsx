import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { GoogleAuthProvider, onIdTokenChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { api } from '../api/client';

const AuthContext = createContext(null);

const TENANT_MSG = 'This account is for tenants. Please use the Boarding House tenant app.';
const NOT_OWNER_MSG = 'This Google account doesn’t have owner access. Sign in with an approved owner account.';
/** Who may use the owner portal: role claim ADMIN (set by the backend for approved owner accounts). */
const refusal = (claims) => (claims.role === 'ADMIN' ? '' : claims.role === 'TENANT' ? TENANT_MSG : NOT_OWNER_MSG);

/** Friendly messages for Firebase sign-in errors. */
export function authErrorMessage(err) {
  const code = err?.code || '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)) return 'The email or password is incorrect.';
  if (code === 'auth/user-disabled') return 'This account has been turned off. Please contact the boarding house owner.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait a few minutes and try again.';
  if (code === 'auth/network-request-failed') return 'We can’t connect right now. Please check your internet connection.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.';
  if (code === 'auth/operation-not-allowed') return 'Google sign-in isn’t turned on yet.';
  if (code === 'auth/unauthorized-domain') return 'Google sign-in isn’t allowed from this web address yet.';
  if (code === 'auth/account-exists-with-different-credential') return 'This email already has an account. Sign in with its password instead.';
  return err?.message && !code ? err.message : 'We couldn’t sign you in. Please try again.';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');

  // Firebase keeps the session (and refreshes tokens) for us.
  useEffect(
    () =>
      onIdTokenChanged(auth, async (fbUser) => {
        if (!fbUser) {
          setUser(null);
          setReady(true);
          return;
        }
        const token = await fbUser.getIdTokenResult();
        const refused = refusal(token.claims);
        if (refused) {
          setNotice(refused);
          await signOut(auth);
          return;
        }
        try {
          const res = await api.get('/auth/me');
          setUser(res.data.user);
        } catch {
          setUser({ uid: fbUser.uid, name: fbUser.displayName || fbUser.email, email: fbUser.email, role: 'ADMIN' });
        }
        setReady(true);
      }),
    []
  );

  const login = useCallback(async (email, password) => {
    setNotice('');
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const token = await cred.user.getIdTokenResult();
    if (refusal(token.claims)) {
      await signOut(auth);
      throw new Error(refusal(token.claims));
    }
    api.get('/auth/me', { params: { login: 1 } }).catch(() => {});
  }, []);

  /** "Sign in with Google": only Google accounts that match an approved owner account get in. */
  const loginWithGoogle = useCallback(async () => {
    setNotice('');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    const token = await cred.user.getIdTokenResult();
    if (refusal(token.claims)) {
      await signOut(auth);
      throw new Error(refusal(token.claims));
    }
    api.get('/auth/me', { params: { login: 1 } }).catch(() => {});
  }, []);

  const logout = useCallback(() => signOut(auth), []);
  const resetPassword = useCallback((email) => sendPasswordResetEmail(auth, email), []);

  const value = useMemo(() => ({ user, setUser, ready, login, loginWithGoogle, logout, resetPassword, notice }), [user, ready, login, loginWithGoogle, logout, resetPassword, notice]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
