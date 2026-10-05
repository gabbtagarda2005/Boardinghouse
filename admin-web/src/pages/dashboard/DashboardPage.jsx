import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BedDouble, ChevronRight, MessageSquareText, UserPlus, CircleCheck, DoorOpen, Hourglass, Receipt, Send, Users, Wallet, Clock, Zap } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { usePhone } from '../../hooks/useMediaQuery';
import PhoneDashboard from './PhoneDashboard';
import TenantAppCard from '../../components/TenantAppCard';
import { Button, Card, EmptyState, ErrorState, PageHeader, StatCard, StatusBadge, cx, PageSkeleton } from '../../components/ui';
import { formatDate, formatDateTime, greeting, methodLabel, peso, periodLabel, shortDate, timeAgo } from '../../utils/format';

const TONES = {
  amber: { dot: 'bg-amber-400', box: 'border-amber-200 bg-amber-50' },
  red: { dot: 'bg-red-500', box: 'border-red-200 bg-red-50' },
  orange: { dot: 'bg-orange-500', box: 'border-orange-200 bg-orange-50' },
  blue: { dot: 'bg-navy-500', box: 'border-navy-200 bg-navy-50' },
};

/** An icon for each kind of to-do, so the list is quick to scan. */
const ATTENTION_ICON = { inquiries: MessageSquareText, signups: UserPlus, pending: Hourglass, overdue: AlertTriangle, due: Clock, drafts: Send, readings: Zap, rooms: BedDouble };
const ICON_TONE = {
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
  orange: 'bg-orange-100 text-orange-700',
  blue: 'bg-navy-100 text-navy-300',
};

