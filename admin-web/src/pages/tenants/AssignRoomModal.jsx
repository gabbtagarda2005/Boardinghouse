import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Alert, Button, Input, Modal, Select, Textarea } from '../../components/ui';
import { peso, toDateInput } from '../../utils/format';

/**
 * Assign a room (or move a tenant with mode="transfer").
 * From a room page, the room/bed are fixed and the owner picks a tenant.
 * mode="approve": approving a tenant who signed up in the app = giving them their real room and bed.
 */
export default function AssignRoomModal({ open, onClose, tenant, mode = 'assign', presetRoom, presetBed, onDone }) {
  const toast = useToast();
  const [tenantId, setTenantId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [bed, setBed] = useState('');
  const [date, setDate] = useState(toDateInput());
  const [rent, setRent] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const rooms = useApi(open && !presetRoom ? '/rooms' : null);
  const candidates = useApi(open && !tenant ? '/tenants' : null, { unassigned: 'true', status: 'ALL' });
  const detail = useApi(open && roomId ? `/rooms/${roomId}` : null);

  useEffect(() => {
    if (!open) return;
    setTenantId(tenant?._id || '');
    setRoomId(presetRoom?._id || '');
    setBed(presetBed ? String(presetBed) : '');
    setDate(mode === 'approve' && tenant?.requestedMoveIn ? toDateInput(new Date(tenant.requestedMoveIn)) : toDateInput());
    setRent('');
    setNotes('');
    setError('');
  }, [open, tenant, presetRoom, presetBed, mode]);

  // Approving: pre-select the room they said they stay in (if it has space).
  useEffect(() => {
    if (!open || mode !== 'approve' || !tenant?.requestedRoom || roomId) return;
    const said = String(tenant.requestedRoom).replace(/^room\s*/i, '').trim().toLowerCase();
    const match = (rooms.data?.items || []).find((r) => String(r.roomNumber).toLowerCase() === said && r.availableBeds > 0 && !r.underMaintenance);
    if (match) setRoomId(match._id);
  }, [open, mode, tenant, rooms.data, roomId]);

  const roomOptions = useMemo(
    () =>
      (rooms.data?.items || [])
        .filter((r) => !r.underMaintenance && (r.availableBeds > 0 || r._id === tenant?.currentRoomId))
        .map((r) => ({ value: r._id, label: `Room ${r.roomNumber} · ${r.availableBeds} space${r.availableBeds === 1 ? '' : 's'} free · ${peso(r.monthlyRent)}/month` })),
    [rooms.data, tenant]
  );
  const bedOptions = (detail.data?.beds || []).filter((b) => !b.occupied).map((b) => ({ value: String(b.bedNumber), label: `Bed ${b.bedNumber}` }));
  const tenantOptions = (candidates.data?.items || []).filter((t) => t.status !== 'INACTIVE').map((t) => ({ value: t._id, label: t.name }));
  const room = detail.data?.room || presetRoom;
  const transfer = mode === 'transfer';
  const approving = mode === 'approve';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!tenantId || !roomId) return setError('Please choose a tenant and a room.');
    setSaving(true);
    try {
      const body = { roomId, bedNumber: bed ? Number(bed) : undefined, monthlyRent: rent === '' ? undefined : Number(rent) };
      if (approving) {
        const res = await api.post(`/tenants/${tenantId}/approve`, { ...body, startDate: date });
        toast.success(res.data.message || 'Approved.');
      } else if (transfer) await api.post(`/tenants/${tenantId}/transfer`, { ...body, date, reason: notes || undefined });
      else await api.post(`/tenants/${tenantId}/assign`, { ...body, startDate: date, notes: notes || undefined });
      if (!approving) toast.success(transfer ? 'The tenant was moved to the new room.' : 'The room was assigned.');
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
      title={approving ? `Approve ${tenant?.name}` : transfer ? `Move ${tenant?.name} to another room` : presetRoom ? `Assign a tenant to Room ${presetRoom.roomNumber}${presetBed ? `, Bed ${presetBed}` : ''}` : `Assign a room${tenant ? ` to ${tenant.name}` : ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="assign-form" loading={saving}>
            {approving ? 'Approve & Assign Room' : transfer ? 'Move Tenant' : 'Assign Room'}
          </Button>
        </>
      }
    >
      <form id="assign-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {approving && (
          <Alert tone="info" title="Only approve people who really board here">
            {tenant?.requestedRoom || tenant?.requestedMoveIn
              ? `They said: ${tenant.requestedRoom ? `Room ${tenant.requestedRoom}` : 'room not given'}${tenant.requestedMoveIn ? `, moving in ${new Date(tenant.requestedMoveIn).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}. `
              : ''}
            Choose their room and bed. If you don&apos;t know them, close this and choose Reject Account instead.
          </Alert>
        )}
        {!tenant && (
          <Select label="Tenant" required value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder={candidates.loading ? 'Loading…' : tenantOptions.length ? 'Choose a tenant without a room' : 'Every tenant already has a room'} options={tenantOptions} />
        )}
        {!presetRoom && (
          <Select
            label={transfer ? 'New room' : 'Room'}
            required
            value={roomId}
            onChange={(e) => {
              setRoomId(e.target.value);
              setBed('');
            }}
            placeholder={rooms.loading ? 'Loading…' : roomOptions.length ? 'Choose a room with space' : 'No room has space right now'}
            options={roomOptions}
          />
        )}
        {roomId && !presetBed && <Select label="Bed" value={bed} onChange={(e) => setBed(e.target.value)} placeholder="First free bed" options={bedOptions} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={transfer ? 'Moving date' : 'Move-in date'} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Input label="Monthly rent (₱)" type="number" min={0} step="0.01" value={rent} onChange={(e) => setRent(e.target.value)} placeholder={room ? String(room.monthlyRent) : ''} hint="Leave empty to use the room's rent" />
        </div>
        {!approving && <Textarea label={transfer ? 'Reason (optional)' : 'Notes (optional)'} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />}
        {transfer && <p className="text-xs text-slate-500">Old bills stay with the old room. New bills will use the new room.</p>}
      </form>
    </Modal>
  );
}
