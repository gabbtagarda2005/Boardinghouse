import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, Smartphone } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Button, Skeleton } from './ui';

const FEATURES = ['View your monthly bill', 'Check electricity charges', 'Submit payment proof', 'Receive announcements', 'Ask about a free room (no account needed)'];

/**
 * Dashboard card to share the tenant app: a Download button, a QR code to scan with a phone,
 * and the link to copy. The link is this computer's address (same Wi-Fi), or a custom one from Settings.
 */
export default function TenantAppCard() {
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [qr, setQr] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .get('/public/app-info')
      .then(async (r) => {
        if (!alive) return;
        setInfo(r.data);
        const dataUrl = await QRCode.toDataURL(r.data.url, { width: 360, margin: 1, color: { dark: '#0a1226', light: '#ffffff' } });
        if (alive) setQr(dataUrl);
      })
      .catch(() => alive && setInfo({ url: '', available: false }));
    return () => {
      alive = false;
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.url);
      toast.success('Link copied. Send it to your tenants.');
    } catch {
      toast.info(info.url);
    }
  };

  return (
    <section className="card relative overflow-hidden p-5 sm:p-6" aria-labelledby="tenant-app-h">
      <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-navy-500/20 blur-3xl" aria-hidden />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-navy-300">
            <Smartphone className="h-4 w-4" aria-hidden /> Tenant Mobile App
          </p>
          <h2 id="tenant-app-h" className="mt-1 text-xl font-extrabold tracking-tight text-slate-900">
            Manage your boarding-house account right from your phone.
          </h2>
          <ul className="mt-3 space-y-1.5">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-[15px] text-slate-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                </span>
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={info?.url || '#'}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!info?.available}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#fff] px-5 font-semibold text-[#0a1430] shadow-sm hover:bg-[#dfe8ff] md:min-h-10"
            >
              <Download className="h-4 w-4" aria-hidden /> Download App
            </a>
            <Button variant="ghost" icon={Copy} onClick={copy} disabled={!info?.url}>
              Copy link
            </Button>
          </div>
          {info && !info.available && <p className="mt-2 text-sm text-amber-600">The app isn&apos;t built on this computer yet. Ask your developer to build it, then this link works.</p>}
        </div>
        <figure className="mx-auto shrink-0 text-center sm:mx-0">
          <div className="rounded-2xl bg-[#fff] p-2.5 shadow-lift">
            {qr ? <img src={qr} alt="QR code to open the tenant app" className="h-36 w-36 sm:h-40 sm:w-40" /> : <Skeleton className="h-36 w-36 rounded-xl sm:h-40 sm:w-40" />}
          </div>
          <figcaption className="mt-2 text-sm font-semibold text-slate-600">Scan with a phone camera</figcaption>
        </figure>
      </div>
    </section>
  );
}
