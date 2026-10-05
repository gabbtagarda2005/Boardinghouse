import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BellRing, ChevronLeft, Download, Pencil, Plus, Send, SlidersHorizontal, Trash2, Wallet, XCircle } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Alert, Button, Card, ConfirmDialog, ErrorState, IconButton, Input, Modal, PageHeader, StatusBadge, Textarea, cx, PageSkeleton } from '../../components/ui';
import { formatDateTime, formatLongDate, methodLabel, peso, periodLabel, toDateInput, SHARING_LABELS } from '../../utils/format';
import { downloadFile } from '../../utils/download';
import RecordPaymentModal from '../payments/RecordPaymentModal';
import PaymentDetailsModal from '../../components/PaymentDetailsModal';

function Lines({ label, items, onChange, discount }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="label mb-0">{label}</p>
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...items, { label: '', amount: '' }])}>
          Add
        </Button>
      </div>
      {items.length === 0 && <p className="text-sm text-slate-500">None</p>}
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <input className="input" placeholder="What is it for?" aria-label={`${label} description`} value={it.label} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <input className="input w-36 text-right" type="number" step="0.01" min={0} placeholder="0.00" aria-label={`${label} amount`} value={it.amount} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
            <IconButton icon={Trash2} label="Remove" className="text-red-600 hover:bg-red-50" onClick={() => onChange(items.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>
      {discount && <p className="mt-1 text-xs text-slate-500">Enter discounts as positive amounts; they are taken off the total.</p>}
    </div>
  );
}

function EditBillModal({ open, onClose, bill, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open && bill) {
      setForm({
        rent: String(bill.rent),
        electricity: String(bill.electricity),
        water: String(bill.water),
        dueDate: toDateInput(bill.dueDate),
        notes: bill.notes || '',
        otherCharges: (bill.otherCharges || []).map((c) => ({ label: c.label, amount: String(c.amount) })),
        discounts: (bill.adjustments || []).filter((c) => c.amount < 0).map((c) => ({ label: c.label, amount: String(-c.amount) })),
      });
      setError('');
    }
  }, [open, bill]);
  if (!form) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const clean = (arr, sign = 1) => arr.filter((x) => x.label.trim() && x.amount !== '').map((x) => ({ label: x.label.trim(), amount: sign * Math.abs(Number(x.amount)) }));
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.patch(`/bills/${bill._id}`, {
        rent: Number(form.rent),
        electricity: Number(form.electricity),
        water: Number(form.water),
        dueDate: form.dueDate,
        notes: form.notes,
        otherCharges: clean(form.otherCharges),
        adjustments: [...clean(form.discounts, -1), ...(bill.adjustments || []).filter((c) => c.amount > 0)],
      });
      toast.success('Bill saved. The total was updated.');
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit ${bill.tenantName}'s bill`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="bill-form" loading={saving}>
            Save Changes
          </Button>
        </>
      }
    >
      <form id="bill-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Monthly rent (₱)" type="number" min={0} step="0.01" value={form.rent} onChange={set('rent')} />
          <Input label="Electricity (₱)" type="number" min={0} step="0.01" value={form.electricity} onChange={set('electricity')} hint="Changing this replaces the amount from the meter reading" />
          <Input label="Water (₱)" type="number" min={0} step="0.01" value={form.water} onChange={set('water')} />
          <Input label="Due date" type="date" value={form.dueDate} onChange={set('dueDate')} />
        </div>
        <Lines label="Other charges" items={form.otherCharges} onChange={(v) => setForm((f) => ({ ...f, otherCharges: v }))} />
        <Lines label="Discounts" items={form.discounts} onChange={(v) => setForm((f) => ({ ...f, discounts: v }))} discount />
        <Textarea label="Note for the tenant (optional)" value={form.notes} onChange={set('notes')} rows={2} />
      </form>
    </Modal>
  );
}

