import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useApi, useDebounce } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Alert, Button, Checkbox, Input, Modal, Select, Spinner, Textarea } from '../../components/ui';
import { peso, periodLabel, SHARING_LABELS } from '../../utils/format';

const num = (v) => (v === '' || v === undefined || v === null ? undefined : Number(v));

/** Record or edit a room's electricity, with a live, plain-language preview. */
export default function ReadingFormModal({ open, onClose, period, roomId: presetRoomId, reading, settings, onSaved }) {
  const toast = useToast();
  const editing = Boolean(reading);
  const [f, setF] = useState({});
  const [custom, setCustom] = useState({});
  const [meters, setMeters] = useState({});
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const rooms = useApi(open && !editing && !presetRoomId ? '/rooms' : null);
  const roomId = reading?.roomId || f.roomId;
  const info = useApi(open && roomId ? '/electricity/occupants' : null, { roomId, billingYear: period.year, billingMonth: period.month });

  useEffect(() => {
    if (!open) return;
    setError('');
    setPreview(null);
    setPreviewError('');
    if (reading) {
      setF({ roomId: reading.roomId, mode: reading.mode, sharingMethod: reading.sharingMethod, previousReading: reading.previousReading ?? '', currentReading: reading.currentReading ?? '', rate: reading.rate ?? '', totalCost: reading.totalCost ?? '', isCorrection: reading.isCorrection, correctionReason: reading.correctionReason || '', notes: reading.notes || '' });
      setCustom(Object.fromEntries((reading.shares || []).map((s) => [s.tenantId, String(s.amount)])));
      setMeters(Object.fromEntries((reading.tenantMeters || []).map((m) => [m.tenantId, { previousReading: String(m.previousReading), currentReading: String(m.currentReading) }])));
    } else {
      setF({ roomId: presetRoomId || '', mode: 'METER', sharingMethod: settings?.defaultElectricitySharing || 'EQUAL', previousReading: '', currentReading: '', rate: settings?.electricityRate ?? '', totalCost: '', isCorrection: false, correctionReason: '', notes: '' });
      setCustom({});
      setMeters({});
    }
  }, [open, reading, presetRoomId, settings]);

  useEffect(() => {
    if (editing || !info.data) return;
    if (f.previousReading === '' && info.data.previousReading != null) setF((x) => ({ ...x, previousReading: String(info.data.previousReading) }));
    if (info.data.lastTenantMeters && !Object.keys(meters).length) {
      setMeters(Object.fromEntries(info.data.lastTenantMeters.map((m) => [m.tenantId, { previousReading: String(m.currentReading), currentReading: '' }])));
    }
  }, [info.data, editing, f.previousReading, meters]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const individual = f.sharingMethod === 'INDIVIDUAL_METER';

  const body = useMemo(() => {
    const b = { roomId, billingYear: period.year, billingMonth: period.month, mode: individual ? 'METER' : f.mode, sharingMethod: f.sharingMethod, rate: num(f.rate), isCorrection: Boolean(f.isCorrection), correctionReason: f.correctionReason || undefined, notes: f.notes || undefined };
    if (individual) b.tenantMeters = Object.entries(meters).filter(([, m]) => m.currentReading !== '').map(([tenantId, m]) => ({ tenantId, previousReading: num(m.previousReading) ?? 0, currentReading: Number(m.currentReading) }));
    else if (f.mode === 'METER') Object.assign(b, { previousReading: num(f.previousReading), currentReading: num(f.currentReading) });
    else b.totalCost = num(f.totalCost);
    if (f.sharingMethod === 'CUSTOM') b.shares = Object.entries(custom).filter(([, v]) => v !== '').map(([tenantId, amount]) => ({ tenantId, amount: Number(amount) }));
    return b;
  }, [f, custom, meters, roomId, period, individual]);
  const debounced = useDebounce(JSON.stringify(body), 400);

  useEffect(() => {
    const b = JSON.parse(debounced);
    const ready = b.roomId && (b.sharingMethod === 'INDIVIDUAL_METER' ? b.tenantMeters?.length : b.mode === 'METER' ? b.currentReading !== undefined && b.previousReading !== undefined : b.totalCost !== undefined);
    if (!open || !ready) return setPreview(null);
    let cancelled = false;
    api
      .post('/electricity/preview', b)
      .then((r) => !cancelled && (setPreview(r.data.preview), setPreviewError('')))
      .catch((e) => !cancelled && (setPreview(null), setPreviewError(errorMessage(e))));
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { roomId: _r, billingYear, billingMonth, ...rest } = body;
      const res = editing ? await api.patch(`/electricity/${reading._id}`, rest) : await api.post('/electricity', body);
      toast.success('Electricity saved. Unsent bills for this month were updated.');
      if (res.data.warning) toast.info(res.data.warning);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const occupants = info.data?.occupants || [];
  const existing = !editing && info.data?.existing;
  const roomNumber = reading?.roomNumber || rooms.data?.items?.find((r) => r._id === roomId)?.roomNumber || '';
  const negative = !individual && f.mode === 'METER' && f.currentReading !== '' && f.previousReading !== '' && Number(f.currentReading) < Number(f.previousReading);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Electricity for ${periodLabel(period.year, period.month)}${roomNumber ? ` · Room ${roomNumber}` : ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="reading-form" loading={saving} disabled={!preview || Boolean(existing)}>
            Save Electricity
          </Button>
        </>
      }
    >
      <form id="reading-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {!editing && !presetRoomId && (
          <Select label="Room" required value={f.roomId || ''} onChange={(e) => setF((x) => ({ ...x, roomId: e.target.value, previousReading: '' }))} placeholder="Choose a room" options={(rooms.data?.items || []).map((r) => ({ value: r._id, label: `Room ${r.roomNumber}` }))} />
        )}
        {existing && <Alert tone="warning">This room already has electricity for this month. Close this and use “Edit” on the room’s card.</Alert>}

        <Select label="How should the cost be shared?" value={f.sharingMethod || 'EQUAL'} onChange={set('sharingMethod')} options={Object.entries(SHARING_LABELS).map(([value, label]) => ({ value, label }))} />

        {individual ? (
          <div className="space-y-3">
            <Input label="Rate (₱ per kWh)" type="number" min={0} step="0.0001" value={f.rate} onChange={set('rate')} className="sm:max-w-xs" />
            {occupants.map((o) => (
              <div key={o.tenantId} className="grid items-end gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
                <p className="font-semibold text-slate-800 sm:col-span-3">{o.tenantName}&apos;s meter</p>
                <Input label="Previous reading (kWh)" type="number" min={0} value={meters[o.tenantId]?.previousReading ?? ''} onChange={(e) => setMeters((m) => ({ ...m, [o.tenantId]: { ...m[o.tenantId], previousReading: e.target.value } }))} />
                <Input label="Current reading (kWh)" type="number" min={0} value={meters[o.tenantId]?.currentReading ?? ''} onChange={(e) => setMeters((m) => ({ ...m, [o.tenantId]: { ...m[o.tenantId], currentReading: e.target.value } }))} />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="What do you have?">
              {[
                ['METER', 'I have the meter readings'],
                ['MANUAL', 'I only have the total amount'],
              ].map(([v, l]) => (
                <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm ${f.mode === v ? 'border-navy-500 bg-navy-50' : 'border-slate-200'}`}>
                  <input type="radio" name="mode" checked={f.mode === v} onChange={() => setF((x) => ({ ...x, mode: v }))} /> {l}
                </label>
              ))}
            </div>
            {f.mode === 'METER' ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Input label="Previous meter reading (kWh)" type="number" min={0} step="0.01" value={f.previousReading} onChange={set('previousReading')} hint={info.data?.previousReading != null ? `Last month: ${info.data.previousReading}` : 'First reading for this room'} />
                <Input label="Current meter reading (kWh)" type="number" min={0} step="0.01" value={f.currentReading} onChange={set('currentReading')} error={negative && !f.isCorrection ? 'Lower than the previous reading' : undefined} />
                <Input label="Rate (₱ per kWh)" type="number" min={0} step="0.0001" value={f.rate} onChange={set('rate')} />
              </div>
            ) : (
              <Input label="Total electricity cost for the room (₱)" type="number" min={0} step="0.01" value={f.totalCost} onChange={set('totalCost')} />
            )}
          </>
        )}

        {(negative || f.isCorrection) && (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <Checkbox label="This is a correction (the meter was replaced or reset)" checked={Boolean(f.isCorrection)} onChange={set('isCorrection')} />
            {f.isCorrection && <Input label="What happened?" required value={f.correctionReason} onChange={set('correctionReason')} />}
          </div>
        )}

        {f.sharingMethod === 'CUSTOM' && roomId && (
          <div className="space-y-2">
            <p className="label">Amount for each tenant (must add up to the total)</p>
            {occupants.map((o) => (
              <div key={o.tenantId} className="flex items-center justify-between gap-3">
                <span className="text-[15px]">{o.tenantName}</span>
                <input type="number" min={0} step="0.01" className="input w-40 text-right" aria-label={`Amount for ${o.tenantName}`} value={custom[o.tenantId] ?? ''} onChange={(e) => setCustom((c) => ({ ...c, [o.tenantId]: e.target.value }))} />
              </div>
            ))}
          </div>
        )}

        {roomId && (
          <div className="rounded-xl bg-navy-50 p-4" aria-live="polite">
            {info.loading ? (
              <Spinner className="py-2" />
            ) : !occupants.length ? (
              <p className="text-sm text-amber-800">Nobody stayed in this room in {periodLabel(period.year, period.month)}, so no tenant will be charged.</p>
            ) : previewError ? (
              <p className="text-sm text-red-700">{previewError}</p>
            ) : preview ? (
              <div className="space-y-2 text-[15px]">
                {preview.consumption != null && (
                  <p>
                    Electricity used: <strong>{preview.consumption} kWh</strong>
                  </p>
                )}
                <p>
                  Total electricity cost: <strong>{peso(preview.totalCost)}</strong>
                </p>
                <ul className="mt-2 space-y-1 border-t border-navy-100 pt-2">
                  {preview.shares.map((s) => (
                    <li key={s.tenantId} className="flex justify-between">
                      <span>{s.tenantName}</span>
                      <strong className="tabular-nums">{peso(s.amount)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-slate-600">Enter the readings to see how much each tenant pays.</p>
            )}
          </div>
        )}
        <Textarea label="Notes (optional)" value={f.notes || ''} onChange={set('notes')} rows={2} />
      </form>
    </Modal>
  );
}
