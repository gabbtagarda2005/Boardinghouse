import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Alert, Button, Input, Modal, Select, Textarea } from '../../components/ui';
import { METHOD_LABELS, peso, periodLabel, toDateInput } from '../../utils/format';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** Record money you received yourself (e.g. cash). It's confirmed right away. */
export default function RecordPaymentModal({ open, onClose, presetTenant, presetBill, onDone }) {
  const toast = useToast();
  const [tenantId, setTenantId] = useState('');
  const [billId, setBillId] = useState('');
  const [form, setForm] = useState({ amount: '', paymentMethod: 'CASH', provider: '', referenceNumber: '', paymentDate: toDateInput(), notes: '' });
  const [requestId, setRequestId] = useState(newId());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const tenants = useApi(open && !presetTenant ? '/tenants' : null);
  const bills = useApi(open && tenantId ? '/bills' : null, { tenantId, state: 'PUBLISHED' });

  useEffect(() => {
    if (!open) return;
    setTenantId(presetTenant?._id || '');
    setBillId(presetBill?._id || '');
    setForm({ amount: presetBill ? String(presetBill.remainingBalance) : '', paymentMethod: 'CASH', provider: '', referenceNumber: '', paymentDate: toDateInput(), notes: '' });
    setRequestId(newId());
    setError('');
  }, [open, presetTenant, presetBill]);

  const unpaid = useMemo(() => (bills.data?.items || []).filter((b) => b.remainingBalance > 0).sort((a, b) => a.billingYear - b.billingYear || a.billingMonth - b.billingMonth), [bills.data]);
  const owed = unpaid.reduce((s, b) => s + b.remainingBalance, 0);
  useEffect(() => {
    if (!presetBill && unpaid.length && !billId) {
      setBillId(unpaid[0]._id);
      setForm((f) => ({ ...f, amount: f.amount || String(unpaid[0].remainingBalance) }));
    }
  }, [unpaid, billId, presetBill]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const tenantOptions = (tenants.data?.items || []).filter((t) => t.balance > 0).map((t) => ({ value: t._id, label: `${t.name} · owes ${peso(t.balance)}` }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const amount = Number(form.amount);
    if (!tenantId) return setError('Please choose a tenant.');
    if (!(amount > 0)) return setError('Please enter the amount you received.');
    if (unpaid.length && amount > owed + 0.001) return setError(`That's more than the tenant owes (${peso(owed)}).`);
    if (form.paymentMethod !== 'CASH' && !form.referenceNumber.trim()) return setError('Please enter the reference number for non-cash payments.');
    setSaving(true);
    try {
      await api.post('/payments', { tenantId, billId: billId || undefined, amount, paymentMethod: form.paymentMethod, provider: form.provider || undefined, referenceNumber: form.referenceNumber || undefined, paymentDate: form.paymentDate, notes: form.notes || undefined, clientRequestId: requestId });
      toast.success('Payment recorded and receipt created.');
      onDone?.();
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
      title="Record a Payment You Received"
      fullScreenMobile
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="record-payment" loading={saving}>
            Record Payment
          </Button>
        </>
      }
    >
      <form id="record-payment" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {presetTenant ? (
          <p className="text-[15px]">
            Tenant: <strong>{presetTenant.name}</strong>
          </p>
        ) : (
          <Select
            label="Tenant"
            required
            value={tenantId}
            onChange={(e) => {
              setTenantId(e.target.value);
              setBillId('');
              setForm((f) => ({ ...f, amount: '' }));
            }}
            placeholder={tenants.loading ? 'Loading…' : tenantOptions.length ? 'Choose a tenant who owes money' : 'Nobody owes money right now'}
            options={tenantOptions}
          />
        )}
        {tenantId && (
          <Select
            label="For which bill?"
            value={billId}
            onChange={(e) => {
              setBillId(e.target.value);
              const b = unpaid.find((x) => x._id === e.target.value);
              if (b) setForm((f) => ({ ...f, amount: String(b.remainingBalance) }));
            }}
            options={unpaid.map((b) => ({ value: b._id, label: `${periodLabel(b.billingYear, b.billingMonth)} · ${peso(b.remainingBalance)} left` }))}
            placeholder={bills.loading ? 'Loading…' : unpaid.length ? undefined : 'No unpaid bills'}
            hint={unpaid.length > 1 ? `Total owed: ${peso(owed)}. Extra money goes to the oldest unpaid bill.` : undefined}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Amount received (₱)" type="number" inputMode="decimal" min="0.01" step="0.01" required value={form.amount} onChange={set('amount')} hint="The amount you actually received" />
          <Input label="Date received" type="date" required value={form.paymentDate} max={toDateInput()} onChange={set('paymentDate')} />
          <Select label="How was it paid?" value={form.paymentMethod} onChange={set('paymentMethod')} options={Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }))} />
          {form.paymentMethod === 'BANK_TRANSFER' && <Input label="Bank" value={form.provider} onChange={set('provider')} placeholder="e.g. BDO" />}
        </div>
        {form.paymentMethod !== 'CASH' && <Input label="Reference number" required autoComplete="off" autoCapitalize="characters" spellCheck={false} value={form.referenceNumber} onChange={set('referenceNumber')} hint="From the GCash, Maya or bank receipt" />}
        <Textarea label="Notes (optional)" value={form.notes} onChange={set('notes')} rows={2} />
      </form>
    </Modal>
  );
}
