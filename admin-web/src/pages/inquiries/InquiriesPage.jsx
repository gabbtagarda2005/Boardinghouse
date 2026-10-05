import { useState } from 'react';
import { BedDouble, CalendarDays, Check, ChevronRight, GraduationCap, Mail, MessageSquareText, Phone, RotateCcw, Trash2, Users, X } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Button, Chip, ChipRow, ConfirmDialog, EmptyState, ErrorState, Modal, PageHeader, SkeletonCards, StatusBadge, cx } from '../../components/ui';
import { formatDateTime, formatLongDate, shortDate, timeAgo } from '../../utils/format';

const FILTERS = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'ALL', label: 'All' },
];
const STATUS_LABEL = { NEW: ['New', 'yellow'], CONTACTED: ['Contacted', 'blue'], RESERVED: ['Reserved', 'green'], CLOSED: ['Closed', 'slate'] };
const digits = (p) => (p || '').replace(/[^\d+]/g, '');
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
// Older inquiries (tenant app) have free-text move-in ("next month"); room inquiries have a real date.
const moveInLabel = (i) => (i.preferredMoveInDate ? formatLongDate(i.preferredMoveInDate) : isDay(i.moveIn) ? formatLongDate(`${i.moveIn}T00:00:00+08:00`) : i.moveIn || null);
const changed = () => window.dispatchEvent(new Event('inquiries:changed'));
const people = (n) => `${n} occupant${n > 1 ? 's' : ''}`;

