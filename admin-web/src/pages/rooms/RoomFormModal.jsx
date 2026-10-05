import { useEffect, useState } from 'react';
import { api, errorMessage, fieldErrors } from '../../api/client';
import { Alert, Button, Checkbox, Input, Modal, Textarea } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { AMENITIES } from '../../utils/format';

const EMPTY = { roomNumber: '', name: '', building: '', capacity: 1, monthlyRent: '', description: '', amenities: [], other: '', underMaintenance: false };

export default function RoomFormModal({ open, onClose, room, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setError('');
    if (room) {
      const list = room.amenities || [];
      setForm({
        roomNumber: room.roomNumber,
        name: room.name || '',
        building: room.building || '',
        capacity: room.capacity,
        monthlyRent: room.monthlyRent,
        description: room.description || '',
        amenities: list.filter((a) => AMENITIES.includes(a)),
        other: list.filter((a) => !AMENITIES.includes(a)).join(', '),
        underMaintenance: Boolean(room.underMaintenance),
      });
    } else setForm(EMPTY);
  }, [open, room]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const toggleAmenity = (a) => setForm((f) => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a] }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.roomNumber.trim()) errs.roomNumber = 'Please enter the room number';
    if (!(Number(form.capacity) >= 1)) errs.capacity = 'A room needs at least 1 bed';
    if (form.monthlyRent === '' || Number(form.monthlyRent) < 0) errs.monthlyRent = 'Please enter the monthly rent';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setError('');
    const amenities = [
      ...form.amenities,
      ...form.other
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    ];
    const body = { roomNumber: form.roomNumber.trim(), name: form.name, building: form.building, capacity: Number(form.capacity), monthlyRent: Number(form.monthlyRent), description: form.description, amenities, underMaintenance: form.underMaintenance };
    try {
      const res = room ? await api.patch(`/rooms/${room._id}`, body) : await api.post('/rooms', body);
      toast.success(room ? 'Changes saved.' : `Room ${body.roomNumber} was added.`);
      onSaved?.(res.data.room);
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={room ? `Edit Room ${room.roomNumber}` : 'Add a Room'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="room-form" loading={saving}>
            {room ? 'Save Changes' : 'Add Room'}
          </Button>
        </>
      }
    >
      <form id="room-form" onSubmit={submit} className="space-y-5" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Room number" required value={form.roomNumber} onChange={set('roomNumber')} error={errors.roomNumber} placeholder="e.g. 101" />
          <Input label="Room name (optional)" value={form.name} onChange={set('name')} placeholder="e.g. Sampaguita" />
          <Input label="How many people can stay?" type="number" min={1} max={50} required value={form.capacity} onChange={set('capacity')} error={errors.capacity} hint="Number of beds" />
          <Input
            label="Monthly rent per tenant (₱)"
            type="number"
            min={0}
            step="0.01"
            required
            value={form.monthlyRent}
            onChange={set('monthlyRent')}
            error={errors.monthlyRent}
            hint={room ? 'New rent is for new tenants. Current tenants keep their rent.' : 'Each tenant in this room pays this'}
          />
          <Input label="Building (optional)" value={form.building} onChange={set('building')} placeholder="e.g. Main" className="sm:col-span-2" />
        </div>
        <fieldset>
          <legend className="label">Amenities</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {AMENITIES.map((a) => (
              <label key={a} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={form.amenities.includes(a)} onChange={() => toggleAmenity(a)} />
                {a}
              </label>
            ))}
          </div>
          <Input className="mt-3" label="Other amenities (optional)" value={form.other} onChange={set('other')} placeholder="Separate with commas, e.g. Balcony, Mini fridge" />
        </fieldset>
        <Textarea label="Description (optional)" value={form.description} onChange={set('description')} rows={3} placeholder="Tenants can see this in their app." />
        <Checkbox label="This room is under repair" description="No new tenants can be assigned while this is checked." checked={form.underMaintenance} onChange={set('underMaintenance')} />
      </form>
    </Modal>
  );
}
