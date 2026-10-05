import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ChevronDown, Mail, Phone, UserPlus, X } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Alert, Button, Checkbox, Modal, Textarea, cx } from '../../components/ui';
import { AccountStatusBadge } from '../../components/AccountStatus';
import { formatDate, formatLongDate } from '../../utils/format';
import AssignRoomModal from './AssignRoomModal';

const REJECT_REASONS = [
  { value: 'NOT_VERIFIED', label: 'Information could not be verified' },
  { value: 'DUPLICATE', label: 'Duplicate account' },
  { value: 'NO_TENANCY', label: 'No active tenancy' },
  { value: 'OTHER', label: 'Other' },
];

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={cx('mt-0.5 text-[15px] break-words', children ? 'text-slate-900' : 'text-slate-500')}>{children || 'Not provided'}</dd>
    </div>
  );
}

/** Everything the applicant entered, with Approve / Reject. */
function ReviewModal({ tenant: t, onClose, onApprove, onReject }) {
  if (!t) return null;
  const ec = t.emergencyContact;
  return (
    <Modal
      open
      onClose={onClose}
      title="Review Tenant Account"
      size="md"
      footer={
        <>
          <Button variant="secondary" icon={X} className="text-red-700" onClick={onReject} disabled={t.status === 'REJECTED'}>
            Reject Account
          </Button>
          <Button variant="success" icon={Check} onClick={onApprove}>
            Approve Account
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-bold text-slate-900">{t.name}</h3>
        <AccountStatusBadge status={t.status} />
      </div>
      {t.status === 'REJECTED' && t.rejectionReason && <p className="mt-1 text-sm text-slate-500">Not approved: {t.rejectionReason}</p>}
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <Fact label="Email">{t.email}</Fact>
        <Fact label="Phone">{t.phone}</Fact>
        <Fact label="Registered">{t.createdAt ? formatLongDate(t.createdAt) : null}</Fact>
        <Fact label="School or Workplace">{t.occupation}</Fact>
        <Fact label="Home Address">{t.address}</Fact>
        <Fact label="Birthday">{t.birthDate ? formatDate(t.birthDate) : null}</Fact>
        <Fact label="Emergency Contact">{ec?.name || ec?.phone ? [ec.name && `${ec.name}${ec.relationship ? ` (${ec.relationship})` : ''}`, ec.phone].filter(Boolean).join(' · ') : null}</Fact>
        <Fact label="Says they live in">{t.requestedRoom ? `Room ${t.requestedRoom}` : null}</Fact>
        <Fact label="Moved in (they say)">{t.requestedMoveIn ? formatDate(t.requestedMoveIn) : null}</Fact>
      </dl>
      <Alert tone="info" className="mt-4">
        Approve only people who really board here. Approving doesn&apos;t assign a room unless you choose to.
      </Alert>
    </Modal>
  );
}

/**
 * New tenant accounts created in the tenant app. They can sign in but see nothing until the owner
 * approves them. "Reject" keeps the account (marked Rejected) with a reason the applicant sees.
 */
export default function SignupRequests({ onChanged }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const box = useRef(null);
  const pending = useApi('/tenants', { status: 'PENDING' });
  const rejected = useApi('/tenants', { status: 'REJECTED' });
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [confirmApprove, setConfirmApprove] = useState(null);
  const [assignToo, setAssignToo] = useState(false);
  const [assigning, setAssigning] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [showRejected, setShowRejected] = useState(false);
  const items = pending.data?.items || [];
  const notApproved = rejected.data?.items || [];
  const highlight = params.get('view') === 'signups';

  useEffect(() => {
    if (highlight && items.length) box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [highlight, items.length]);

  if (!items.length && !notApproved.length) return null;

  const refresh = () => {
    pending.reload();
    rejected.reload();
    onChanged?.();
  };

  const approve = async () => {
    const t = confirmApprove;
    if (assignToo) {
      setConfirmApprove(null);
      setAssigning(t);
      return;
    }
    setBusy(true);
    try {
      const res = await api.post(`/tenants/${t._id}/approve`, {});
      toast.success(res.data.message);
      setConfirmApprove(null);
      refresh();
      navigate(`/tenants/${t._id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!reason) return setReasonError('Please choose a reason.');
    if (reason === 'OTHER' && note.trim().length < 3) return setReasonError('Please write the reason.');
    setBusy(true);
    try {
      const res = await api.post(`/tenants/${rejecting._id}/reject`, { reason, note: reason === 'OTHER' ? note.trim() : undefined });
      toast.success(res.data.message);
      setRejecting(null);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const row = (t) => (
    <li key={t._id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-slate-900">{t.name}</p>
          <AccountStatusBadge status={t.status} />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="inline-flex min-w-0 items-center gap-1.5 break-all">
            <Mail className="h-4 w-4 shrink-0 text-slate-500" aria-hidden /> {t.email}
          </span>
          {t.phone && (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-4 w-4 text-slate-500" aria-hidden /> {t.phone}
            </span>
          )}
          <span className="text-slate-500">Registered {t.createdAt ? formatLongDate(t.createdAt) : ''}</span>
        </p>
      </div>
      <Button variant="secondary" onClick={() => setReviewing(t)} className="sm:shrink-0">
        Review
      </Button>
    </li>
  );

  return (
    <section ref={box} className={cx('card mb-4 overflow-hidden border-amber-200', highlight && 'ring-2 ring-amber-300')} aria-labelledby="signups-h">
      <header className="flex items-center gap-3 border-b border-amber-100 bg-amber-50/70 px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <UserPlus className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="signups-h" className="text-base font-bold text-slate-900">
            New Tenant Accounts
          </h2>
          <p className="text-sm text-slate-600">
            {items.length ? `${items.length} account${items.length > 1 ? 's' : ''} waiting for approval` : 'No accounts waiting for approval'}
          </p>
        </div>
      </header>
      {items.length > 0 && <ul className="divide-y divide-slate-100">{items.map(row)}</ul>}
      {notApproved.length > 0 && (
        <div className="border-t border-slate-100">
          <button type="button" onClick={() => setShowRejected((v) => !v)} className="flex min-h-11 w-full items-center justify-between px-5 text-sm font-semibold text-slate-600 hover:bg-slate-50" aria-expanded={showRejected}>
            Not approved ({notApproved.length})
            <ChevronDown className={cx('h-4 w-4 transition-transform', showRejected && 'rotate-180')} aria-hidden />
          </button>
          {showRejected && <ul className="divide-y divide-slate-100">{notApproved.map(row)}</ul>}
        </div>
      )}

      <ReviewModal
        tenant={reviewing}
        onClose={() => setReviewing(null)}
        onApprove={() => {
          setAssignToo(false);
          setConfirmApprove(reviewing);
          setReviewing(null);
        }}
        onReject={() => {
          setReason('');
          setNote('');
          setReasonError('');
          setRejecting(reviewing);
          setReviewing(null);
        }}
      />

      <Modal
        open={Boolean(confirmApprove)}
        onClose={() => setConfirmApprove(null)}
        title="Approve Tenant Account?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmApprove(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="success" icon={Check} onClick={approve} loading={busy}>
              {assignToo ? 'Approve & Choose Room' : 'Approve'}
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-slate-700">Once approved, {confirmApprove?.name} can sign in to the tenant app and access their account.</p>
        <Checkbox className="mt-4" label="Also assign a room now" description="You can also do this later from the tenant's page." checked={assignToo} onChange={(e) => setAssignToo(e.target.checked)} />
      </Modal>

      <AssignRoomModal
        open={Boolean(assigning)}
        mode="approve"
        tenant={assigning}
        onClose={() => setAssigning(null)}
        onDone={() => {
          const id = assigning?._id;
          refresh();
          if (id) navigate(`/tenants/${id}`);
        }}
      />

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title={`Reject ${rejecting?.name ?? ''}'s account?`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={reject} loading={busy}>
              Reject Account
            </Button>
          </>
        }
      >
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-800">Reason for rejection</legend>
          <div className="space-y-1">
            {REJECT_REASONS.map((r) => (
              <label key={r.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-slate-50">
                <input
                  type="radio"
                  name="reject-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => {
                    setReason(r.value);
                    setReasonError('');
                  }}
                  className="h-5 w-5"
                />
                <span className="text-[15px] text-slate-800">{r.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {reason === 'OTHER' && <Textarea className="mt-3" label="Write the reason" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}
        {reasonError && <p className="mt-2 text-sm text-red-600">{reasonError}</p>}
        <p className="mt-3 text-sm text-slate-500">The account is kept, not deleted. The person sees “Your account is currently not approved” and this reason when they open the app.</p>
      </Modal>
    </section>
  );
}
