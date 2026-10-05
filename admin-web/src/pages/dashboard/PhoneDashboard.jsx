import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CircleCheck, Clock, FilePlus2, Hourglass, Send, TriangleAlert, Wallet, Zap } from 'lucide-react';
import { cx } from '../../components/ui';
import { greeting, peso, timeAgo } from '../../utils/format';
import RecordPaymentModal from '../payments/RecordPaymentModal';
import TenantAppCard from '../../components/TenantAppCard';

/** The dashboard's attention items carry their count at the start of the text ("2 payments are…"). */
const countOf = (attention, key) => {
  const item = attention.find((a) => a.key === key);
  return item ? Number(item.text.match(/^\d+/)?.[0] || 0) : 0;
};

function Shortcut({ to, icon: Icon, count, label, tone }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-800 ring-red-200',
    navy: 'bg-navy-50 text-navy-300 ring-navy-200',
  };
  const done = count === 0;
  return (
    <Link to={to} className={cx('flex min-h-24 flex-col justify-between rounded-xl p-3 ring-1 ring-inset active:scale-[0.98]', done ? 'bg-panel text-slate-600 ring-slate-200' : tones[tone])}>
      <span className="flex items-center justify-between">
        {done ? <CircleCheck className="h-5 w-5 text-emerald-600" aria-hidden /> : <Icon className="h-5 w-5" aria-hidden />}
        <span className={cx('text-2xl font-bold tabular-nums', done && 'text-slate-500')}>{count}</span>
      </span>
      <span className="mt-2 text-sm leading-tight font-semibold">{label}</span>
    </Link>
  );
}

function QuickAction({ icon: Icon, label, to, onClick }) {
  const cls = 'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-panel px-2 text-center text-sm font-semibold text-navy-300 shadow-sm active:bg-slate-50';
  const inner = (
    <>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-700 text-white">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      {label}
    </>
  );
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** Phone dashboard: money summary, what needs attention, quick actions, recent activity. */
export default function PhoneDashboard({ data, onChanged }) {
  const [recordOpen, setRecordOpen] = useState(false);
  const { cards: c, attention, recentActivity, period } = data;
  const toVerify = countOf(attention, 'pending');
  const overdueTenants = countOf(attention, 'overdue');
  const unsent = countOf(attention, 'drafts');
  const others = attention.filter((a) => !['pending', 'overdue', 'drafts'].includes(a.key));

  return (
    <>
      <h1 className="sr-only">Dashboard</h1>
      <p className="mb-3 text-lg font-bold tracking-tight text-slate-900">
        {greeting()} 👋
      </p>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-700 via-navy-800 to-navy-950 p-5 text-white shadow-lift" aria-label="This month">
        <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-panel/10 blur-2xl" aria-hidden />
        <p className="text-sm text-white/75">Collected in {period.label}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{peso(c.collectedThisMonth)}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-4">
          <div>
            <dt className="text-xs text-white/75">Remaining balance</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{peso(c.unpaidAmount)}</dd>
            <dd className="text-xs text-white/75">
              {c.unpaidCount} unpaid bill{c.unpaidCount === 1 ? '' : 's'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-white/75">Overdue</dt>
            <dd className={cx('mt-0.5 text-lg font-semibold tabular-nums', c.overdueCount > 0 && 'text-amber-300')}>
              {c.overdueCount} bill{c.overdueCount === 1 ? '' : 's'}
            </dd>
            <dd className="text-xs text-white/75 tabular-nums">{peso(c.overdueAmount)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6" aria-labelledby="attention-h">
        <h2 id="attention-h" className="mb-3 text-base font-semibold text-slate-900">
          Needs attention
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Shortcut to="/payments?tab=verify" icon={Hourglass} count={toVerify} label="Payments to verify" tone="amber" />
          <Shortcut to="/payments?tab=overdue" icon={TriangleAlert} count={overdueTenants} label="Overdue tenants" tone="red" />
          <Shortcut to="/bills" icon={Send} count={unsent} label="Unsent bills" tone="navy" />
        </div>
        {others.length > 0 && (
          <ul className="card mt-3 divide-y divide-slate-100">
            {others.map((a) => (
              <li key={a.key}>
                <Link to={a.to} className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm font-medium text-slate-800 active:bg-slate-50">
                  <span className="flex-1">{a.text}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6" aria-labelledby="quick-h">
        <h2 id="quick-h" className="mb-3 text-base font-semibold text-slate-900">
          Quick actions
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <QuickAction icon={Wallet} label="Record payment" onClick={() => setRecordOpen(true)} />
          <QuickAction icon={Zap} label="Record reading" to="/electricity" />
          <QuickAction icon={FilePlus2} label="Create bills" to="/bills?create=1" />
        </div>
      </section>

      <div className="mt-6">
        <TenantAppCard />
      </div>

      <section className="mt-6" aria-labelledby="activity-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="activity-h" className="text-base font-semibold text-slate-900">
            Recent activity
          </h2>
          <Link to="/activity" className="-my-2 -mr-2 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-navy-300">
            See all
          </Link>
        </div>
        {recentActivity.length === 0 ? (
          <p className="card px-4 py-6 text-center text-sm text-slate-500">Nothing has happened yet.</p>
        ) : (
          <ul className="card divide-y divide-slate-100">
            {recentActivity.slice(0, 6).map((a) => (
              <li key={a.key} className="px-4 py-3">
                <p className="font-semibold text-slate-800">{a.title}</p>
                <p className="text-sm text-slate-600">{a.description}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="h-3 w-3" aria-hidden /> {timeAgo(a.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <RecordPaymentModal open={recordOpen} onClose={() => setRecordOpen(false)} onDone={onChanged} />
    </>
  );
}
