import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CircleCheck, Send } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { Alert, Button, Input, Select, Skeleton, Textarea } from '../../components/ui';
import { peso, toDateInput } from '../../utils/format';
import PublicShell, { RoomImage, RoomStateBadge } from './PublicShell';
import { spaces, usePublicHouse, usePublicRoom } from './publicData';

const EMPTY = { name: '', phone: '', email: '', moveIn: '', occupants: '1', message: '', website: '' };
const MAX_MESSAGE = 1000;
// Per-browser limit (the server also limits by address): 3 inquiries per hour.
const SENT_KEY = 'inquiries-sent';
const LIMIT = 3;
const FIELD = 'md:min-h-11 md:text-base';

function recentSends() {
  try {
    const hourAgo = Date.now() - 3600000;
    return (JSON.parse(localStorage.getItem(SENT_KEY) || '[]') || []).filter((t) => t > hourAgo);
  } catch {
    return [];
  }
}
function rememberSend() {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify([...recentSends(), Date.now()]));
  } catch {
    /* private mode: the server limit still applies */
  }
}

function validate(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = 'Please enter your full name.';
  if (!/^[0-9+()\-\s]{7,20}$/.test(f.phone.trim())) e.phone = 'Please enter a valid contact number, e.g. 0917 123 4567.';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Please enter a valid email, or leave it empty.';
  if (!f.moveIn) e.moveIn = 'Please choose your preferred move-in date.';
  if (!(Number(f.occupants) >= 1)) e.occupants = 'Please choose how many people will stay.';
  if (f.message.length > MAX_MESSAGE) e.message = `Please keep it under ${MAX_MESSAGE} characters.`;
  return e;
}

