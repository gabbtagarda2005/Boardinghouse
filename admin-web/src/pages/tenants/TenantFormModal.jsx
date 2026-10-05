import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Alert, Button, Input, Modal, Select, Textarea } from '../../components/ui';
import { peso, toDateInput } from '../../utils/format';

const EMPTY = { name: '', email: '', phone: '', moveInDate: toDateInput(), roomId: '', bedNumber: '', address: '', occupation: '', birthDate: '', notes: '', ec: { name: '', phone: '', relationship: '' } };

/** Add a tenant (creates their app login) or edit their details. */
export default function TenantFormModal({ open, onClose, tenant, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [more, setMore] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const rooms = useApi(open && !tenant ? '/rooms' : null);
  const detail = useApi(open && form.roomId ? `/rooms/${form.roomId}` : null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setError('');
    setCreated(null);
    setMore(Boolean(tenant));
    setForm(
      tenant
        ? {
            ...EMPTY,
            name: tenant.name || '',
            email: tenant.email || '',
            phone: tenant.phone || '',
            moveInDate: tenant.moveInDate ? toDateInput(tenant.moveInDate) : '',
            address: tenant.address || '',
            occupation: tenant.occupation || '',
            birthDate: tenant.birthDate ? toDateInput(tenant.birthDate) : '',
            notes: tenant.notes || '',
            ec: { name: '', phone: '', relationship: '', ...(tenant.emergencyContact || {}) },
          }
        : { ...EMPTY, moveInDate: toDateInput() }
    );
  }, [open, tenant]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setEc = (k) => (e) => setForm((f) => ({ ...f, ec: { ...f.ec, [k]: e.target.value } }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Please enter the full name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Please enter a valid email';
    if (form.phone && !/^[0-9+()\-\s]{7,20}$/.test(form.phone)) errs.phone = 'Please enter a valid phone number';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setError('');
    const body = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      moveInDate: form.moveInDate || undefined,
      address: form.address,
      occupation: form.occupation,
      birthDate: form.birthDate || undefined,
      notes: form.notes,
      emergencyContact: form.ec,
    };
    try {
      if (tenant) {
        await api.patch(`/tenants/${tenant._id}`, body);
        toast.success('Changes saved.');
        onSaved?.();
        onClose();
      } else {
        if (form.roomId) Object.assign(body, { roomId: form.roomId, bedNumber: form.bedNumber ? Number(form.bedNumber) : undefined });
        const res = await api.post('/tenants', body);
        setCreated(res.data);
        onSaved?.(res.data.tenant);
      }
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return (
      <Modal open={open} onClose={onClose} title="Tenant added" footer={<Button onClick={onClose}>Done</Button>}>
        <div className="space-y-4 text-[15px]">
          <Alert tone="success">
            <strong>{created.tenant.name}</strong> was added{created.tenant.currentRoomNumber ? ` to Room ${created.tenant.currentRoomNumber}` : ''}.
          </Alert>
          <p>They can sign in to the tenant app with:</p>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p>
              Email: <strong>{created.tenant.email}</strong>
            </p>
            {created.temporaryPassword && (
              <p>
                Temporary password: <strong className="font-mono">{created.temporaryPassword}</strong>
              </p>
            )}
          </div>
          {created.temporaryPassword && (
            <p className="text-sm text-slate-600">
              Please write this down or send it to the tenant now; it won&apos;t be shown again. They will choose their own password the first time they sign in.
              {created.credentialsEmailed && ' We also emailed it to them.'}
            </p>
          )}
        </div>
      </Modal>
    );
  }

  const roomOptions = (rooms.data?.items || []).filter((r) => r.availableBeds > 0).map((r) => ({ value: r._id, label: `Room ${r.roomNumber} · ${r.availableBeds} free · ${peso(r.monthlyRent)}/month` }));
  const bedOptions = (detail.data?.beds || []).filter((b) => !b.occupied).map((b) => ({ value: String(b.bedNumber), label: `Bed ${b.bedNumber}` }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tenant ? `Edit ${tenant.name}` : 'Add Tenant'}
      size="lg"
      fullScreenMobile
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="tenant-form" loading={saving}>
            {tenant ? 'Save Changes' : 'Add Tenant'}
          </Button>
        </>
      }
    >
      <form id="tenant-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" required value={form.name} onChange={set('name')} error={errors.name} autoComplete="off" autoCapitalize="words" />
          <Input label="Email (for signing in to the app)" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} required value={form.email} onChange={set('email')} error={errors.email} autoComplete="off" hint="The tenant signs in to the app with this email" />
          <Input label="Phone number" type="tel" inputMode="tel" autoComplete="off" value={form.phone} onChange={set('phone')} error={errors.phone} placeholder="09xx xxx xxxx" />
          <Input label="Move-in date" type="date" value={form.moveInDate} onChange={set('moveInDate')} />
        </div>
        {!tenant && (
          <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            <Select label="Room (optional)" value={form.roomId} onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value, bedNumber: '' }))} placeholder="Assign later" options={roomOptions} />
            <Select label="Bed" value={form.bedNumber} onChange={set('bedNumber')} placeholder="First free bed" options={bedOptions} disabled={!form.roomId} />
          </div>
        )}
        <button type="button" onClick={() => setMore((m) => !m)} className="flex items-center gap-1 text-sm font-semibold text-navy-300" aria-expanded={more}>
          <ChevronDown className={`h-4 w-4 transition-transform ${more ? 'rotate-180' : ''}`} aria-hidden /> More details (optional)
        </button>
        {more && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="School or workplace" value={form.occupation} onChange={set('occupation')} />
              <Input label="Birthday" type="date" value={form.birthDate} onChange={set('birthDate')} />
              <Textarea label="Home address" value={form.address} onChange={set('address')} rows={2} className="sm:col-span-2" />
            </div>
            <fieldset className="grid gap-4 sm:grid-cols-3">
              <legend className="mb-1 text-sm font-semibold text-slate-700">In case of emergency, contact</legend>
              <Input label="Name" autoComplete="off" autoCapitalize="words" value={form.ec.name} onChange={setEc('name')} />
              <Input label="Phone" type="tel" inputMode="tel" autoComplete="off" value={form.ec.phone} onChange={setEc('phone')} />
              <Input label="Relationship" value={form.ec.relationship} onChange={setEc('relationship')} placeholder="e.g. Mother" />
            </fieldset>
            <Textarea label="Private notes (only you can see these)" value={form.notes} onChange={set('notes')} rows={2} />
          </div>
        )}
      </form>
    </Modal>
  );
}
