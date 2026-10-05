import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { ArrowRight, Download, House, Smartphone } from 'lucide-react';
import { api } from '../../api/client';
import { TENANT_APP_LINK, linkIsLocalOnly } from '../../lib/tenantApp';

/** QR image for the tenant app link (on localhost: this computer's Wi-Fi address, since phones can't open "localhost"). */
function useTenantQr() {
  const [qr, setQr] = useState('');
  useEffect(() => {
    let alive = true;
    (async () => {
      let target = TENANT_APP_LINK;
      if (linkIsLocalOnly(target)) {
        try {
          target = (await api.get('/public/app-info')).data.url || target;
        } catch {
          /* keep the local link */
        }
      }
      const dataUrl = await QRCode.toDataURL(target, { width: 220, margin: 1, color: { dark: '#0a1226', light: '#ffffff' } });
      if (alive) setQr(dataUrl);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return qr;
}

/** "Are you a tenant?": get the app (one link from config; QR code from md up). Used on the login and public pages. */
export function TenantAppCard({ title = 'Are you a tenant?', text = 'Access your bills, payments, announcements, and room details from your phone.' }) {
  const qr = useTenantQr();
  return (
      <section aria-labelledby="tenant-band-h" className="flex gap-4 rounded-3xl border border-[#2f6bff]/30 bg-gradient-to-br from-[#2f6bff]/[0.16] to-[#2f6bff]/[0.05] p-5 sm:gap-5 sm:p-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2f6bff] text-white shadow-lg shadow-[#2f6bff]/30">
          <Smartphone className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="tenant-band-h" className="text-xl font-extrabold tracking-tight text-white">
            {title}
          </h2>
          <p className="mt-1 max-w-xl text-[15px] text-slate-700">{text}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <a
              href={TENANT_APP_LINK}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#2f6bff] px-5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#4a80ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7ea3ff]"
            >
              <Download className="h-4 w-4" aria-hidden /> Download Tenant App
            </a>
            <Link to="/tenant-app" className="inline-flex min-h-11 items-center justify-center rounded-xl px-2 text-base font-semibold text-[#8fb0ff] hover:underline">
              View App Details
            </Link>
          </div>
        </div>
        <figure className="hidden shrink-0 text-center md:block">
          <div className="rounded-2xl bg-[#fff] p-2 shadow-lg shadow-black/25">
            {qr ? (
              <img src={qr} alt="QR code: scan with your phone camera to get the tenant app" className="h-[90px] w-[90px]" />
            ) : (
              <div className="h-[90px] w-[90px] animate-pulse rounded-lg bg-[#e3e8f4]" role="img" aria-label="QR code loading" />
            )}
          </div>
          <figcaption className="mt-2 text-xs font-semibold text-[#8fb0ff]">Scan to download</figcaption>
        </figure>
      </section>
  );
}

/** Login page: the tenant app card, then a card for people looking for a room (goes to the public page). */
export default function TenantAndInquiryCards() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10 sm:px-6 md:py-12">
      <TenantAppCard />

      {/* People looking for a room */}
      <section aria-labelledby="inquiry-h" className="flex flex-col gap-4 rounded-3xl border border-[#34d399]/25 bg-gradient-to-br from-[#10b981]/[0.12] to-[#10b981]/[0.04] p-5 sm:p-6 md:flex-row md:items-center md:gap-5">
        <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0f7a5a] text-white shadow-lg shadow-[#0f7a5a]/30">
            <House className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="inquiry-h" className="text-xl font-extrabold tracking-tight text-[#86efc4]">
              Looking for a place to stay?
            </h2>
            <p className="mt-1 text-[15px] text-slate-700">Check available rooms and send us an inquiry.</p>
          </div>
        </div>
        <Link
          to="/inquire"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0f7a5a] px-5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#13916b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#86efc4]"
        >
          Inquire About a Room <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
    </div>
  );
}