function AdjustModal({ open, onClose, bill, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ kind: 'discount', label: '', amount: '', reason: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setF({ kind: 'discount', label: '', amount: '', reason: '' });
      setError('');
    }
  }, [open]);
  const submit = async (e) => {
    e.preventDefault();
    const amt = Math.abs(Number(f.amount));
    if (!f.label.trim() || !(amt > 0) || f.reason.trim().length < 3) return setError('Please fill in what it is for, the amount and the reason.');
    setSaving(true);
    try {
      await api.post(`/bills/${bill._id}/adjustments`, { label: f.label.trim(), amount: f.kind === 'discount' ? -amt : amt, reason: f.reason.trim() });
      toast.success('Bill updated. The tenant has been notified.');
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a discount or extra charge"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="adjust-form" loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {[
            ['discount', 'Discount'],
            ['charge', 'Extra charge'],
          ].map(([v, l]) => (
            <label key={v} className={cx('flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3', f.kind === v ? 'border-navy-500 bg-navy-50' : 'border-slate-200')}>
              <input type="radio" name="kind" checked={f.kind === v} onChange={() => setF({ ...f, kind: v })} /> {l}
            </label>
          ))}
        </div>
        <Input label="What is it for?" required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. Water interruption" />
        <Input label="Amount (₱)" type="number" min="0.01" step="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <Textarea label="Reason (saved in Activity History)" required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={2} />
      </form>
    </Modal>
  );
}

