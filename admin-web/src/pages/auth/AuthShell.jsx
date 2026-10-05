import { useEffect, useState } from 'react';
import { Building2, CircleCheck, Receipt, Wallet, Zap } from 'lucide-react';
import { api, fileUrl } from '../../api/client';
import { applyFavicon } from '../../lib/favicon';

const BRAND = 'MCLEY Boardinghouse';
const POINTS = [
  { icon: Wallet, text: 'Check and confirm tenant payments in seconds' },
  { icon: Receipt, text: 'Send every monthly bill with one tap' },
  { icon: Zap, text: 'Electricity shares worked out for you' },
];

/** The saved logo and house name (Settings → Boarding House Information). `loaded` turns true once known. */
export function useBranding() {
  const [branding, setBranding] = useState({ logo: null, houseName: '', loaded: false });
  useEffect(() => {
    let alive = true;
    api
      .get('/public/branding')
      .then((r) => {
        if (!alive) return;
        const url = r.data.logoUrl ? fileUrl(r.data.logoUrl) : null;
        setBranding({ logo: url, houseName: r.data.houseName || '', loaded: true });
        applyFavicon(url);
      })
      .catch(() => alive && setBranding((b) => ({ ...b, loaded: true })));
    return () => {
      alive = false;
    };
  }, []);
  return branding;
}

/** The saved logo, if any. */
export function useLogo() {
  return useBranding().logo;
}

function Brand({ light, logo, tagline = "Owner's portal" }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-[#fff] text-[#0a1430] shadow-lg ring-1 ring-white/30">
        {logo ? <img src={logo} alt="" className="h-full w-full bg-[#fff] object-contain" /> : <Building2 className="h-6 w-6" aria-hidden />}
      </span>
      <div>
        <p className={light ? 'text-lg font-extrabold tracking-tight text-white' : 'text-lg font-extrabold tracking-tight text-slate-900'}>{BRAND}</p>
        <p className={light ? 'text-sm text-white/75' : 'text-sm text-slate-500'}>{tagline}</p>
      </div>
    </div>
  );
}

/** Sign-in pages: a branded panel beside the form on large screens, a navy header above it on phones. */
export default function AuthShell({ title, subtitle, children }) {
  const logo = useLogo();
  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Large screens: brand panel */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-navy-500/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-amber-400/10 blur-3xl" aria-hidden />
        <Brand light logo={logo} />
        <div className="relative max-w-md">
          <h2 className="text-4xl leading-tight font-extrabold tracking-tight">Run your boarding house from anywhere.</h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-center gap-3 text-[15px] text-white/85">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-panel/10 ring-1 ring-white/15">
                  <p.icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-navy-300">
          <CircleCheck className="h-4 w-4" aria-hidden /> Your data is private and only visible to you.
        </p>
      </aside>

      {/* Form side */}
      <main className="relative flex min-h-dvh flex-col lg:items-center lg:justify-center lg:p-12">
        {/* Phones and tablets: a compact header (logo, name, one line) so the form comes first. */}
        <div className="relative overflow-hidden bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-12 lg:hidden">
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-navy-500/25 blur-3xl" aria-hidden />
          <div className="relative mx-auto max-w-md">
            <Brand light logo={logo} tagline="Bills, payments and rooms in one place." />
          </div>
        </div>
        <div className="relative z-10 mx-auto -mt-8 w-full max-w-md px-4 pb-[max(2.5rem,calc(1rem+env(safe-area-inset-bottom)))] lg:mt-0 lg:px-0 lg:pb-[env(safe-area-inset-bottom)]">
          <div className="animate-page-in rounded-3xl bg-panel p-5 shadow-lift ring-1 ring-slate-200/70 sm:p-8">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
            {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