/** One inquiry in full: contact buttons and the status, in a bottom sheet on phones. */
function InquiryDetail({ inquiry: i, onClose, onStatus, busy }) {
  if (!i) return null;
  const rows = [
    ['Interested Room', i.roomNumber ? `Room ${i.roomNumber}` : i.roomType || 'Any room'],
    ['Preferred Move-in', moveInLabel(i)],
    ['Number of Occupants', i.numberOfOccupants ? String(i.numberOfOccupants) : null],
    ['Contact Number', i.phone],
    ['Email', i.email],
    ['School or Workplace', i.school],
    ['Sent', formatDateTime(i.createdAt)],
  ].filter(([, v]) => v);
  const actions = [
    ['CONTACTED', 'Mark as Contacted', Check],
    ['RESERVED', 'Mark as Reserved', BedDouble],
    ['CLOSED', 'Close Inquiry', X],
  ];
  return (
    <Modal open onClose={onClose} title={i.name} size="sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-slate-500">Status</span>
        <StatusBadge label={STATUS_LABEL[i.status]?.[0]} tone={STATUS_LABEL[i.status]?.[1]} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a href={`tel:${digits(i.phone)}`} className="col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#2f6bff] px-4 font-semibold text-white hover:bg-[#4a80ff]">
          <Phone className="h-4 w-4" aria-hidden /> Contact {i.name.split(' ')[0]}
        </a>
        <a href={`sms:${digits(i.phone)}`} className={cx('inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-400 px-4 font-semibold text-slate-800 hover:bg-white/[0.06]', !i.email && 'col-span-2')}>
          <MessageSquareText className="h-4 w-4" aria-hidden /> Text
        </a>
        {i.email && (
          <a href={`mailto:${i.email}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-400 px-4 font-semibold text-slate-800 hover:bg-white/[0.06]">
            <Mail className="h-4 w-4" aria-hidden /> Email
          </a>
        )}
      </div>
      <dl className="mt-4 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08]">
        {rows.map(([k, v]) => (
          <div key={k} className="px-4 py-2.5">
            <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{k}</dt>
            <dd className="mt-0.5 text-[15px] break-words text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      {i.message && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Message</p>
          <p className="rounded-2xl bg-white/[0.04] px-4 py-3 text-[15px] whitespace-pre-line text-slate-800">“{i.message}”</p>
        </div>
      )}
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {actions.map(([value, label, Icon]) => (
          <Button key={value} variant={i.status === value ? 'primary' : 'secondary'} icon={Icon} aria-pressed={i.status === value} disabled={busy || i.status === value} onClick={() => onStatus(i, value)}>
            {label}
          </Button>
        ))}
      </div>
      {i.status !== 'NEW' && (
        <Button variant="ghost" icon={RotateCcw} className="mt-2 w-full" disabled={busy} onClick={() => onStatus(i, 'NEW')}>
          Mark as New again
        </Button>
      )}
    </Modal>
  );
}

/** People looking for a room who sent an inquiry from the public page or the tenant app. */
export default function InquiriesPage() {
  const toast = useToast();
  const [status, setStatus] = useState('NEW');
  const [busy, setBusy] = useState('');
  const [deleting, setDeleting] = useState(null);
  // The open inquiry is kept here, so its window stays open (with the new status) even when it leaves the current filter.
  const [opened, setOpened] = useState(null);
  const { data, loading, error, reload } = useApi('/inquiries', { status });
  const counts = data?.counts || {};
  const items = data?.items || [];

  const setTo = async (i, next) => {
    setBusy(i._id);
    try {
      await api.patch(`/inquiries/${i._id}`, { status: next });
      changed();
      setOpened((o) => (o && o._id === i._id ? { ...o, status: next } : o));
      toast.success({ CONTACTED: `Marked ${i.name} as contacted.`, RESERVED: `Marked ${i.name} as reserved.`, CLOSED: 'Inquiry closed.', NEW: 'Inquiry marked as new.' }[next]);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    setBusy(deleting._id);
    try {
      await api.delete(`/inquiries/${deleting._id}`);
      changed();
      toast.success('Inquiry deleted.');
      setDeleting(null);
      setOpened(null);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <PageHeader title="Inquiries" subtitle="People interested in a room. Contact them, then mark them as contacted or reserved." />
      <ChipRow label="Show" className="mb-4">
        {FILTERS.map((f) => (
          <Chip key={f.value} active={status === f.value} count={f.value !== 'ALL' ? counts[f.value] || 0 : undefined} onClick={() => setStatus(f.value)}>
            {f.label}
          </Chip>
        ))}
      </ChipRow>

      {loading && !data ? (
        <SkeletonCards count={3} label="Loading inquiries…" className="grid gap-4 lg:grid-cols-2" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !items.length ? (
        <div className="card">
          <EmptyState
            icon={MessageSquareText}
            title={status === 'NEW' ? 'No new inquiries' : 'Nothing here'}
            message="People can choose a room and send an inquiry from your public page (the “Send Inquiry” link on the sign-in page)."
          />
        </div>
      ) : (
        <div className={cx('grid gap-4 lg:grid-cols-2', loading && 'opacity-60')}>
          {items.map((i) => (
            <article key={i._id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-slate-900">{i.name}</h3>
                  <p className="text-sm text-slate-500">Sent {timeAgo(i.createdAt)}</p>
                </div>
                <StatusBadge label={STATUS_LABEL[i.status]?.[0]} tone={STATUS_LABEL[i.status]?.[1]} />
              </div>
              <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm text-slate-700 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <BedDouble className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                  <dt className="sr-only">Interested room</dt>
                  <dd className="font-semibold text-slate-900">{i.roomNumber ? `Room ${i.roomNumber}` : i.roomType || 'Any room'}</dd>
                </div>
                {moveInLabel(i) && (
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    <dt className="sr-only">Preferred move-in</dt>
                    <dd>{i.preferredMoveInDate ? shortDate(i.preferredMoveInDate) : moveInLabel(i)}</dd>
                  </div>
                )}
                {i.numberOfOccupants && (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    <dt className="sr-only">Occupants</dt>
                    <dd>{people(i.numberOfOccupants)}</dd>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                  <dt className="sr-only">Contact</dt>
                  <dd>{i.phone}</dd>
                </div>
                {i.school && (
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    <dt className="sr-only">School</dt>
                    <dd>{i.school}</dd>
                  </div>
                )}
              </dl>
              {i.message && <p className="mt-3 line-clamp-2 rounded-xl bg-slate-50 px-3 py-2 text-[15px] text-slate-700">“{i.message}”</p>}
              <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <Button size="sm" icon={ChevronRight} onClick={() => setOpened(i)}>
                  View
                </Button>
                <a href={`tel:${digits(i.phone)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 px-3 text-base font-semibold text-slate-800 hover:bg-white/[0.06] md:min-h-8 md:text-xs">
                  <Phone className="h-4 w-4" aria-hidden /> Call
                </a>
                <Button size="sm" variant="ghost" icon={Trash2} className="ml-auto text-red-700" onClick={() => setDeleting(i)}>
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <InquiryDetail inquiry={opened} onClose={() => setOpened(null)} onStatus={setTo} busy={busy === opened?._id} />
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete this inquiry?" message={`${deleting?.name}'s inquiry will be removed.`} tone="danger" confirmLabel="Delete" loading={busy === deleting?._id} onConfirm={remove} />
    </>
  );
}
