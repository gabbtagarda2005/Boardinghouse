import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Building2, CircleCheck, MessageSquareText, Receipt, Wallet, Zap } from 'lucide-react';
import { authErrorMessage, useAuth } from '../../context/AuthContext';
import { Alert, Button, Input, PasswordInput, cx } from '../../components/ui';
import { useBranding } from './AuthShell';
import TenantAndInquiryCards from './TenantAppPromo';

const BRAND = 'MCLEY Boardinghouse';
// Login fields: 44px tall and 16px text at every width.
const FIELD = 'md:min-h-11 md:text-base';

const FEATURES = [
  { icon: Wallet, title: 'Confirm payments', text: 'Check and confirm tenant payments in seconds.' },
  { icon: Receipt, title: 'Send monthly bills', text: 'Send every monthly bill with one tap.', highlight: true },
  { icon: Zap, title: 'Electricity shares', text: "Each room's electricity share is worked out for you." },
];

/** Google's multicolor "G" (official brand colors). */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

// Top bar links: compact on phones, roomier from md up.
const NAV_LINK = 'inline-flex min-h-11 items-center rounded-full px-2 text-sm font-semibold whitespace-nowrap text-slate-700 transition-colors hover:bg-white/[0.06] hover:text-white max-[359px]:px-1 max-[359px]:text-[13px] md:px-4 md:text-[15px]';