/** "Inquire About Room 101": the room is already chosen; an inquiry is not an account. */
export default function RoomInquiryPage() {
  const { roomId } = useParams();
  const house = usePublicHouse();
  const { data: room, error: roomError } = usePublicRoom(roomId);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const houseName = house.data?.name || 'our boarding house';

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  // Up to the free spaces (or the room size when the owner allows a waiting list).
  const maxPeople = room ? Math.max(1, room.availableBeds || (room.acceptingInquiries ? room.capacity : 1)) : 1;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`f-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    if (recentSends().length >= LIMIT) return setError('You already sent a few inquiries. Please wait an hour, or contact the owner directly.');
    setSending(true);
    try {
      await api.post('/public/inquiries', {
        roomId,
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        preferredMoveInDate: form.moveIn,
        numberOfOccupants: Number(form.occupants),
        message: form.message.trim(),
        website: form.website, // honeypot: always empty for people
      });
      rememberSend();
      setSent(true);
      window.scrollTo({ top: 0 });
    } catch (err) {
      const fieldMap = { preferredMoveInDate: 'moveIn', numberOfOccupants: 'occupants' };
      const fe = {};
      for (const d of err?.response?.data?.details || []) {
        const k = fieldMap[d.field] || d.field;
        if (k in EMPTY) fe[k] = d.message;
      }
      if (Object.keys(fe).length) setErrors(fe);
      else setError(errorMessage(err, 'Your inquiry could not be sent. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <PublicShell house={house.data} title={room ? `Inquire About Room ${room.roomNumber}` : 'Inquiry'}>
      <div className="mx-auto max-w-5xl animate-page-in px-4 pt-20 pb-14 sm:px-6 md:pt-24">
        {sent ? (
          <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-[#0c1630]/90 p-8 text-center shadow-2xl shadow-black/30" role="status">
            <CircleCheck className="mx-auto h-16 w-16 text-[#34d399]" aria-hidden />
            <h1 className="mt-4 text-2xl font-extrabold text-white">Inquiry Sent Successfully</h1>
            <p className="mt-2 text-[15px] text-slate-700">Thank you for your interest in {houseName}. The owner will contact you soon.</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <Link to="/inquire#rooms" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#2f6bff] px-5 font-semibold text-white hover:bg-[#4a80ff]">
                View Available Rooms
              </Link>
              <Link to="/login" className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/15 px-5 font-semibold text-white hover:bg-white/[0.06]">
                Back to Home
              </Link>
            </div>
          </div>
        ) : (
          <>
            <Link to={`/inquire/rooms/${roomId}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#8fb0ff] hover:underline">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to the room
            </Link>
            {roomError && !room ? (
              <Alert tone="error" className="mt-4">
                This room isn&apos;t available any more. <Link to="/inquire#rooms" className="underline">See other rooms</Link>
              </Alert>
            ) : (
              <div className="mt-4 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
                <form onSubmit={submit} noValidate className="rounded-3xl border border-white/10 bg-[#0c1630]/90 p-5 shadow-2xl shadow-black/30 sm:p-7">
                  <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{room ? `Inquire About Room ${room.roomNumber}` : <Skeleton className="h-8 w-64 bg-white/10" />}</h1>
                  <p className="mt-1 text-[15px] text-slate-600">The owner will call, text or email you. This is not an account and costs nothing.</p>
                  {room && !room.acceptingInquiries && (
                    <Alert tone="warning" className="mt-4">
                      This room is not taking inquiries right now. <Link to="/inquire#rooms" className="underline">See other rooms</Link>
                    </Alert>
                  )}
                  {error && (
                    <Alert tone="error" className="mt-4">
                      {error}
                    </Alert>
                  )}
                  <div className="mt-5 space-y-4">
                    <div>
                      <p className="label">Preferred Room</p>
                      <p className="flex min-h-11 items-center rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 text-base font-semibold text-white">{room ? `Room ${room.roomNumber}` : '…'}</p>
                    </div>
                    <Input id="f-name" label="Full Name" required autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} maxLength={120} inputClassName={FIELD} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input id="f-phone" label="Contact Number" required type="tel" inputMode="tel" autoComplete="tel" placeholder="09xx xxx xxxx" value={form.phone} onChange={set('phone')} error={errors.phone} maxLength={20} inputClassName={FIELD} />
                      <Input id="f-email" label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} maxLength={160} inputClassName={FIELD} hint="Optional" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input id="f-moveIn" label="Preferred Move-in Date" required type="date" min={toDateInput()} value={form.moveIn} onChange={set('moveIn')} error={errors.moveIn} inputClassName={FIELD} />
                      <Select
                        id="f-occupants"
                        label="Number of Occupants"
                        required
                        value={form.occupants}
                        onChange={set('occupants')}
                        error={errors.occupants}
                        options={Array.from({ length: maxPeople }, (_, i) => ({ value: String(i + 1), label: `${i + 1} ${i ? 'people' : 'person'}` }))}
                        hint={room?.availableBeds ? `${spaces(room.availableBeds)} in this room` : undefined}
                      />
                    </div>
                    <Textarea
                      id="f-message"
                      label="Message"
                      rows={4}
                      maxLength={MAX_MESSAGE}
                      placeholder="e.g. I'm a student and would like to visit this weekend."
                      value={form.message}
                      onChange={set('message')}
                      error={errors.message}
                      hint={`Optional · ${form.message.length}/${MAX_MESSAGE}`}
                    />
                    {/* Honeypot: hidden from people and screen readers; bots tend to fill it in. */}
                    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                      <label>
                        Website
                        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
                      </label>
                    </div>
                    <Button type="submit" size="lg" icon={Send} loading={sending} disabled={!room || !room.acceptingInquiries} className="w-full rounded-2xl! bg-[#2f6bff]! text-white! hover:bg-[#4a80ff]! md:min-h-12">
                      Send Inquiry
                    </Button>
                  </div>
                </form>

                {/* The chosen room */}
                {room && (
                  <aside className="h-fit overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c1630]/80" aria-label="Chosen room">
                    <RoomImage room={room} className="aspect-[4/3] w-full" />
                    <div className="space-y-2 p-4">
                      <p className="text-lg font-extrabold text-white">Room {room.roomNumber}</p>
                      <RoomStateBadge status={room.status} />
                      <p className="text-sm text-slate-700">
                        {room.occupiedBeds} / {room.capacity} Occupied · {peso(room.monthlyRent)} / month
                      </p>
                    </div>
                  </aside>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </PublicShell>
  );
}
