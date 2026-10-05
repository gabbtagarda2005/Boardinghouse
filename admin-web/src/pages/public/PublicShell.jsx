import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BedDouble, Building2, House, Users } from 'lucide-react';
import { fileUrl } from '../../api/client';
import { cx } from '../../components/ui';
import { peso } from '../../utils/format';
import { ROOM_STATE, spaces } from './publicData';

/** Public pages: top bar (house logo + name, links) and a simple footer. No owner sign-in mixed in. */
export default function PublicShell({ house, title, children }) {
  useEffect(() => {
    document.title = [title, house?.name].filter(Boolean).join(' · ') || 'Rooms';
  }, [title, house?.name]);
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip bg-canvas">
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)] sm:px-6">
          <Link to="/inquire" className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#fff] text-[#0a1430] ring-1 ring-white/30">
              {house?.logoUrl ? <img src={fileUrl(house.logoUrl)} alt="" className="h-full w-full object-contain" /> : <Building2 className="h-5 w-5" aria-hidden />}
            </span>
            <span className="truncate text-[15px] font-extrabold tracking-tight text-white drop-shadow max-[480px]:sr-only">{house?.name || 'Boarding House'}</span>
          </Link>
          <nav aria-label="Page" className="flex shrink-0 items-center gap-1">
            <Link to="/inquire#rooms" className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-white/90 drop-shadow hover:bg-white/10 md:px-4 md:text-[15px]">
              Rooms
            </Link>
            <Link to="/inquire#tenant-app" className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-white/90 drop-shadow hover:bg-white/10 md:px-4 md:text-[15px]">
              Tenant App
            </Link>
            <Link to="/login" aria-label="Home" title="Home" className="ml-1 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white drop-shadow backdrop-blur hover:bg-white/20">
              <House className="h-5 w-5" aria-hidden />
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-white/[0.06] px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-sm text-slate-500">
        © {new Date().getFullYear()} {house?.name || 'Boarding House'}
        <span className="mx-2" aria-hidden>
          ·
        </span>
        <Link to="/login" className="inline-flex min-h-11 items-center hover:text-slate-300 hover:underline">
          Home
        </Link>
      </footer>
    </div>
  );
}

/** Room availability as a pill with a dot and words. */
export function RoomStateBadge({ status, className }) {
  const s = ROOM_STATE[status] || ROOM_STATE.UNAVAILABLE;
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 backdrop-blur-md', s.cls, className)}>
      <span className={cx('h-2 w-2 rounded-full', s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

/** The room's main photo, or a soft placeholder. */
export function RoomImage({ room, className, index = 0, eager }) {
  const photo = room.photos?.[index];
  return (
    <div className={cx('relative overflow-hidden bg-gradient-to-br from-[#16295a] to-[#0a1430]', className)}>
      {photo ? (
        <img src={fileUrl(photo.url)} alt={`Room ${room.roomNumber}`} loading={eager ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-[#8fa3cf]">
          <BedDouble className="h-9 w-9" aria-hidden />
          <span className="text-sm font-medium">Photo coming soon</span>
        </div>
      )}
    </div>
  );
}

/** A room as a property listing card: photo, availability, rent, amenities, View Room + Inquire. */
export function PublicRoomCard({ room }) {
  const can = room.acceptingInquiries;
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c1630]/90 shadow-xl shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:border-[#2f6bff]/40 hover:shadow-2xl hover:shadow-[#2f6bff]/10 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div className="relative">
        <RoomImage room={room} className="aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none" />
        <RoomStateBadge status={room.status} className="absolute top-3 left-3" />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl font-extrabold tracking-tight text-white">Room {room.roomNumber}</h3>
            {(room.name || room.building) && <p className="truncate text-sm text-slate-500">{[room.name, room.building].filter(Boolean).join(' · ')}</p>}
          </div>
          <p className="shrink-0 text-right">
            <span className="block text-lg font-extrabold text-white">{peso(room.monthlyRent)}</span>
            <span className="text-xs text-slate-500">per month</span>
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <Users className="h-4 w-4 text-[#8fb0ff]" aria-hidden /> {room.occupiedBeds} / {room.capacity} Occupied
          </span>
          <span className={cx('font-semibold', room.availableBeds ? 'text-[#86efc4]' : 'text-slate-500')}>{room.status === 'UNAVAILABLE' ? 'Not taking tenants now' : room.availableBeds ? spaces(room.availableBeds) : 'Fully Occupied'}</span>
        </div>
        {room.amenities?.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Amenities">
            {room.amenities.slice(0, 4).map((a) => (
              <li key={a} className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs text-slate-700">
                {a}
              </li>
            ))}
            {room.amenities.length > 4 && <li className="px-1 text-xs text-slate-500">+{room.amenities.length - 4} more</li>}
          </ul>
        )}
        <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
          <Link to={`/inquire/rooms/${room._id}`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-3 text-[15px] font-semibold text-white transition-colors hover:bg-white/[0.06]">
            View Room
          </Link>
          {can ? (
            <Link to={`/inquire/rooms/${room._id}/inquire`} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#2f6bff] px-3 text-[15px] font-semibold text-white shadow-lg shadow-[#2f6bff]/25 transition-colors hover:bg-[#4a80ff]">
              Inquire
            </Link>
          ) : (
            <span aria-disabled="true" className="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-xl bg-white/[0.05] px-3 text-center text-sm font-semibold text-slate-500">
              {room.status === 'UNAVAILABLE' ? 'Unavailable' : 'Fully Occupied'}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