export default function LoginPage() {
  const { user, ready, login, loginWithGoogle, notice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { logo, houseName, loaded: brandingLoaded } = useBranding();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  if (ready && user) return <Navigate to={location.state?.from?.pathname || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.email || !form.password) return setError('Please enter your email and password.');
    setLoading(true);
    try {
      await login(form.email.trim(), form.password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-canvas">
      <div className="hero-halo" aria-hidden />
      {/* Top bar: the house logo on the left, the three links on the right. No hamburger menu. */}
      <header className="relative z-20 mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 pt-[env(safe-area-inset-top)] sm:px-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#fff] text-[#0a1430] ring-1 ring-white/30">
          {logo ? <img src={logo} alt={houseName ? `${houseName} logo` : 'Logo'} className="h-full w-full bg-[#fff] object-contain" /> : <Building2 className="h-5 w-5" aria-hidden />}
        </span>
        <nav aria-label="Page" className="flex shrink-0 items-center gap-0.5 max-[359px]:gap-0 md:gap-1">
          <a href="#tenant-app" className={NAV_LINK}>
            Tenant App
          </a>
          <a href="#features" className={NAV_LINK}>
            Features
          </a>
          <Link
            to="/inquire"
            className="ml-1 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#7ea3ff]/60 px-3 text-sm max-[359px]:ml-0.5 font-semibold whitespace-nowrap text-[#c9d8ff] transition-colors hover:border-[#7ea3ff] hover:bg-[#2f6bff]/10 max-[359px]:px-2 max-[359px]:text-[13px] md:ml-2 md:px-5 md:text-base"
          >
            <MessageSquareText className="hidden h-4 w-4 md:block" aria-hidden /> Send Inquiry
          </Link>
        </nav>
      </header>

      <main className="relative">
        {/* Part 1: headline (left) and sign-in card (right) on large screens; stacked on phones. One screen tall. */}
        <section className="relative flex min-h-[calc(100dvh-4rem-env(safe-area-inset-top))] flex-col justify-center overflow-hidden px-4 pt-2 pb-6 sm:px-6" aria-labelledby="hero-h">
          {/* Large screens: a wide arch low behind both columns. */}
          <div className="hero-arch hero-arch-wide hidden lg:block" aria-hidden />
          <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-14">
            <div className="text-center lg:text-left">
              <h1 id="hero-h" className="hero-title text-[1.85rem] leading-[1.08] font-extrabold tracking-tight text-white sm:text-[2.5rem] lg:text-[clamp(3rem,4.6vw,4.5rem)] lg:leading-[1.04]">
                {/* The house name from Settings; held invisible until it loads so nothing jumps. */}
                <span className={cx('break-words', !brandingLoaded && 'invisible')}>{houseName || BRAND}</span>
              </h1>
              <p className="hero-sub mx-auto mt-2 max-w-xl text-base text-slate-700 md:text-lg lg:mx-0 lg:mt-5 lg:text-xl">Bills, payments and rooms in one place, right from your phone.</p>
            </div>

            <div className="relative mx-auto mt-9 w-full max-w-md lg:mt-0">
              {/* Phones and tablets: the arch rim sits just above the card. */}
              <div className="hero-arch lg:hidden" aria-hidden />
              <div className="relative rounded-3xl border border-white/10 bg-[#0c1630]/90 p-5 shadow-2xl shadow-black/40 backdrop-blur-md sm:px-6">
                <h2 className="text-xl font-bold tracking-tight text-white">Welcome back</h2>
                <p className="mb-4 text-sm text-slate-600">Sign in to manage your boarding house.</p>
                {(error || notice) && (
                  <Alert tone="error" className="mb-3">
                    {error || notice}
                  </Alert>
                )}
                <form onSubmit={submit} className="space-y-3" noValidate>
                  <Input label="Email" type="email" inputClassName={FIELD} autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                  <PasswordInput label="Password" holdAutofill inputClassName={FIELD} autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                  <div className="-mt-1 -mb-1 flex justify-center">
                    <Link to="/forgot-password" className="inline-flex min-h-11 items-center text-sm font-semibold text-navy-300 hover:underline">
                      Forgot your password?
                    </Link>
                  </div>
                  <Button type="submit" size="lg" className="w-full md:min-h-11" loading={loading}>
                    Sign in
                  </Button>
                </form>
                <div className="my-3 flex items-center gap-3 text-xs font-medium tracking-wide text-slate-500 uppercase" aria-hidden>
                  <span className="h-px flex-1 bg-slate-200" />
                  or
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
                <Button variant="secondary" size="lg" className="w-full gap-3 font-semibold md:min-h-11" loading={googleLoading} disabled={loading} onClick={google}>
                  {!googleLoading && <GoogleLogo />}
                  Sign in with Google
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Part 2: tenant app, room inquiry and features (a full screen from tablet up). */}
        <div id="tenant-app" className="flex flex-col justify-center border-t border-white/[0.06] md:min-h-dvh">
          <TenantAndInquiryCards />
          <section id="features" className="scroll-mt-2 px-4 pt-2 pb-12 sm:px-6" aria-labelledby="features-h">
            <h2 id="features-h" className="text-center text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Everything in one place
            </h2>
            <ul className="mx-auto mt-6 grid w-full max-w-5xl gap-4 md:grid-cols-3">
              {FEATURES.map((f) => (
                <li
                  key={f.title}
                  className={cx('rounded-3xl p-6', f.highlight ? 'bg-gradient-to-br from-[#2f6bff] to-[#1f4fd6] text-white shadow-xl shadow-[#2f6bff]/20' : 'border border-white/[0.08] bg-[#0c1630]/80')}
                >
                  <span className={cx('flex h-11 w-11 items-center justify-center rounded-2xl', f.highlight ? 'bg-white/20 text-white' : 'bg-[#2f6bff]/15 text-[#8fb0ff]')}>
                    <f.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-white">{f.title}</h3>
                  <p className={cx('mt-1 text-[15px]', f.highlight ? 'text-white/85' : 'text-slate-600')}>{f.text}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      <footer className="border-t border-white/[0.06] px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
        <p className="inline-flex items-center gap-2 text-sm text-slate-600">
          <CircleCheck className="h-4 w-4 shrink-0 text-[#8fb0ff]" aria-hidden /> Your data is private and only visible to you.
        </p>
      </footer>

    </div>
  );
}
