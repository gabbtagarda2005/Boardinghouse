import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CircleCheck, CircleX, CreditCard, Download, Image as ImageIcon, Undo2, X } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Alert, Button, ConfirmDialog, Input, Modal, Spinner, StatusBadge, Textarea, cx } from './ui';
import { REJECTION_REASONS, formatDateTime, formatLongDate, methodLabel, peso, periodLabel } from '../utils/format';
import { downloadFile, fetchObjectUrl } from '../utils/download';

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-[15px] font-medium text-slate-900 sm:text-right">{children}</dd>
    </div>
  );
}

function ProofViewer({ paymentId }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let url;
    fetchObjectUrl(`/payments/${paymentId}/proof`)
      .then((r) => {
        url = r.url;
        setState({ url: r.url, type: r.type });
      })
      .catch((e) => setState({ error: errorMessage(e, 'We couldn’t open the payment proof.') }));
    return () => url && URL.revokeObjectURL(url);
  }, [paymentId]);
  if (state.loading) return <Spinner label="Opening payment proof…" className="py-6" />;
  if (state.error) return <Alert tone="error">{state.error}</Alert>;
  if (state.type === 'application/pdf')
    return (
      <a href={state.url} target="_blank" rel="noreferrer" className="font-semibold text-navy-300 underline">
        Open the payment proof (PDF)
      </a>
    );
  return (
    <a href={state.url} target="_blank" rel="noreferrer" title="Open full size">
      <img src={state.url} alt="Payment proof sent by the tenant" className="max-h-[28rem] w-full rounded-xl border border-slate-200 bg-slate-50 object-contain" />
    </a>
  );
}

function RejectDialog({ open, onClose, onReject, busy }) {
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) {
      setCode('');
      setNote('');
    }
  }, [open]);
  const needNote = code === 'OTHER';
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Why are you rejecting this payment?"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} disabled={!code || (needNote && note.trim().length < 3)} onClick={() => onReject(code, note.trim())}>
            Reject Payment
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="sr-only">Reason</legend>
        {REJECTION_REASONS.map((r) => (
          <label key={r.value} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-[15px]', code === r.value ? 'border-navy-500 bg-navy-50' : 'border-slate-200 hover:bg-slate-50')}>
            <input type="radio" name="reject-reason" value={r.value} checked={code === r.value} onChange={() => setCode(r.value)} className="h-4 w-4" />
            {r.label}
          </label>
        ))}
      </fieldset>
      <Textarea className="mt-4" label={needNote ? 'Please explain' : 'Note for the tenant (optional)'} required={needNote} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      <p className="mt-2 text-xs text-slate-500">The tenant will see this reason and can send the payment again.</p>
    </Modal>
  );
}

