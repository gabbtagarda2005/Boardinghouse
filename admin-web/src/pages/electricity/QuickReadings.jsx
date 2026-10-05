import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CircleCheck, Save, SlidersHorizontal } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Button, Skeleton, cx } from '../../components/ui';
import { peso, periodLabel, SHARING_LABELS } from '../../utils/format';

const round2 = (n) => Math.round(n * 100) / 100;
const parse = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(/,/g, '')));

/**
 * Phone-first meter entry: one card per room that still needs a reading.
 * Saves with the same request as the full form (house rate and default sharing method);
 * "More options" opens the full form for corrections or per-tenant splits.
 */
function QuickReadingCard({ room, period, settings, focus, onSaved, onNext, onMore }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const info = useApi('/electricity/occupants', { roomId: room._id, billingYear: period.year, billingMonth: period.month });
  const [current, setCurrent] = useState('');
  const [previous, setPrevious] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (focus) {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.closest('article')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focus]);

  const sharing = settings?.defaultElectricitySharing || 'EQUAL';
  const needsFullForm = sharing === 'CUSTOM' || sharing === 'INDIVIDUAL_METER';
  const rate = Number(settings?.electricityRate) || 0;
  const knownPrevious = info.data?.previousReading;
  const prev = knownPrevious != null ? Number(knownPrevious) : parse(previous);
  const cur = parse(current);
  const ready = cur !== null && !Number.isNaN(cur) && prev !== null && !Number.isNaN(prev);
  const kwh = ready ? round2(cur - prev) : null;
  const negative = ready && kwh < 0;
  const occupants = info.data?.occupants?.length ?? room.occupiedBeds;

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.post('/electricity', {
        roomId: room._id,
        billingYear: period.year,
        billingMonth: period.month,
        mode: 'METER',
        sharingMethod: sharing,
        rate,
        previousReading: prev,
        currentReading: cur,
        isCorrection: false,
      });
      toast.success(`Room ${room.roomNumber} saved. Unsent bills for this month were updated.`);
      if (res.data.warning) toast.info(res.data.warning);
      onSaved(room._id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className={cx('card p-4', negative && 'border-red-300 ring-1 ring-red-200')} aria-label={`Room ${room.roomNumber}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-bold text-slate-900">Room {room.roomNumber}</h3>
        <span className="text-sm text-slate-600">
          {occupants} tenant{occupants === 1 ? '' : 's'}
        </span>
      </div>

      {needsFullForm ? (
        <p className="mt-2 text-sm text-slate-600">This room is set to “{SHARING_LABELS[sharing]}”. Use the full form to enter it.</p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-600">Previous reading</span>
            {info.loading && !info.data ? (
              <Skeleton className="h-5 w-24" />
            ) : knownPrevious != null ? (
              <span className="font-semibold text-slate-900 tabular-nums">{Number(knownPrevious).toLocaleString()} kWh</span>
            ) : (
              <input
                type="text"
                inputMode="decimal"
                className="input w-36 text-right tabular-nums"
                aria-label={`Previous reading for Room ${room.roomNumber}`}
                placeholder="First reading"
                value={previous}
                onChange={(e) => setPrevious(e.target.value.replace(/[^\d.,]/g, ''))}
              />
            )}
          </div>
          <label className="mt-3 block">
            <span className="text-sm font-medium text-slate-700">Current reading (kWh)</span>
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              className={cx('input mt-1 h-14 text-right text-2xl font-bold tabular-nums md:h-12 md:text-xl', negative && 'input-error')}
              placeholder="0"
              value={current}
              onChange={(e) => setCurrent(e.target.value.replace(/[^\d.,]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && ready && !negative && save()}
              aria-invalid={negative}
              aria-describedby={`calc-${room._id}`}
            />
          </label>
          <div id={`calc-${room._id}`} className="mt-2 min-h-6 text-sm" aria-live="polite">
            {negative ? (
              <p className="font-medium text-red-700">Lower than the previous reading. If the meter was replaced, use More options.</p>
            ) : ready ? (
              <p className="flex justify-between gap-3 text-slate-700">
                <span className="tabular-nums">
                  {kwh.toLocaleString()} kWh × {peso(rate)}
                </span>
                <strong className="text-slate-900 tabular-nums">{peso(round2(kwh * rate))}</strong>
              </p>
            ) : (
              <p className="text-slate-500">Type the number on the meter.</p>
            )}
          </div>
        </>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {needsFullForm ? (
          <Button className="col-span-2" icon={SlidersHorizontal} onClick={() => onMore(room._id)}>
            Open Full Form
          </Button>
        ) : (
          <>
            <Button variant="secondary" icon={ArrowRight} onClick={onNext}>
              Next room
            </Button>
            <Button icon={Save} loading={saving} disabled={!ready || negative} onClick={save}>
              Save reading
            </Button>
            <Button variant="ghost" icon={SlidersHorizontal} className="col-span-2" onClick={() => onMore(room._id)}>
              More options
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

export default function QuickReadings({ period, missing, recorded, settings, onSaved, onMore }) {
  const total = missing.length + recorded;
  const [focusId, setFocusId] = useState(null);
  const pct = total ? Math.round((recorded / total) * 100) : 0;
  const next = (id) => {
    const i = missing.findIndex((r) => r._id === id);
    const n = missing[(i + 1) % missing.length];
    setFocusId(n && n._id !== id ? n._id : null);
  };

  if (!total) return null;
  return (
    <section className="mb-6" aria-label="Record meter readings">
      <div className="card mb-3 p-4">
        <p className="flex items-center justify-between text-sm font-semibold text-slate-800">
          <span>Readings recorded</span>
          <span className="tabular-nums">
            {recorded}/{total}
          </span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={recorded} aria-label="Readings recorded">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        {!missing.length && (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <CircleCheck className="h-4 w-4" aria-hidden /> All rooms are done for {periodLabel(period.year, period.month)}.
          </p>
        )}
      </div>
      <div className="space-y-3">
        {missing.map((r) => (
          <QuickReadingCard
            key={r._id}
            room={r}
            period={period}
            settings={settings}
            focus={focusId === r._id}
            onNext={() => next(r._id)}
            onMore={onMore}
            onSaved={(id) => {
              next(id);
              onSaved();
            }}
          />
        ))}
      </div>
    </section>
  );
}
