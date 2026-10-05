import { useId, useState } from 'react';
import { Chip, HScroll, cx } from './ui';
import { MONTHS, yearOptions } from '../utils/format';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ym = (y, m) => `${y}-${pad(m)}`;

function monthBounds(offset) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { first, last };
}

const DATE_PRESETS = {
  any: () => ({ from: '', to: '' }),
  this: () => {
    const { first } = monthBounds(0);
    return { from: ymd(first), to: ymd(new Date()) };
  },
  last: () => {
    const { first, last } = monthBounds(-1);
    return { from: ymd(first), to: ymd(last) };
  },
};

const MONTH_PRESETS = {
  any: () => ({ from: '', to: '' }),
  this: () => {
    const { first } = monthBounds(0);
    const v = ym(first.getFullYear(), first.getMonth() + 1);
    return { from: v, to: v };
  },
  last: () => {
    const { first } = monthBounds(-1);
    const v = ym(first.getFullYear(), first.getMonth() + 1);
    return { from: v, to: v };
  },
  last3: () => {
    const a = monthBounds(-2).first;
    const b = monthBounds(0).first;
    return { from: ym(a.getFullYear(), a.getMonth() + 1), to: ym(b.getFullYear(), b.getMonth() + 1) };
  },
};

const matchPreset = (presets, v) => Object.keys(presets).find((k) => {
  const p = presets[k]();
  return p.from === (v.from || '') && p.to === (v.to || '');
});

function RangeShell({ label, hint, children }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="min-w-0">
      <p id={id} className="label">
        {label}
      </p>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** One "date range" control: presets (Any time, This month, Last month) or a custom From/To. */
export function DateRangeField({ label = 'Date range', value, onChange, hint }) {
  const preset = matchPreset(DATE_PRESETS, value);
  const [custom, setCustom] = useState(!preset);
  const active = custom ? 'custom' : preset;
  const pick = (k) => {
    if (k === 'custom') return setCustom(true);
    setCustom(false);
    onChange(DATE_PRESETS[k]());
  };
  return (
    <RangeShell label={label} hint={hint}>
      <HScroll className="flex gap-2">
        {[
          ['any', 'Any time'],
          ['this', 'This month'],
          ['last', 'Last month'],
          ['custom', 'Custom'],
        ].map(([k, l]) => (
          <Chip key={k} active={active === k} onClick={() => pick(k)}>
            {l}
          </Chip>
        ))}
      </HScroll>
      {active === 'custom' && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-600">From</span>
            <input type="date" className="input" value={value.from || ''} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          </label>
          <label className="min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-600">To</span>
            <input type="date" className="input" value={value.to || ''} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
          </label>
        </div>
      )}
    </RangeShell>
  );
}

/** Month + year dropdowns (works in every browser, unlike <input type="month">). value: "YYYY-MM" or "". */
export function MonthYearSelect({ value, onChange, label, className }) {
  const [y, m] = value ? value.split('-').map(Number) : ['', ''];
  const now = new Date();
  const set = (ny, nm) => onChange(ny && nm ? ym(ny, nm) : '');
  return (
    <div className={cx('flex min-w-0 gap-2', className)}>
      <select aria-label={`${label} month`} className="input min-w-0 flex-1" value={m || ''} onChange={(e) => set(y || now.getFullYear(), Number(e.target.value))}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <select aria-label={`${label} year`} className="input w-28 shrink-0" value={y || ''} onChange={(e) => set(Number(e.target.value), m || now.getMonth() + 1)}>
        <option value="">Year</option>
        {yearOptions().map((yr) => (
          <option key={yr} value={yr}>
            {yr}
          </option>
        ))}
      </select>
    </div>
  );
}

/** One "billing months" control: presets or a custom From/To month. value: { from: "YYYY-MM", to: "YYYY-MM" } */
export function MonthRangeField({ label = 'Billing months', value, onChange, hint }) {
  const preset = matchPreset(MONTH_PRESETS, value);
  const [custom, setCustom] = useState(!preset);
  const active = custom ? 'custom' : preset;
  const pick = (k) => {
    if (k === 'custom') return setCustom(true);
    setCustom(false);
    onChange(MONTH_PRESETS[k]());
  };
  return (
    <RangeShell label={label} hint={hint}>
      <HScroll className="flex gap-2">
        {[
          ['any', 'All months'],
          ['this', 'This month'],
          ['last', 'Last month'],
          ['last3', 'Last 3 months'],
          ['custom', 'Custom'],
        ].map(([k, l]) => (
          <Chip key={k} active={active === k} onClick={() => pick(k)}>
            {l}
          </Chip>
        ))}
      </HScroll>
      {active === 'custom' && (
        <div className="mt-2 space-y-2">
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-600">From</span>
            <MonthYearSelect label="From" value={value.from || ''} onChange={(v) => onChange({ ...value, from: v })} />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-600">To</span>
            <MonthYearSelect label="To" value={value.to || ''} onChange={(v) => onChange({ ...value, to: v })} />
          </div>
        </div>
      )}
    </RangeShell>
  );
}