function Attention({ items }) {
  return (
    <Card title="What Needs Your Attention" subtitle={items.length ? 'Start with the first item' : undefined}>
      {items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-800">
          <CircleCheck className="h-6 w-6 shrink-0" aria-hidden />
          <p className="font-medium">You&apos;re all caught up. Nothing needs your attention right now.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.key} className={cx('flex flex-col gap-3 rounded-2xl border p-3 pr-4 sm:flex-row sm:items-center', TONES[a.tone]?.box)}>
              <div className="flex flex-1 items-center gap-3">
                {(() => {
                  const Icon = ATTENTION_ICON[a.key] || AlertTriangle;
                  return (
                    <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', ICON_TONE[a.tone] || ICON_TONE.blue)}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                  );
                })()}
                <p className="flex-1 text-[15px] font-semibold text-slate-800">{a.text}</p>
              </div>
              <Link to={a.to}>
                <Button size="md" variant="secondary" className="w-full gap-1.5 sm:w-auto">
                  {a.action}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const SERIES = [
  { key: 'billed', label: 'Billed', color: '#4a85ff' },
  { key: 'collected', label: 'Collected', color: '#1baf7a' },
];

function CollectionCard({ collection, period }) {
  const [view, setView] = useState('chart');
  const pct = collection.billedThisMonth ? Math.round((collection.paidThisMonth / collection.billedThisMonth) * 100) : 0;
  return (
    <Card
      title="Payment Collection"
      subtitle={`How much of the ${period} bills has been paid`}
      actions={
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm" role="group" aria-label="Show as">
          {['chart', 'table'].map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cx('min-h-11 rounded-md px-3 font-medium capitalize md:min-h-0 md:py-1', view === v ? 'bg-navy-700 text-white' : 'text-slate-600 hover:bg-slate-100')}>
              {v}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <p className="text-sm text-slate-500">Paid so far</p>
          <p className="text-3xl font-bold text-slate-900">
            {peso(collection.paidThisMonth)} <span className="text-base font-medium text-slate-500">of {peso(collection.billedThisMonth)}</span>
          </p>
        </div>
        <p className="text-sm text-slate-600">
          {collection.paidBills} of {collection.sentBills} bills fully paid
        </p>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Collected this month">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="mt-1 text-sm text-slate-500">{pct}% collected</p>

      <p className="mt-6 mb-2 text-sm font-semibold text-slate-700">Last 6 months</p>
      {view === 'chart' ? (
        <>
          <div className="mb-2 flex gap-4 text-sm text-slate-600" aria-hidden>
            {SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
          <div className="h-56" role="img" aria-label="Billed and collected per month. Switch to Table to see the exact amounts.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={collection.series} barGap={2} barCategoryGap="25%">
                <CartesianGrid vertical={false} stroke="#1c2a4d" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#2f4270' }} tick={{ fill: '#96a6c8', fontSize: 12 }} />
                <YAxis tickFormatter={(v) => (v >= 1000 ? `₱${Math.round(v / 1000)}k` : `₱${v}`)} tickLine={false} axisLine={false} tick={{ fill: '#96a6c8', fontSize: 12 }} width={52} />
                <Tooltip formatter={(v, name) => [peso(v), SERIES.find((s) => s.key === name)?.label]} cursor={{ fill: 'rgba(74,133,255,0.08)' }} contentStyle={{ background: '#0c1630', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, color: '#eef3fd' }} labelStyle={{ color: '#eef3fd' }} />
                {SERIES.map((s) => (
                  <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={26} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="th">Month</th>
              <th className="th text-right">Billed</th>
              <th className="th text-right">Collected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {collection.series.map((d) => (
              <tr key={d.label}>
                <td className="td">{periodLabel(d.year, d.month)}</td>
                <td className="td text-right tabular-nums">{peso(d.billed)}</td>
                <td className="td text-right tabular-nums">{peso(d.collected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function ListCard({ title, empty, to, linkLabel, children, count }) {
  return (
    <Card
      title={title}
      bodyClassName="p-0"
      actions={
        to && (
          <Link to={to} className="-my-2 -mr-2 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-navy-300 hover:underline md:my-0 md:mr-0 md:min-h-0 md:px-0">
            {linkLabel || 'See all'}
          </Link>
        )
      }
    >
      {count === 0 ? <EmptyState title={empty} /> : <ul className="divide-y divide-slate-100">{children}</ul>}
    </Card>
  );
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useApi('/dashboard');
  const phone = usePhone();
  if (loading && !data) return <PageSkeleton label="Loading your dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (phone) return <PhoneDashboard data={data} onChanged={reload} />;
  const { cards: c, attention, collection, dueSoon, pendingPayments, recentPayments, recentActivity, occupancy, period } = data;

  return (
    <>
      <PageHeader title={`${greeting()} 👋`} subtitle={`Here's how your boarding house is doing in ${period.label}.`} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total Rooms" value={c.totalRooms} icon={DoorOpen} />
        <StatCard label="Occupied Spaces" value={`${c.occupiedSpaces} / ${c.totalSpaces}`} icon={BedDouble} />
        <StatCard label="Available Spaces" value={c.availableSpaces} icon={BedDouble} tone="green" />
        <StatCard label="Active Tenants" value={c.activeTenants} icon={Users} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Unpaid Bills" value={peso(c.unpaidAmount)} hint={`${c.unpaidCount} bill${c.unpaidCount === 1 ? '' : 's'}`} icon={Receipt} tone="red" />
        <StatCard label="Overdue Bills" value={peso(c.overdueAmount)} hint={`${c.overdueCount} bill${c.overdueCount === 1 ? '' : 's'} past due`} icon={AlertTriangle} tone="amber" />
        <StatCard label="Collected This Month" value={peso(c.collectedThisMonth)} icon={Wallet} tone="green" />
      </div>

      <div className="mt-6">
        <Attention items={attention} />
      </div>
      <div className="mt-6">
        <TenantAppCard />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3 [&>*]:min-w-0">
        <div className="xl:col-span-2">
          <CollectionCard collection={collection} period={period.label} />
        </div>
        <ListCard title="Bills Due Soon" empty="No bills are due in the next 7 days" to="/bills" count={dueSoon.length}>
          {dueSoon.map((b) => (
            <li key={b._id}>
              <Link to={`/bills/${b._id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{b.tenantName}</p>
                  <p className="text-sm text-slate-500">
                    Room {b.roomNumber} · due {shortDate(b.dueDate)}
                  </p>
                </div>
                <span className="font-semibold text-slate-900 tabular-nums">{peso(b.remainingBalance)}</span>
              </Link>
            </li>
          ))}
        </ListCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
        <ListCard title="Recent Payments" empty="No payments yet" to="/payments" count={pendingPayments.length + recentPayments.length}>
          {pendingPayments.map((p) => (
            <li key={p._id}>
              <Link to={`/payments?open=${p._id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-amber-50/60">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{p.tenantName}</p>
                  <p className="flex items-center gap-1 text-sm text-amber-700">
                    <Hourglass className="h-3.5 w-3.5" aria-hidden /> Waiting for verification · {methodLabel(p.paymentMethod)}
                  </p>
                </div>
                <span className="font-semibold tabular-nums">{peso(p.amount)}</span>
              </Link>
            </li>
          ))}
          {recentPayments.map((p) => (
            <li key={p._id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-800">{p.tenantName}</p>
                <p className="text-sm text-slate-500">
                  {formatDate(p.paymentDate)} · {methodLabel(p.paymentMethod)}
                </p>
              </div>
              <span className="font-semibold text-emerald-700 tabular-nums">{peso(p.amount)}</span>
            </li>
          ))}
        </ListCard>

        <ListCard title="Recent Activity" empty="Nothing has happened yet" to="/activity" count={recentActivity.length}>
          {recentActivity.map((a) => (
            <li key={a.key} className="px-5 py-3">
              <p className="font-semibold text-slate-800">{a.title}</p>
              <p className="text-sm text-slate-600">{a.description}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                <Clock className="h-3 w-3" aria-hidden /> {timeAgo(a.createdAt)}
              </p>
            </li>
          ))}
        </ListCard>

        <ListCard title="Room Occupancy" empty="No rooms yet" to="/rooms" linkLabel="All rooms" count={occupancy.length}>
          {occupancy.map((r) => (
            <li key={r._id}>
              <Link to={`/rooms/${r._id}`} className="block px-5 py-3 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800">Room {r.roomNumber}</p>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    <div className="h-full rounded-full bg-navy-600" style={{ width: `${(r.occupiedBeds / r.capacity) * 100}%` }} />
                  </div>
                  <span className="text-sm text-slate-600 tabular-nums">
                    {r.occupiedBeds}/{r.capacity}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ListCard>
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">Updated {formatDateTime(new Date())}</p>
    </>
  );
}
