import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authErrorMessage, useAuth } from '../../context/AuthContext';
import { Alert, Button, Input } from '../../components/ui';
import AuthShell from './AuthShell';

// Firebase sends reset emails from noreply@<auth domain>; Gmail often files these under Spam.
const SENDER = `noreply@${import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'firebaseapp.com'}`;

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      // Don't reveal whether an email is registered.
      if (err?.code === 'auth/user-not-found') setSent(true);
      else setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Forgot your password?" subtitle="We'll email you a link to choose a new one.">
      {sent ? (
        <Alert tone="success" title="Check your email">
          If an account exists for {email}, a password reset link is on its way. Open it, choose a new password, then come back to sign in.
          <span className="mt-2 block">
            Not in your inbox after a few minutes? Check <strong>Spam</strong> (and Promotions in Gmail). It comes from <strong>{SENDER}</strong>.
          </span>
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!email}>
            Send Reset Link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="font-semibold text-navy-300 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
