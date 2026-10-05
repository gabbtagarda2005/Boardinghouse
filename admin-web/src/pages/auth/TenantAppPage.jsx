import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { ArrowLeft, ExternalLink, MoreVertical, Share, SquarePlus } from 'lucide-react';
import { api } from '../../api/client';
import { Alert, Skeleton } from '../../components/ui';
import { TENANT_APP_LINK, detectPlatform, linkIsLocalOnly } from '../../lib/tenantApp';
import AuthShell from './AuthShell';

// The tenant app is a web app (PWA): it opens in the browser and can be added to the home screen.
const STEPS = {
  ios: {
    title: 'On iPhone or iPad',
    steps: [
      { icon: ExternalLink, text: 'Tap “Open the tenant app” above. Use Safari.' },
      { icon: Share, text: 'Tap the Share button (the square with an arrow) at the bottom of Safari.' },
      { icon: SquarePlus, text: 'Choose “Add to Home Screen”, then tap Add.' },
    ],
  },
  android: {
    title: 'On Android',
    steps: [
      { icon: ExternalLink, text: 'Tap “Open the tenant app” above. Use Chrome.' },
      { icon: MoreVertical, text: 'Tap the ⋮ menu at the top right of Chrome.' },
      { icon: SquarePlus, text: 'Choose “Install app” or “Add to Home screen”, then confirm.' },
    ],
  },
};

/** Where the QR code and "Download tenant app" button lead. Sends each phone to the tenant app with install steps. */
export default function TenantAppPage() {
  const [platform] = useState(() => detectPlatform());
  const [info, setInfo] = useState(null);
  const [qr, setQr] = useState('');

  useEffect(() => {
    document.title = 'Get the tenant app';
    let alive = true;
    api
      .get('/public/app-info')
      .then((r) => alive && setInfo(r.data))
      .catch(() => alive && setInfo({ url: '', available: false }));
    return () => {
      alive = false;
    };
  }, []);

  // Computers: a QR code to continue on the phone (this page's public link, or the Wi-Fi address when local).
  useEffect(() => {
    if (platform !== 'desktop' || !info) return;
    const target = linkIsLocalOnly(TENANT_APP_LINK) ? info.url : TENANT_APP_LINK;
    if (target) QRCode.toDataURL(target, { width: 320, margin: 1, color: { dark: '#0a1226', light: '#ffffff' } }).then(setQr, () => {});
  }, [platform, info]);

  const appUrl = info?.url;
  const guide = STEPS[platform];

  return (
    <AuthShell title="Get the tenant app" subtitle="See your bills, send payment proof and get announcements on your phone.">
      {!info ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : !appUrl || !info.available ? (
        <Alert tone="warning">The tenant app isn&apos;t ready yet. Please ask the boarding house owner for the link.</Alert>
      ) : guide ? (
        <>
          <a
            href={appUrl}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#2f6bff] px-5 text-base font-semibold text-white shadow-sm hover:bg-[#4a80ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7ea3ff]"
          >
            <ExternalLink className="h-4 w-4" aria-hidden /> Open the tenant app
          </a>
          <h2 className="mt-6 text-base font-bold text-slate-900">Keep it on your home screen</h2>
          <p className="text-sm text-slate-600">{guide.title}: it then opens like a normal app.</p>
          <ol className="mt-3 space-y-3">
            {guide.steps.map((s, n) => (
              <li key={s.text} className="flex items-start gap-3 text-[15px] text-slate-700">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2f6bff] text-sm font-bold text-white">{n + 1}</span>
                <span className="pt-1">
                  <s.icon className="mr-1.5 inline h-4 w-4 align-[-2px] text-navy-300" aria-hidden />
                  {s.text}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className="text-center">
          <p className="text-[15px] text-slate-700">The tenant app is made for phones. Scan this with your phone camera:</p>
          <div className="mx-auto mt-4 w-fit rounded-2xl bg-[#fff] p-2.5">
            {qr ? <img src={qr} alt="QR code to open the tenant app on your phone" className="h-44 w-44" /> : <Skeleton className="h-44 w-44 rounded-xl bg-slate-200" />}
          </div>
          <a href={appUrl} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#7ea3ff]/60 px-5 font-semibold text-[#c9d8ff] hover:bg-[#2f6bff]/10">
            <ExternalLink className="h-4 w-4" aria-hidden /> Open it in this browser instead
          </a>
        </div>
      )}
      <p className="mt-6 text-center">
        <Link to="/login" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-navy-300 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
