import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Lock, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { Button, ConfirmDialog, EmptyState, ErrorState, IconButton, PageHeader, StatCard, cx, SkeletonCards } from '../../components/ui';
import { MonthPicker } from '../../components/cards';
import { currentPeriod, peso, periodLabel, SHARING_LABELS } from '../../utils/format';
import ReadingFormModal from './ReadingFormModal';
import QuickReadings from './QuickReadings';
import { useUndoableRemove } from '../../hooks/useUndo';

function Line({ label, value, strong }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-slate-600">{label}</dt>
      <dd className={cx('tabular-nums', strong ? 'text-lg font-bold text-slate-900' : 'font-semibold text-slate-800')}>{value}</dd>
    </div>
  );
}

function HowCalculated({ r }) {
  const [open, setOpen] = useState(false);
  const n = r.shares.length;
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="-my-1 flex min-h-11 items-center gap-1 text-sm font-semibold text-navy-300 md:my-0 md:min-h-0" aria-expanded={open}>
        <ChevronDown className={cx('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden /> How was this calculated?
      </button>
      {open && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          {r.sharingMethod === 'INDIVIDUAL_METER' ? (
            <>
              <li>Each tenant has their own meter.</li>
              {(r.tenantMeters || []).map((m) => (
                <li key={m.tenantId}>
                  {m.tenantName}: {m.currentReading} − {m.previousReading} = {m.consumption} kWh × {peso(r.rate)} = {peso(r.shares.find((s) => s.tenantId === m.tenantId)?.amount)}
                </li>
              ))}
            </>
          ) : (
            <>
              {r.mode === 'METER' ? (
                <>
                  <li>
                    Electricity used: {r.currentReading} − {r.previousReading} = <strong>{r.consumption} kWh</strong>
                  </li>
                  <li>
                    Cost: {r.consumption} kWh × {peso(r.rate)} per kWh = <strong>{peso(r.totalCost)}</strong>
                  </li>
                </>
              ) : (
                <li>You entered a total of {peso(r.totalCost)} for the room.</li>
              )}
              <li>
                {r.sharingMethod === 'EQUAL' && `Shared equally: ${peso(r.totalCost)} ÷ ${n} tenant${n === 1 ? '' : 's'} = ${peso(n ? r.totalCost / n : 0)} each.`}
                {r.sharingMethod === 'PRORATED' && 'Shared by the number of days each tenant stayed this month.'}
                {r.sharingMethod === 'CUSTOM' && 'You entered the amount for each tenant.'}
              </li>
            </>
          )}
          {r.isCorrection && <li>Correction: {r.correctionReason}</li>}
        </ol>
      )}
    </div>
  );
}

