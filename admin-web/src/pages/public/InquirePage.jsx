import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowDown, House, Mail, MapPin, Phone, ShieldCheck, Smartphone, Wifi } from 'lucide-react';
import { fileUrl } from '../../api/client';
import { Skeleton } from '../../components/ui';
import { TenantAppCard } from '../auth/TenantAppPromo';
import PublicShell, { PublicRoomCard } from './PublicShell';
import { usePublicHouse, usePublicRooms } from './publicData';

const FEATURES = [
  { icon: House, title: 'Comfortable Rooms', text: 'Clean, well-kept rooms and bed spaces, ready to move in.' },
  { icon: ShieldCheck, title: 'Safe & Secure', text: 'A quiet, watched-over place where you can rest easy.' },
  { icon: Wifi, title: 'Essential Amenities', text: 'Wi-Fi, beds and storage, listed for every room.' },
  { icon: Smartphone, title: 'Easy Tenant Access', text: 'Bills, payments and announcements in the tenant app.' },
];

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Public page: see the boarding house → see available rooms → choose a room → send an inquiry. */
export default function InquirePage() {
  const house = usePublicHouse();
  const rooms = usePublicRooms();
  const { hash } = useLocation();
  const h = house.data;
  const list = rooms.data || [];
  const freeSpaces = list.filter((r) => r.status !== 'UNAVAILABLE').reduce((n, r) => n + r.availableBeds, 0);
  // Hero: the boarding-house photo from Settings; a plain glow until the owner uploads one.
  const heroPhoto = h?.coverUrl || null;

  // Links like /inquire#rooms scroll to that section once it's on the page.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    el?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  }, [hash, rooms.data]);

  const explore = () => document.getElementById('rooms')?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  const contacts = [
    h?.address && { icon: MapPin, label: 'Address', value: h.address },
    h?.phone && { icon: Phone, label: 'Phone', value: h.phone, href: `tel:${h.phone.replace(/[^\d+]/g, '')}` },
    h?.email && { icon: Mail, label: 'Email', value: h.email, href: `mailto:${h.email}` },
  ].filter(Boolean);

  return (
    <PublicShell house={h} title="Rooms">
      {/* Hero */}
      <section className="relative isolate flex min-h-[min(92dvh,46rem)] items-end overflow-hidden" aria-labelledby="inquire-h">
        {heroPhoto ? (
          <img src={fileUrl(heroPhoto)} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" fetchPriority="high" />
        ) : (
          <div className="absolute inset-0 -z-20 bg-[radial-gradient(70%_60%_at_50%_30%,rgba(47,107,255,0.45),transparent_70%)]" aria-hidden />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#050a18] via-[#050a18]/70 to-[#050a18]/30" aria-hidden />
        <div className="mx-auto w-full max-w-6xl animate-page-in px-4 pt-28 pb-14 sm:px-6 md:pb-20">
          {house.loading && !h ? (
            <Skeleton className="h-14 w-80 max-w-full rounded-2xl bg-white/10" />
          ) : (
            <p className="text-sm font-bold tracking-[0.2em] text-[#8fb0ff] uppercase">{h?.name}</p>
          )}
          <h1 id="inquire-h" className="mt-3 max-w-3xl text-[2.4rem] leading-[1.05] font-extrabold tracking-tight text-white sm:text-6xl">
            Find a comfortable place to call home.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/80">Explore our rooms, check current availability, and send an inquiry to the boarding-house owner.</p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <button type="button" onClick={explore} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#fff] px-6 text-base font-bold text-[#0a1430] shadow-xl shadow-black/30 transition-transform hover:scale-[1.02] motion-reduce:hover:scale-100">
              Explore Available Rooms <ArrowDown className="h-4 w-4" aria-hidden />
            </button>
            {rooms.data && (
              <p className="text-sm font-semibold text-white/80">
                {freeSpaces > 0 ? `${freeSpaces} space${freeSpaces > 1 ? 's' : ''} available right now` : 'All rooms are full right now'}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Property information */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16" aria-labelledby="about-h">
        <h2 id="about-h" className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          {h?.name || 'Our boarding house'}
        </h2>
        {contacts.length > 0 && (
          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            {contacts.map((c) => (
              <div key={c.label} className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2f6bff]/15 text-[#8fb0ff]">
                  <c.icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{c.label}</dt>
                  <dd className="mt-0.5 text-[15px] break-words text-white">
                    {c.href ? (
                      <a href={c.href} className="hover:underline">
                        {c.value}
                      </a>
                    ) : (
                      c.value
                    )}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        )}
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-transparent p-5 transition-colors hover:border-[#2f6bff]/35">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2f6bff] text-white shadow-lg shadow-[#2f6bff]/30">
                <f.icon className="h-6 w-6" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-bold text-white">{f.title}</h3>
              <p className="mt-1 text-[15px] text-slate-600">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Rooms with live availability */}
      <section id="rooms" className="scroll-mt-4 border-t border-white/[0.06] bg-gradient-to-b from-[#0a1430]/60 to-transparent" aria-labelledby="rooms-h">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
          <h2 id="rooms-h" className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Available Rooms
          </h2>
          <p className="mt-2 text-base text-slate-600">See which rooms currently have available spaces.</p>
          {rooms.error && !rooms.data ? (
            <p className="mt-8 rounded-2xl border border-white/10 p-6 text-center text-slate-600" role="alert">
              We couldn&apos;t load the rooms right now. Please try again in a moment.
            </p>
          ) : !rooms.data ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading rooms">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[26rem] rounded-3xl bg-white/[0.05]" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <p className="mt-8 rounded-2xl border border-white/10 p-6 text-center text-slate-600">No rooms are listed yet. Please check back soon.</p>
          ) : (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((r) => (
                <PublicRoomCard key={r._id} room={r} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Tenant app */}
      <section id="tenant-app" className="mx-auto max-w-5xl scroll-mt-4 px-4 py-12 sm:px-6 md:py-16" aria-label="Tenant app">
        <TenantAppCard title="Are you already a tenant?" text="Get the Boarding House mobile app to view your bills, payments, room information, and announcements." />
      </section>
    </PublicShell>
  );
}
