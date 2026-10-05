import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, CircleAlert, Eye, EyeOff, Inbox, LoaderCircle, RefreshCw, Search, X } from 'lucide-react';

const cx = (...c) => c.filter(Boolean).join(' ');

// ---------------- Buttons ----------------
const VARIANTS = {
  primary: 'bg-[#fff] text-[#0a1430] shadow-sm hover:bg-[#dfe8ff] disabled:bg-panel/20 disabled:text-white/50 disabled:shadow-none',
  secondary: 'border border-white/10 bg-panel/[0.06] text-slate-800 hover:border-white/20 hover:bg-panel/10 disabled:text-slate-400',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-500 disabled:bg-red-600/40',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 disabled:bg-emerald-600/40',
  ghost: 'text-slate-700 hover:bg-panel/[0.07] disabled:text-slate-400',
  link: 'text-navy-300 hover:underline p-0',
};
// Phones: at least 44px tall with 16px text. From md up: the original compact sizes.
const SIZES = {
  sm: 'min-h-11 px-3 text-base md:min-h-8 md:px-2.5 md:py-1.5 md:text-xs',
  md: 'min-h-11 px-4 text-base md:min-h-9 md:py-2 md:text-sm',
  lg: 'min-h-12 px-5 text-base md:min-h-10 md:py-2.5',
};

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, children, className, disabled, type = 'button', ...props }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100',
        variant === 'link' ? 'min-h-11 md:min-h-0' : SIZES[size],
        VARIANTS[variant],
        className
      )}
      {...props}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, ...props }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors md:h-9 md:w-9 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40', className)} {...props}>
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}

// ---------------- Form fields ----------------
export function Field({ label, error, hint, required, children, className, id: givenId }) {
  const autoId = useId();
  // A page may give the field its own id (e.g. to focus it); the label still points at it.
  const id = givenId || autoId;
  const child = typeof children === 'function' ? children(id) : children;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {child}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Input({ label, error, hint, required, className, inputClassName, id: givenId, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} id={givenId}>
      {(id) => <input id={id} required={required} aria-invalid={Boolean(error)} className={cx('input', error && 'input-error', inputClassName)} {...props} />}
    </Field>
  );
}

/**
 * Password field with an eye button to show or hide what was typed.
 * holdAutofill: the browser can't fill in a saved password on its own when the page opens;
 * tapping the field still offers it.
 */
export function PasswordInput({ label, error, hint, required, className, inputClassName, id: givenId, holdAutofill, ...props }) {
  const [shown, setShown] = useState(false);
  const [locked, setLocked] = useState(Boolean(holdAutofill));
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} id={givenId}>
      {(id) => (
        <div className="relative">
          <input
            id={id}
            type={shown ? 'text' : 'password'}
            required={required}
            aria-invalid={Boolean(error)}
            readOnly={locked}
            // Unlock on touch (before focus) so phones open the keyboard on the first tap; onFocus covers the Tab key.
            onPointerDown={() => setLocked(false)}
            onFocus={() => setLocked(false)}
            className={cx('input pr-12', error && 'input-error', inputClassName)}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? 'Hide password' : 'Show password'}
            aria-pressed={shown}
            title={shown ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-1 my-auto inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-white/[0.06] hover:text-slate-800"
          >
            {shown ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      )}
    </Field>
  );
}

export function Textarea({ label, error, hint, required, className, rows = 3, id: givenId, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} id={givenId}>
      {(id) => <textarea id={id} rows={rows} required={required} aria-invalid={Boolean(error)} className={cx('input', error && 'input-error')} {...props} />}
    </Field>
  );
}