export default function ElectricityPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const undo = useUndoableRemove();
  const readings = useApi('/electricity', { billingYear: period.year, billingMonth: period.month });
  const rooms = useApi('/rooms');
  const settings = useApi('/settings');

  const { hidden } = undo;
  const items = useMemo(() => (readings.data?.items || []).filter((r) => !hidden.includes(r._id)), [readings.data, hidden]);
  const missing = useMemo(() => {
    const have = new Set(items.map((r) => r.roomId));
    return (rooms.data?.items || []).filter((r) => r.occupiedBeds > 0 && !have.has(r._id));
  }, [items, rooms.data]);
  const total = items.reduce((s, r) => s + r.totalCost, 0);
  const kwh = items.reduce((s, r) => s + Math.max(0, r.consumption || 0), 0);

  const remove = () => {
    const r = deleting;
    setDeleting(null);
    undo.remove(r._id, `Reading for Room ${r.roomNumber} deleted.`, async () => {
      await api.delete(`/electricity/${r._id}`);
      readings.reload();
    });
  };

  return (
    <>
      <PageHeader
        title="Electricity"
        subtitle="Enter each room's meter reading. We work out how much each tenant pays."
        actions={
          <>
            <MonthPicker value={period} onChange={setPeriod} />
            <Button icon={Plus} className="max-md:w-full" onClick={() => setModal({})}>
              Record Reading
            </Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-4">
        <StatCard compact label="Rooms recorded" value={`${items.length} / ${items.length + missing.length}`} hint={periodLabel(period.year, period.month)} icon={Zap} />
        <StatCard compact label="Electricity used" value={`${Math.round(kwh * 100) / 100} kWh`} icon={Zap} />
        <StatCard compact label="Total cost" value={peso(total)} hint={`Rate ${peso(settings.data?.settings?.electricityRate)} per kWh`} icon={Zap} tone="amber" />
      </div>

      {readings.loading && !readings.data ? (
        <SkeletonCards label="Loading readings…" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" />
      ) : readings.error ? (
        <ErrorState message={readings.error} onRetry={readings.reload} />
      ) : (
        <>
        <div className="md:hidden">
          <QuickReadings period={period} missing={missing} recorded={items.length} settings={settings.data?.settings} onSaved={readings.reload} onMore={(roomId) => setModal({ roomId })} />
          {items.length > 0 && <h2 className="mb-3 text-base font-semibold text-slate-900">Recorded this month</h2>}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {missing.map((r) => (
            <article key={r._id} className="card hidden flex-col items-start border-dashed p-5 md:flex">
              <h3 className="text-xl font-bold text-slate-900">Room {r.roomNumber}</h3>
              <p className="mt-1 text-sm text-amber-700">No reading yet for {periodLabel(period.year, period.month)}</p>
              <p className="mt-1 text-sm text-slate-500">{r.occupiedBeds} occupant{r.occupiedBeds === 1 ? '' : 's'}</p>
              <Button className="mt-4" icon={Plus} onClick={() => setModal({ roomId: r._id })}>
                Record Reading
              </Button>
            </article>
          ))}
          {items.map((r) => (
            <article key={r._id} className="card p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-xl font-bold text-slate-900">Room {r.roomNumber}</h3>
                {r.locked ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                    <Lock className="h-3 w-3" aria-hidden /> Billed
                  </span>
                ) : (
                  <div className="flex gap-1">
                    <IconButton icon={Pencil} label="Edit" onClick={() => setModal({ reading: r })} />
                    <IconButton icon={Trash2} label="Delete" className="text-red-600 hover:bg-red-50" onClick={() => setDeleting(r)} />
                  </div>
                )}
              </div>
              <dl className="mt-3 text-[15px]">
                {r.mode === 'METER' && r.sharingMethod !== 'INDIVIDUAL_METER' && (
                  <>
                    <Line label="Previous Meter Reading" value={`${r.previousReading?.toLocaleString()} kWh`} />
                    <Line label="Current Meter Reading" value={`${r.currentReading?.toLocaleString()} kWh`} />
                  </>
                )}
                {r.consumption != null && <Line label="Electricity Used" value={`${r.consumption} kWh`} />}
                {r.mode === 'METER' && <Line label="Rate" value={`${peso(r.rate)} / kWh`} />}
                <Line label="Total Electricity Cost" value={peso(r.totalCost)} strong />
                <Line label="Number of Occupants" value={r.shares.length} />
              </dl>
              <div className="mt-2 rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-500 uppercase">Each tenant pays</p>
                <ul className="mt-1 space-y-1 text-[15px]">
                  {r.shares.map((s) => (
                    <li key={s.tenantId} className="flex justify-between">
                      <span>{s.tenantName}</span>
                      <strong className="tabular-nums">{peso(s.amount)}</strong>
                    </li>
                  ))}
                  {!r.shares.length && <li className="text-sm text-slate-500">No tenants this month</li>}
                </ul>
                <p className="mt-2 text-xs text-slate-500">{SHARING_LABELS[r.sharingMethod]}</p>
              </div>
              <HowCalculated r={r} />
            </article>
          ))}
          {!items.length && !missing.length && (
            <div className="card md:col-span-2 xl:col-span-3">
              <EmptyState
                icon={Zap}
                title="No rooms have tenants this month"
                message="Readings are needed only for rooms with tenants."
                action={
                  <Link to="/tenants" className="inline-flex min-h-11 items-center rounded-lg bg-navy-700 px-4 text-base font-medium text-white hover:bg-navy-800 md:min-h-9 md:text-sm">
                    Go to Tenants
                  </Link>
                }
              />
            </div>
          )}
        </div>
        </>
      )}
      <ReadingFormModal open={Boolean(modal)} onClose={() => setModal(null)} period={period} roomId={modal?.roomId} reading={modal?.reading} settings={settings.data?.settings} onSaved={readings.reload} />
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete this reading?" message={`The electricity for Room ${deleting?.roomNumber} will be removed from unsent bills.`} tone="danger" confirmLabel="Delete" onConfirm={remove} />
    </>
  );
}
