import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, MessageSquareText, Users, Wallet } from 'lucide-react';
import { Skeleton, cx } from '../../components/ui';
import { peso } from '../../utils/format';
import PublicShell, { RoomImage, RoomStateBadge } from './PublicShell';
import { ROOM_STATE, spaces, usePublicHouse, usePublicRoom } from './publicData';

const AVAILABILITY_TEXT = {
  AVAILABLE: 'This room has open spaces. Send an inquiry and the owner will contact you.',
  LIMITED: 'Only a few spaces are left in this room.',
  FULL: 'Every space in this room is taken right now.',
  UNAVAILABLE: 'This room is not taking tenants right now (for example, during repairs).',
};

/** Public room page: gallery, occupancy, rent, amenities, description and the inquiry button. */
export default function PublicRoomPage() {
  const { roomId } = useParams();
  const house = usePublicHouse();
  const { data: room, error, loading } = usePublicRoom(roomId);
  const [shown, setShown] = useState(0);

  if (error && !room) {
    return (
      <PublicShell house={house.data} title="Room">
        <div className="mx-auto max-w-xl px-4 pt-32 pb-20 text-center">
          <h1 className="text-2xl font-bold text-white">This room isn&apos;t available</h1>
          <p className="mt-2 text-slate-600">It may have been removed from the list.</p>
          <Link to="/inquire#rooms" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#2f6bff] px-5 font-semibold text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden /> See all rooms
          </Link>
        </div>
      </PublicShell>
    );
  }

  const photos = room?.photos || [];
  return (
    <PublicShell house={house.data} title={room ? `Room ${room.roomNumber}` : 'Room'}>
      <div className="mx-auto max-w-6xl animate-page-in px-4 pt-20 pb-14 sm:px-6 md:pt-24">
        <Link to="/inquire#rooms" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#8fb0ff] hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All rooms
        </Link>
        {loading && !room ? (
          <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Skeleton className="aspect-[4/3] rounded-3xl bg-white/[0.05]" />
            <Skeleton className="h-80 rounded-3xl bg-white/[0.05]" />
          </div>
        ) : (
          <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {/* Gallery */}
            <div>
              <div className="relative overflow-hidden rounded-3xl shadow-2xl shadow-black/30">
                <RoomImage room={room} index={Math.min(shown, Math.max(0, photos.length - 1))} className="aspect-[4/3] w-full" eager />
                <RoomStateBadge status={room.status} className="absolute top-4 left-4" />
              </div>
              {photos.length > 1 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="list" aria-label="More photos">
                  {photos.map((p, i) => (
                    <button
                      key={p.url}
                      type="button"
                      role="listitem"
                      onClick={() => setShown(i)}
                      aria-label={`Show photo ${i + 1} of ${photos.length}`}
                      aria-current={shown === i}
                      className={cx('h-20 w-28 shrink-0 overflow-hidden rounded-2xl ring-2 transition-all', shown === i ? 'ring-[#2f6bff]' : 'opacity-70 ring-transparent hover:opacity-100')}
                    >
                      <RoomImage room={room} index={i} className="h-full w-full" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Facts and the call to action */}
            <div className="flex flex-col gap-5">
              <div>
                <h1 className="text-4xl font-extrabold tracking-tight text-white">Room {room.roomNumber}</h1>
                {(room.name || room.building) && <p className="mt-1 text-slate-600">{[room.name, room.building].filter(Boolean).join(' · ')}</p>}
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <dt className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    <Users className="h-4 w-4" aria-hidden /> Occupancy
                  </dt>
                  <dd className="mt-1 text-xl font-extrabold text-white">{room.occupiedBeds} / {room.capacity} Occupied</dd>
                  <dd className={cx('text-sm font-semibold', room.availableBeds ? 'text-[#86efc4]' : 'text-slate-500')}>{room.availableBeds ? spaces(room.availableBeds) : room.status === 'UNAVAILABLE' ? 'Not taking tenants' : 'Fully Occupied'}</dd>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <dt className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    <Wallet className="h-4 w-4" aria-hidden /> Rent
                  </dt>
                  <dd className="mt-1 text-xl font-extrabold text-white">{peso(room.monthlyRent)}</dd>
                  <dd className="text-sm text-slate-500">per month, per person</dd>
                </div>
              </dl>

              <section aria-labelledby="avail-h" className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <h2 id="avail-h" className="text-sm font-bold text-white">
                  Availability
                </h2>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-[15px] text-slate-700">
                  <RoomStateBadge status={room.status} />
                </p>
                <p className="mt-2 text-[15px] text-slate-600">{AVAILABILITY_TEXT[room.status]}</p>
              </section>

              {room.acceptingInquiries ? (
                <Link
                  to={`/inquire/rooms/${room._id}/inquire`}
                  className="inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-[#2f6bff] px-6 py-3.5 text-base font-bold text-white shadow-xl shadow-[#2f6bff]/30 transition-colors hover:bg-[#4a80ff]"
                >
                  <MessageSquareText className="h-5 w-5" aria-hidden /> Inquire About This Room
                </Link>
              ) : (
                <p aria-disabled="true" className="rounded-2xl bg-white/[0.05] px-6 py-3.5 text-center font-bold text-slate-500">
                  {ROOM_STATE[room.status]?.label}. <Link to="/inquire#rooms" className="text-[#8fb0ff] underline">See other rooms</Link>
                </p>
              )}

              {room.amenities?.length > 0 && (
                <section aria-labelledby="amen-h">
                  <h2 id="amen-h" className="text-lg font-bold text-white">
                    Amenities
                  </h2>
                  <ul className="mt-3 grid grid-cols-2 gap-2">
                    {room.amenities.map((a) => (
                      <li key={a} className="flex items-center gap-2 text-[15px] text-slate-700">
                        <Check className="h-4 w-4 shrink-0 text-[#86efc4]" aria-hidden /> {a}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {room.description && (
                <section aria-labelledby="desc-h">
                  <h2 id="desc-h" className="text-lg font-bold text-white">
                    Description
                  </h2>
                  <p className="mt-2 text-[15px] whitespace-pre-line text-slate-700">{room.description}</p>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </PublicShell>
  );
}