/** Friendly payment window: everything the owner needs to verify a payment. */
/** `initialAction` ('confirm' | 'reject') opens that step straight away, e.g. from the buttons on a phone card. */
export default function PaymentDetailsModal({ paymentId, onClose, onChanged, initialAction }) {
  const toast = useToast();
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showProof, setShowProof] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [received, setReceived] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!paymentId) return;
    setPayment(null);
    setError('');
    setShowProof(false);
    setConfirmed(null);
    api
      .get(`/payments/${paymentId}`)
      .then((r) => {
        setPayment(r.data.payment);
        setReceived(String(r.data.payment.amount));
        setNote('');
        if (initialAction && r.data.payment.status === 'PENDING_VERIFICATION') setAction(initialAction);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [paymentId, initialAction]);

  const run = async (fn, msg) => {
    setBusy(true);
    try {
      const res = await fn();
      setPayment((p) => ({ ...p, ...res.data.payment }));
      if (msg) toast.success(msg);
      setAction(null);
      onChanged?.();
      window.dispatchEvent(new Event('payments:changed')); // refresh the sidebar badge
      return res.data.payment;
    } catch (e) {
      toast.error(errorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const changed = payment && Number(received) !== payment.amount;
  const pending = payment?.status === 'PENDING_VERIFICATION';

  let head = null;
  if (payment) {
    head = {
      PENDING_VERIFICATION: { icon: CreditCard, tone: 'bg-amber-50 text-amber-800', title: 'Payment Submitted', text: `${payment.tenantName} submitted a payment. Please check that you received it.` },
      CONFIRMED: { icon: CircleCheck, tone: 'bg-emerald-50 text-emerald-800', title: 'Payment Confirmed', text: payment.source === 'ADMIN' ? `You recorded a payment from ${payment.tenantName}.` : `${payment.tenantName}'s payment was checked and confirmed.` },
      REJECTED: { icon: CircleX, tone: 'bg-slate-100 text-slate-700', title: 'Payment Rejected', text: `${payment.tenantName}'s payment was not accepted.` },
      REVERSED: { icon: Undo2, tone: 'bg-slate-100 text-slate-700', title: 'Payment Reversed', text: `This payment was reversed. The amount is owed again.` },
    }[payment.status];
  }

  return (
    <Modal open={Boolean(paymentId)} onClose={onClose} title="Payment Details" size="lg">
      {error && <Alert tone="error">{error}</Alert>}
      {!payment && !error && <Spinner />}

      {confirmed && (
        <div className="py-6 text-center" role="status">
          <CircleCheck className="mx-auto h-16 w-16 text-emerald-600" aria-hidden />
          <p className="mt-3 text-2xl font-bold text-slate-900">Payment Confirmed</p>
          <p className="mt-1 text-slate-600">
            {confirmed.tenantName}&apos;s payment of <strong>{peso(confirmed.amount)}</strong> has been recorded.
          </p>
          <p className="mt-1 text-sm text-slate-500">The bill balance was updated, a receipt was created, and {confirmed.tenantName.split(' ')[0]} was notified.</p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="secondary" icon={Download} onClick={() => downloadFile(`/payments/${confirmed._id}/receipt.pdf`, 'receipt.pdf').catch((e) => toast.error(errorMessage(e)))}>
              Download Receipt
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}

      {payment && !confirmed && (
        <div>
          <div className={cx('flex items-start gap-3 rounded-xl p-4', head.tone)}>
            <head.icon className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
            <div>
              <p className="text-base font-bold">{head.title}</p>
              <p className="text-sm">{head.text}</p>
            </div>
          </div>
          <dl className="mt-2">
            <Row label="Tenant">
              <Link to={`/tenants/${payment.tenantId}`} className="text-navy-300 hover:underline">
                {payment.tenantName}
              </Link>
            </Row>
            <Row label="Amount">
              <span className="text-xl font-bold">{peso(payment.amount)}</span>
            </Row>
            <Row label="Payment Method">{methodLabel(payment.paymentMethod, payment.provider)}</Row>
            <Row label="Reference Number">{payment.referenceNumber || 'None given'}</Row>
            <Row label="Payment Date">{formatLongDate(payment.paymentDate)}</Row>
            <Row label={payment.source === 'ADMIN' ? 'Recorded' : 'Submitted'}>{formatDateTime(payment.submittedAt)}</Row>
            <Row label="Status">
              <StatusBadge status={payment.status} />
            </Row>
            {payment.bill && pending && <Row label="For the bill of">{periodLabel(payment.bill.billingYear, payment.bill.billingMonth)}</Row>}
            {payment.allocations?.length > 0 && (
              <Row label="Paid for">
                <span className="flex flex-col sm:items-end">
                  {payment.allocations.map((a) => (
                    <Link key={a.billId} to={`/bills/${a.billId}`} className="text-navy-300 hover:underline">
                      {periodLabel(a.billingYear, a.billingMonth)} bill: {peso(a.amount)}
                    </Link>
                  ))}
                </span>
              </Row>
            )}
            {payment.receiptNumber && <Row label="Receipt Number">{payment.receiptNumber}</Row>}
            {payment.verifiedAt && !pending && (
              <Row label="Checked">
                {formatDateTime(payment.verifiedAt)}
                {payment.verifiedByName ? ` by ${payment.verifiedByName}` : ''}
              </Row>
            )}
            {payment.rejectionReason && <Row label="Reason">{payment.rejectionReason}</Row>}
            {payment.notes && (
              <Row label="Notes">
                <span className="whitespace-pre-line">{payment.notes}</span>
              </Row>
            )}
          </dl>

          <div className="mt-4">
            <p className="mb-2 text-sm text-slate-500">Payment Proof</p>
            {payment.hasProof ? (
              showProof ? (
                <ProofViewer paymentId={payment._id} />
              ) : (
                <Button variant="secondary" icon={ImageIcon} onClick={() => setShowProof(true)}>
                  View Payment Proof
                </Button>
              )
            ) : (
              <p className="text-sm text-slate-500">No proof was attached.</p>
            )}
          </div>

          {pending && (
            <Alert tone="info" className="mt-4">
              Before confirming, check your GCash, bank or cash records to make sure you received this amount. The bill only changes after you confirm.
            </Alert>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            {pending && (
              <>
                <Button variant="danger" icon={X} size="lg" onClick={() => setAction('reject')}>
                  Reject Payment
                </Button>
                <Button variant="success" icon={Check} size="lg" onClick={() => setAction('confirm')}>
                  Confirm Payment
                </Button>
              </>
            )}
            {payment.status === 'CONFIRMED' && (
              <>
                <Button variant="secondary" icon={Undo2} onClick={() => setAction('reverse')}>
                  Reverse Payment
                </Button>
                <Button icon={Download} onClick={() => downloadFile(`/payments/${payment._id}/receipt.pdf`, `${payment.receiptNumber}.pdf`).catch((e) => toast.error(errorMessage(e)))}>
                  Download Receipt
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <Modal
        open={action === 'confirm'}
        onClose={() => setAction(null)}
        title="Confirm this payment?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="success"
              loading={busy}
              disabled={!(Number(received) > 0) || (changed && note.trim().length < 3)}
              onClick={async () => {
                const p = await run(() => api.post(`/payments/${paymentId}/confirm`, changed ? { amount: Number(received), note } : {}));
                if (p) setConfirmed(p);
              }}
            >
              Yes, Confirm Payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">The amount will be taken off the tenant&apos;s balance, a receipt will be created, and the tenant will be notified.</p>
          <Input label="Amount you received (₱)" type="number" min="0.01" step="0.01" value={received} onChange={(e) => setReceived(e.target.value)} hint="Change this only if you received a different amount" />
          {changed && <Textarea label="Why is the amount different?" required value={note} onChange={(e) => setNote(e.target.value)} rows={2} />}
        </div>
      </Modal>
      <RejectDialog
        open={action === 'reject'}
        busy={busy}
        onClose={() => setAction(null)}
        onReject={(reasonCode, n) => run(() => api.post(`/payments/${paymentId}/reject`, { reasonCode, note: n || undefined }), 'Payment rejected. The tenant has been notified.')}
      />
      <ConfirmDialog
        open={action === 'reverse'}
        onClose={() => setAction(null)}
        title="Reverse this payment?"
        message="Use this only to fix a mistake. The amount will be added back to the tenant's balance and the tenant will be notified."
        tone="danger"
        confirmLabel="Reverse Payment"
        requireReason
        loading={busy}
        onConfirm={(reason) => run(() => api.post(`/payments/${paymentId}/reverse`, { reason }), 'Payment reversed.')}
      />
    </Modal>
  );
}