export function Select({ label, error, hint, required, className, options = [], placeholder, id: givenId, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} id={givenId}>
      {(id) => (
        <select id={id} required={required} aria-invalid={Boolean(error)} className={cx('input pr-8', error && 'input-error')} {...props}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Checkbox({ label, description, className, ...props }) {
  const id = useId();
  return (
    <div className={cx('flex min-h-11 items-start gap-3 py-2.5 md:min-h-0 md:py-0', className)}>
      <input id={id} type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 rounded md:h-4 md:w-4 border-slate-300 text-navy-300 focus:ring-navy-500" {...props} />
      <label htmlFor={id} className="flex-1 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </label>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="input pl-9" />
    </div>
  );
}

// ---------------- Layout pieces ----------------
/**
 * Page title row. On phones the top bar already shows the page name, so the heading is
 * visually hidden there unless `keepTitleOnMobile` (detail pages, where it names the record).
 */
export function PageHeader({ title, subtitle, actions, keepTitleOnMobile }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between md:mb-6">
      <div className="min-w-0">
        <h1 className={cx('text-2xl font-extrabold tracking-tight break-words text-slate-900 md:text-[1.75rem]', !keepTitleOnMobile && 'max-md:sr-only')}>{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 md:text-[15px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClassName, subtitle }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/** `compact`: smaller on phones so three fit in a row (icon hidden there). */
export function StatCard({ label, value, hint, icon: Icon, tone = 'navy', compact }) {
  const tones = {
    navy: 'bg-navy-50 text-navy-300 ring-navy-100',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    red: 'bg-red-50 text-red-700 ring-red-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  };
  const bars = { navy: 'from-navy-500', green: 'from-emerald-500', amber: 'from-amber-400', red: 'from-red-500', slate: 'from-slate-400' };
  return (
    <div className={cx('card relative flex min-w-0 flex-col items-start gap-2 overflow-hidden transition-shadow hover:shadow-lift sm:flex-row sm:gap-4 sm:p-5', compact ? 'p-3' : 'p-4')}>
      <span className={cx('absolute inset-x-0 top-0 h-1 bg-gradient-to-r to-transparent opacity-70', bars[tone])} aria-hidden />
      {Icon && (
        <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset sm:h-12 sm:w-12', compact && 'max-sm:hidden', tones[tone])}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      )}
      <div className="w-full min-w-0">
        <p className={cx('font-medium text-slate-500', compact ? 'text-xs sm:text-sm' : 'text-sm')}>{label}</p>
        <p className={cx('mt-0.5 font-extrabold tracking-tight break-words text-slate-900 sm:truncate sm:text-[1.65rem]', compact ? 'text-base' : 'text-xl')}>{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

// ---------------- Status badges ----------------
const BADGE_TONES = {
  green: { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  yellow: { cls: 'bg-amber-50 text-amber-800 ring-amber-500/30', dot: 'bg-amber-400' },
  orange: { cls: 'bg-orange-50 text-orange-700 ring-orange-500/30', dot: 'bg-orange-500' },
  red: { cls: 'bg-red-50 text-red-700 ring-red-600/20', dot: 'bg-red-500' },
  blue: { cls: 'bg-navy-50 text-navy-300 ring-navy-600/20', dot: 'bg-navy-500' },
  purple: { cls: 'bg-violet-50 text-violet-700 ring-violet-600/20', dot: 'bg-violet-500' },
  slate: { cls: 'bg-slate-100 text-slate-600 ring-slate-500/20', dot: 'bg-slate-400' },
};
BADGE_TONES.amber = BADGE_TONES.yellow;

/** Every status the app can show, with a plain-language label and a color. */
const STATUS = {
  // bills
  PAID: ['Paid', 'green'],
  UNPAID: ['Unpaid', 'red'],
  PARTIALLY_PAID: ['Partially Paid', 'blue'],
  OVERDUE: ['Overdue', 'orange'],
  DRAFT: ['Not sent yet', 'slate'],
  PUBLISHED: ['Sent', 'blue'],
  VOID: ['Cancelled', 'slate'],
  // payments
  PENDING_VERIFICATION: ['Waiting for Verification', 'yellow'],
  CONFIRMED: ['Confirmed', 'green'],
  REJECTED: ['Rejected', 'slate'],
  REVERSED: ['Reversed', 'slate'],
  // rooms
  AVAILABLE: ['Available', 'green'],
  PARTIALLY_OCCUPIED: ['Partially Occupied', 'blue'],
  FULL: ['Full', 'purple'],
  MAINTENANCE: ['Under Repair', 'yellow'],
  // tenants
  ACTIVE: ['Active', 'green'],
  MOVED_OUT: ['Moved Out', 'slate'],
  INACTIVE: ['Inactive', 'red'],
  PENDING: ['Waiting for Approval', 'yellow'],
  WAITING_FOR_VERIFICATION: ['Waiting for Verification', 'yellow'],
  UP_TO_DATE: ['Paid', 'green'],
  ENDED: ['Ended', 'slate'],
  // activity
  Completed: ['Completed', 'green'],
};

export const statusLabel = (status) => STATUS[status]?.[0] || status;

export function Badge({ children, tone = 'slate', className, dot = true }) {
  const t = BADGE_TONES[tone] || BADGE_TONES.slate;
  return (
    <span className={cx('inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-left text-xs font-semibold ring-1 ring-inset md:whitespace-nowrap', t.cls, className)}>
      {dot && <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', t.dot)} aria-hidden />}
      {children}
    </span>
  );
}

/** Status shown as a colored dot AND a text label (never color alone). */
export function StatusBadge({ status, label, tone }) {
  if (!status && !label) return null;
  const [text, color] = STATUS[status] || [label || status, tone || 'slate'];
  return <Badge tone={tone || color}>{label || text}</Badge>;
}


// ---------------- Phone action bars ----------------
/** Bottom offset that clears the phone tab bar (56px) and the home indicator. */
const ABOVE_TABS = 'bottom-[calc(3.5rem+env(safe-area-inset-bottom))]';

/** A bar pinned above the phone tab bar for the main action(s). Put <StickyBarSpacer /> at the end of the page. */
export function StickyBar({ children, className }) {
  return createPortal(<div className={cx('fixed inset-x-0 z-20 border-t border-slate-200 bg-panel/95 py-3 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] backdrop-blur md:hidden', ABOVE_TABS, className)}>{children}</div>, document.body);
}
export const StickyBarSpacer = () => <div className="h-24 md:hidden" aria-hidden />;

/** On/off switch row: label + optional hint, with a real toggle (role="switch"). */
export function Switch({ label, hint, checked, onChange, disabled, status }) {
  const id = useId();
  return (
    <div className={cx('flex min-h-14 items-center gap-4 py-2', disabled && 'opacity-80')}>
      <div className="min-w-0 flex-1">
        <p id={id} className="text-[15px] font-medium text-slate-800">
          {label}
        </p>
        {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
      </div>
      {status && <span className="text-sm font-semibold text-slate-500">{status}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        aria-labelledby={id}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cx(
          'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-500 disabled:cursor-not-allowed',
          checked ? 'bg-emerald-600' : 'bg-slate-300'
        )}
      >
        <span className={cx('inline-block h-6 w-6 rounded-full bg-[#fff] shadow transition-transform', checked ? 'translate-x-7' : 'translate-x-1')} />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

// ---------------- Horizontal scrolling rows ----------------
/**
 * A row that scrolls sideways without a visible scrollbar. The edge that hides
 * more content fades out, so it's clear there is more to swipe to.
 */
export function HScroll({ children, className, ...props }) {
  const ref = useRef(null);
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      setLeft(el.scrollLeft > 2);
      setRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, [children]);
  return (
    <div ref={ref} className={cx('scroller', left && 'fade-l', right && 'fade-r', className)} {...props}>
      {children}
    </div>
  );
}

/** Filter chip. Pressed state is shown by color AND aria-pressed. */
export function Chip({ active, count, children, className, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx('chip', active ? 'border-navy-700 bg-navy-700 text-white' : 'border-slate-300 bg-panel text-slate-700 hover:border-navy-400 hover:text-navy-300', className)}
      {...props}
    >
      {children}
      {count !== undefined && count !== null && (
        <span className={cx('rounded-full px-1.5 text-xs font-semibold', active ? 'bg-panel/20 text-white' : 'bg-slate-100 text-slate-700')}>{count}</span>
      )}
    </button>
  );
}

/** A row of chips: one swipeable line on phones, wrapping from md up. */
export function ChipRow({ children, label, className }) {
  return (
    <HScroll role="group" aria-label={label} className={cx('-mx-4 flex gap-2 px-4 md:mx-0 md:flex-wrap md:overflow-visible md:px-0', className)}>
      {children}
    </HScroll>
  );
}

// ---------------- Skeletons ----------------
export function Skeleton({ className }) {
  return <div className={cx('animate-pulse rounded-md bg-slate-200/80 motion-reduce:animate-none', className)} aria-hidden />;
}

function Loading({ label, children, className }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Placeholder rows shaped like a list of records. */
export function SkeletonList({ rows = 5, label = 'Loading…', className }) {
  return (
    <Loading label={label} className={cx('divide-y divide-slate-100', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </Loading>
  );
}

/** Placeholder cards for grid layouts (rooms, bills, payments). */
export function SkeletonCards({ count = 6, label = 'Loading…', className = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3' }) {
  return (
    <Loading label={label} className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </Loading>
  );
}

/** Whole-page placeholder: title, a row of summary cards, then a list. */
export function PageSkeleton({ label = 'Loading…' }) {
  return (
    <Loading label={label}>
      <Skeleton className="mb-2 h-7 w-48" />
      <Skeleton className="mb-6 h-4 w-72 max-w-full" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card space-y-2 p-4">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        ))}
      </div>
      <div className="card">
        <SkeletonList rows={5} label={label} />
      </div>
    </Loading>
  );
}

// ---------------- States ----------------
export function Spinner({ label = 'Loading…', className }) {
  return (
    <div className={cx('flex items-center justify-center gap-2 py-12 text-sm text-slate-500', className)} role="status">
      <LoaderCircle className="h-5 w-5 animate-spin text-navy-600" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', message, action, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-100 to-panel text-navy-600 shadow-card ring-1 ring-navy-100">
        <Icon className="h-7 w-7" aria-hidden />
      </div>
      <p className="text-base font-bold text-slate-800">{title}</p>
      {message && <p className="mt-1 max-w-md text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center" role="alert">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
        <CircleAlert className="h-6 w-6" aria-hidden />
      </div>
      <p className="font-medium text-slate-700">Couldn&apos;t load this data</p>
      <p className="mt-1 text-sm text-slate-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" icon={RefreshCw} className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, className }) {
  const tones = {
    info: 'border-navy-200 bg-navy-50 text-navy-300',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  };
  return (
    <div className={cx('rounded-lg border px-4 py-3 text-sm', tones[tone], className)} role={tone === 'error' ? 'alert' : undefined}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
    </div>
  );
}

/** Wraps loading / error / empty handling around content. */
export function AsyncContent({ loading, error, onRetry, empty, emptyProps, children }) {
  if (loading) return <SkeletonList />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (empty) return <EmptyState {...emptyProps} />;
  return children;
}

// ---------------- Table ----------------
/**
 * columns: [{ key, header, render?(row), className?, align? }]
 * Renders a table on md+ screens and cards on small screens (no horizontal scrolling).
 * Phones get stacked label/value rows, or `mobileCard(row)` when a page provides a compact card.
 */
export function DataTable({ columns, rows, rowKey = '_id', onRowClick, loading, error, onRetry, emptyTitle, emptyMessage, emptyAction, footer, mobileCard }) {
  if (loading && !rows?.length) return <SkeletonList />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!rows?.length) return <EmptyState title={emptyTitle || 'No records found'} message={emptyMessage} action={emptyAction} />;
  const cell = (c, r) => (c.render ? c.render(r) : r[c.key] ?? '—');
  return (
    <div className={cx(loading && 'opacity-60 transition-opacity')}>
      <table className="hidden w-full md:table">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx('th', c.align === 'right' && 'text-right', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr
              key={r[rowKey]}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={cx(onRowClick && 'cursor-pointer hover:bg-navy-50/40 focus:bg-navy-50/60 focus:outline-none')}
            >
              {columns.map((c) => (
                <td key={c.key} className={cx('td', c.align === 'right' && 'text-right tabular-nums', c.className)}>
                  {cell(c, r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot className="border-t border-slate-200 bg-slate-50">{footer}</tfoot>}
      </table>
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((r) => (
          <li key={r[rowKey]}>
            <div
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
              className={cx(mobileCard ? 'px-4 py-3.5' : 'space-y-1.5 px-4 py-3', onRowClick && 'cursor-pointer active:bg-slate-50')}
            >
              {mobileCard ? mobileCard(r) : columns
                .filter((c) => !c.hideOnMobile)
                .map((c) => (
                  <div key={c.key} className="flex items-start justify-between gap-3 text-sm">
                    <span className="shrink-0 text-xs font-medium text-slate-500 uppercase">{c.header}</span>
                    <span className="min-w-0 text-right break-words text-slate-800">{cell(c, r)}</span>
                  </div>
                ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Pagination({ page, pages, total, onChange }) {
  if (!pages || pages <= 1) return total ? <p className="px-4 py-3 text-xs text-slate-500">{total} record(s)</p> : null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm">
      <p className="text-xs text-slate-500">
        Page {page} of {pages} · {total} record(s)
      </p>
      <div className="flex gap-1">
        <IconButton icon={ChevronLeft} label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)} />
        <IconButton icon={ChevronRight} label="Next page" disabled={page >= pages} onClick={() => onChange(page + 1)} />
      </div>
    </div>
  );
}

// ---------------- Modal & confirm ----------------
/** `fullScreenMobile`: long forms fill the whole phone screen, with the buttons pinned at the bottom. */
export function Modal({ open, onClose, title, children, footer, size = 'md', dismissable = true, fullScreenMobile }) {
  const ref = useRef(null);
  // Latest close handler/flag, so the effect below runs only when the dialog opens or closes
  // (parents often pass a new onClose on every render, e.g. while typing).
  const closeRef = useRef({ onClose, dismissable });
  useLayoutEffect(() => {
    closeRef.current = { onClose, dismissable };
  });
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape' && closeRef.current.dismissable) closeRef.current.onClose?.();
      // Keep Tab inside the dialog (focus trap).
      if (e.key !== 'Tab' || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(
        (el) => el.tabIndex !== -1 && el.getClientRects().length
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !ref.current.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector('input,select,textarea,button:not([data-close])')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      // Back to the button that opened it.
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
    };
  }, [open]);
  if (!open) return null;
  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };
  // Rendered at the top level of the page so it always covers the header and the phone tab bar.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[3px]" onClick={dismissable ? onClose : undefined} aria-hidden />
      <div ref={ref} className={cx('relative flex max-h-[92dvh] w-full animate-page-in flex-col rounded-t-3xl border border-white/[0.08] bg-[#0c1630] shadow-2xl sm:rounded-2xl', fullScreenMobile && 'max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none', widths[size])}>
        <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
          {dismissable && <IconButton icon={X} label="Close" onClick={onClose} data-close />}
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
        {footer && (
          <footer className={cx('flex flex-col-reverse gap-2 border-t border-slate-100 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-5 sm:py-4', fullScreenMobile && 'max-sm:flex-row max-sm:[&>*]:flex-1')}>{footer}</footer>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * Confirmation dialog. When `requireReason` is set the user must type a reason,
 * which is passed to onConfirm(reason).
 */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', tone = 'primary', requireReason, reasonLabel = 'Reason', loading }) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  const blocked = requireReason && reason.trim().length < 3;
  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone} onClick={() => onConfirm(reason.trim())} loading={loading} disabled={blocked}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-600">
        {typeof message === 'string' ? <p>{message}</p> : message}
        {requireReason && <Textarea label={reasonLabel} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="At least 3 characters" />}
      </div>
    </Modal>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <HScroll className="mb-4 flex gap-1 border-b border-slate-200" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            '-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm font-medium whitespace-nowrap md:min-h-0 md:px-3 md:py-2',
            value === t.value ? 'border-navy-700 font-semibold text-navy-300' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>}
        </button>
      ))}
    </HScroll>
  );
}

export function DescriptionList({ items, columns = 2 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-4', columns === 2 ? 'sm:grid-cols-2' : columns === 3 ? 'sm:grid-cols-3' : '')}>
      {items
        .filter(Boolean)
        .map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs font-medium text-slate-500 uppercase">{k}</dt>
            <dd className="mt-0.5 text-sm break-words text-slate-800">{v ?? '—'}</dd>
          </div>
        ))}
    </dl>
  );
}

export { cx };

// Friendly aliases used across the app.
export { Spinner as LoadingState, ConfirmDialog as ConfirmationDialog, StatCard as DashboardCard };