export default function BillDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(`/bills/${id}`);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [paymentId, setPaymentId] = useState(null);

  if (loading && !data) return <PageSkeleton label="Loading bill…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const { bill, payments, history } = data;
  const isDraft = bill.state === 'DRAFT';
  const isSent = bill.state === 'PUBLISHED';
  const ed = bill.electricityDetail || {};

  const act = async (fn, msg, after) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      setModal(null);
      if (after) after();
      else reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const rows = [
    ['Monthly Rent', bill.rent],
    ['Electricity', bill.electricity, ed.consumption != null && ed.rate ? `Room used ${ed.consumption} kWh × ${peso(ed.rate)} = ${peso(ed.roomTotal)} · ${SHARING_LABELS[ed.sharingMethod] || ''}${ed.manualOverride ? ' (amount changed by you)' : ''}` : null],
    ['Water', bill.water],
    ...(bill.otherCharges || []).map((c) => [c.label, c.amount]),
    ...(bill.adjustments || []).map((c) => [c.amount < 0 ? `Discount: ${c.label}` : c.label, c.amount]),
  ];

  return (
    <>
      <Link to="/bills" className="mb-3 hidden items-center gap-1 text-sm font-medium text-slate-500 hover:text-navy-300 md:inline-flex">
        <ChevronLeft className="h-4 w-4" /> All bills
      </Link>
      <PageHeader
        keepTitleOnMobile
        title={`${bill.tenantName} · ${periodLabel(bill.billingYear, bill.billingMonth)}`}
        subtitle={`Room ${bill.roomNumber}${bill.bedNumber ? `, Bed ${bill.bedNumber}` : ''}`}
        actions={
          <>
            {isDraft && (
              <>
                <Button variant="secondary" icon={Pencil} onClick={() => setModal('edit')}>
                  Edit Bill
                </Button>
                <Button variant="danger" icon={Trash2} onClick={() => setModal('void')}>
                  Delete Bill
                </Button>
                <Button icon={Send} onClick={() => setModal('send')}>
                  Send to Tenant
                </Button>
              </>
            )}
            {isSent && (
              <>
                <Button variant="secondary" icon={Download} onClick={() => downloadFile(`/bills/${id}/statement.pdf`, 'bill.pdf').catch((e) => toast.error(errorMessage(e)))}>
                  Download Bill
                </Button>
                <Button variant="secondary" icon={SlidersHorizontal} onClick={() => setModal('adjust')}>
                  Discount / Extra Charge
                </Button>
                {bill.remainingBalance > 0 && (
                  <>
                    <Button variant="secondary" icon={BellRing} loading={busy && !modal} onClick={() => act(() => api.post(`/bills/${id}/remind`, {}), `Reminder sent to ${bill.tenantName}.`)}>
                      Send Reminder
                    </Button>
                    <Button icon={Wallet} onClick={() => setModal('payment')}>
                      Record Payment
                    </Button>
                  </>
                )}
                {bill.amountPaid === 0 && (
                  <Button variant="danger" icon={XCircle} onClick={() => setModal('void')}>
                    Cancel Bill
                  </Button>
                )}
              </>
            )}
          </>
        }
      />
      {isDraft && <Alert tone="info" className="mb-4">This bill has not been sent yet. The tenant can&apos;t see it until you press “Send to Tenant”.</Alert>}
      {bill.state === 'VOID' && <Alert tone="error" className="mb-4" title="This bill was cancelled">{bill.voidReason}</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Bill for ${periodLabel(bill.billingYear, bill.billingMonth)}`} actions={<StatusBadge status={isSent ? bill.status : bill.state} />}>
            <dl className="divide-y divide-slate-100">
              {rows.map(([label, amount, sub], i) => (
                <div key={i} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-[15px] text-slate-700">
                    {label}
                    {sub && <span className="block text-xs text-slate-500">{sub}</span>}
                  </dt>
                  <dd className={cx('text-[15px] tabular-nums', amount < 0 ? 'text-emerald-700' : 'text-slate-900')}>{peso(amount)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 space-y-1.5 border-t-2 border-slate-200 pt-3">
              <div className="flex justify-between text-lg font-bold">
                <span>TOTAL</span>
                <span className="tabular-nums">{peso(bill.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-[15px] text-slate-600">
                <span>Amount Paid</span>
                <span className="text-emerald-700 tabular-nums">{peso(bill.amountPaid)}</span>
              </div>
              <div className="flex justify-between text-[15px] font-bold">
                <span>Remaining Balance</span>
                <span className="tabular-nums">{peso(bill.remainingBalance)}</span>
              </div>
              <div className="flex justify-between text-[15px] text-slate-600">
                <span>Due Date</span>
                <span>{formatLongDate(bill.dueDate)}</span>
              </div>
            </div>
            {bill.previousBalance > 0 && (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {bill.tenantName.split(' ')[0]} also has <strong>{peso(bill.previousBalance)}</strong> unpaid from earlier bills.
              </p>
            )}
            {bill.notes && <p className="mt-4 text-sm text-slate-600">Note: {bill.notes}</p>}
          </Card>

          <Card title="Payments for this bill" bodyClassName="p-0">
            {payments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <li key={p._id}>
                    <button type="button" onClick={() => setPaymentId(p._id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-3 text-left hover:bg-slate-50">
                      <div>
                        <p className="font-semibold">{peso(p.allocations?.find((a) => a.billId === bill._id)?.amount ?? p.amount)}</p>
                        <p className="text-sm text-slate-500">
                          {methodLabel(p.paymentMethod, p.provider)} · {formatDateTime(p.submittedAt)}
                        </p>
                      </div>
                      <StatusBadge status={p.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="History" bodyClassName="p-0">
          <ul className="divide-y divide-slate-100">
            {history.map((h) => (
              <li key={h.key} className="px-5 py-3 text-sm">
                <p className="font-semibold text-slate-800">{h.title}</p>
                <p className="text-slate-600">{h.description}</p>
                {h.reason && <p className="text-xs text-slate-500">Reason: {h.reason}</p>}
                <p className="text-xs text-slate-500">
                  {formatDateTime(h.createdAt)} · {h.doneBy}
                </p>
              </li>
            ))}
            {history.length === 0 && <li className="px-5 py-4 text-sm text-slate-500">No changes yet.</li>}
          </ul>
        </Card>
      </div>

      <EditBillModal open={modal === 'edit'} onClose={() => setModal(null)} bill={bill} onSaved={reload} />
      <AdjustModal open={modal === 'adjust'} onClose={() => setModal(null)} bill={bill} onSaved={reload} />
      <RecordPaymentModal open={modal === 'payment'} onClose={() => setModal(null)} presetTenant={{ _id: bill.tenantId, name: bill.tenantName }} presetBill={bill} onDone={reload} />
      <PaymentDetailsModal paymentId={paymentId} onClose={() => setPaymentId(null)} onChanged={reload} />
      <ConfirmDialog open={modal === 'send'} onClose={() => setModal(null)} title="Send this bill?" message={`${bill.tenantName} will be notified and can see this bill in the app.`} confirmLabel="Send Bill" loading={busy} onConfirm={() => act(() => api.post('/bills/publish', { billIds: [id] }), 'Bill sent to the tenant.')} />
      <ConfirmDialog
        open={modal === 'void'}
        onClose={() => setModal(null)}
        title={isDraft ? 'Delete this bill?' : 'Cancel this bill?'}
        message={isDraft ? 'The bill will be deleted. You can create it again later.' : `The bill will be cancelled and ${bill.tenantName} will be notified.`}
        tone="danger"
        confirmLabel={isDraft ? 'Delete Bill' : 'Cancel Bill'}
        requireReason
        loading={busy}
        onConfirm={(reason) => act(() => api.post(`/bills/${id}/void`, { reason }), isDraft ? 'Bill deleted.' : 'Bill cancelled.', isDraft ? () => navigate('/bills') : undefined)}
      />
    </>
  );
}
