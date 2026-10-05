import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  Ban,
  BellRing,
  CircleCheck,
  CircleX,
  CreditCard,
  DoorOpen,
  History,
  KeyRound,
  Megaphone,
  Receipt,
  Send,
  Settings,
  User,
  UserMinus,
  UserPlus,
  Zap,
} from 'lucide-react';
import { useApi, useDebounce } from '../../hooks/useApi';
import { Badge, Button, Card, DescriptionList, EmptyState, ErrorState, Input, Modal, PageHeader, Pagination, SearchInput, cx, Chip, ChipRow, SkeletonList } from '../../components/ui';
import { formatDateTime, peso } from '../../utils/format';
import PaymentDetailModal from '../../components/PaymentDetailsModal';

const ICONS = {
  payment: { icon: CreditCard, tone: 'bg-amber-50 text-amber-700' },
  'payment-confirmed': { icon: CircleCheck, tone: 'bg-emerald-50 text-emerald-700' },
  'payment-rejected': { icon: CircleX, tone: 'bg-red-50 text-red-700' },
  bill: { icon: Receipt, tone: 'bg-navy-50 text-navy-300' },
  send: { icon: Send, tone: 'bg-navy-50 text-navy-300' },
  cancel: { icon: Ban, tone: 'bg-red-50 text-red-700' },
  reminder: { icon: BellRing, tone: 'bg-amber-50 text-amber-700' },
  'tenant-add': { icon: UserPlus, tone: 'bg-emerald-50 text-emerald-700' },
  tenant: { icon: User, tone: 'bg-navy-50 text-navy-300' },
  'tenant-remove': { icon: UserMinus, tone: 'bg-red-50 text-red-700' },
  key: { icon: KeyRound, tone: 'bg-slate-100 text-slate-700' },
  room: { icon: DoorOpen, tone: 'bg-violet-50 text-violet-700' },
  transfer: { icon: ArrowLeftRight, tone: 'bg-violet-50 text-violet-700' },
  electricity: { icon: Zap, tone: 'bg-amber-50 text-amber-700' },
  announcement: { icon: Megaphone, tone: 'bg-navy-50 text-navy-300' },
  settings: { icon: Settings, tone: 'bg-slate-100 text-slate-700' },
  activity: { icon: History, tone: 'bg-slate-100 text-slate-700' },
};

const FILTERS = [
  { value: '', label: 'Everything' },
  { value: 'payments', label: 'Payments' },
  { value: 'bills', label: 'Bills' },
  { value: 'tenants', label: 'Tenants' },
  { value: 'rooms', label: 'Rooms' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'announcements', label: 'Announcements' },
  { value: 'account', label: 'Settings & sign-in' },
];

function ActivityIcon({ name, size = 'md' }) {
  const { icon: Icon, tone } = ICONS[name] || ICONS.activity;
  return (
    <span className={cx('flex shrink-0 items-center justify-center rounded-lg', tone, size === 'lg' ? 'h-12 w-12' : 'h-9 w-9')}>
      <Icon className={size === 'lg' ? 'h-6 w-6' : 'h-[18px] w-[18px]'} aria-hidden />
    </span>
  );
}

const StatusPill = ({ status }) => <Badge tone={status.tone}>{status.label}</Badge>;

/** Simple, friendly details for activities that don't have their own page. */
function ActivityModal({ item, onClose }) {
  if (!item) return null;
  return (
    <Modal open onClose={onClose} title="Activity Details" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <ActivityIcon name={item.icon} size="lg" />
          <div>
            <p className="text-lg font-semibold text-slate-900">{item.title}</p>
            <p className="text-sm text-slate-600">{item.description}</p>
          </div>
        </div>
        <DescriptionList
          items={[
            ['Person', item.person],
            ['Done by', item.doneBy],
            ['Date & time', formatDateTime(item.createdAt)],
            ['Status', <StatusPill key="s" status={item.status} />],
            item.amount !== undefined && ['Amount', peso(item.amount)],
            item.period && ['Month', item.period],
            item.roomNumber && ['Room', `Room ${item.roomNumber}`],
            item.reference && ['Reference number', item.reference],
            item.reason && ['Reason given', item.reason],
          ]}
        />
      </div>
    </Modal>
  );
}

export default function ActivityHistoryPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [paymentId, setPaymentId] = useState(null);
  const [detail, setDetail] = useState(null);
  const q = useDebounce(search);
  const { data, loading, error, reload } = useApi('/activity', { category: category || undefined, search: q || undefined, from: from || undefined, to: to || undefined, page, limit: 25 });

  const open = (item) => {
    const l = item.link;
    if (l?.page === 'payment' && l.id) return setPaymentId(l.id);
    if (l?.page === 'bill' && l.id) return navigate(`/bills/${l.id}`);
    if (l?.page === 'tenant' && l.id) return navigate(`/tenants/${l.id}`);
    if (l?.page === 'room' && l.id) return navigate(`/rooms/${l.id}`);
    if (l?.page === 'electricity') return navigate('/electricity');
    if (l?.page === 'announcements') return navigate('/announcements');
    if (l?.page === 'settings') return navigate('/settings');
    return setDetail(item);
  };

  const reset = (fn) => (v) => {
    fn(v);
    setPage(1);
  };
  const items = data?.items || [];

  return (
    <>
      <PageHeader title="Activity History" subtitle="A record of everything that happened in your boarding house: payments, bills, tenants and rooms." />

      <Card bodyClassName="p-0">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <ChipRow label="Show">
            {FILTERS.map((f) => (
              <Chip key={f.value} active={category === f.value} onClick={() => reset(setCategory)(f.value)}>
                {f.label}
              </Chip>
            ))}
          </ChipRow>
          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
            <SearchInput value={search} onChange={reset(setSearch)} placeholder="Search by tenant name, room or reference number…" className="col-span-2 sm:col-span-1" />
            <Input label="From" type="date" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} />
            <Input label="To" type="date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} />
          </div>
        </div>

        {loading && !data ? (
          <SkeletonList rows={6} label="Loading activity…" />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : items.length === 0 ? (
          <EmptyState icon={History} title="No activity found" message={search || category || from || to ? 'Try a different search or filter.' : 'Activities will appear here as you use the system.'} />
        ) : (
          <div className={cx(loading && 'opacity-60')}>
            <table className="hidden w-full xl:table">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th">Activity</th>
                  <th className="th">Description</th>
                  <th className="th">Person</th>
                  <th className="th">Date &amp; Time</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.key} className="hover:bg-slate-50/70">
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <ActivityIcon name={item.icon} />
                        <span className="font-semibold text-slate-900">{item.title}</span>
                      </div>
                    </td>
                    <td className="td min-w-[13rem] text-slate-600">
                      {item.description}
                      {item.reference && <span className="mt-0.5 block text-xs break-all text-slate-500">Ref: {item.reference}</span>}
                    </td>
                    <td className="td">{item.person}</td>
                    <td className="td text-slate-600">{formatDateTime(item.createdAt)}</td>
                    <td className="td">
                      <StatusPill status={item.status} />
                    </td>
                    <td className="td text-right">
                      <Button size="sm" variant="secondary" onClick={() => open(item)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-slate-100 xl:hidden">
              {items.map((item) => (
                <li key={item.key}>
                  <button type="button" onClick={() => open(item)} className="flex w-full gap-3 px-4 py-4 text-left active:bg-slate-50">
                    <ActivityIcon name={item.icon} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{item.title}</span>
                        <StatusPill status={item.status} />
                      </span>
                      <span className="mt-1 block text-sm text-slate-600">{item.description}</span>
                      <span className="mt-1 block text-xs text-slate-500">{formatDateTime(item.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Pagination page={data?.page} pages={data?.pages} total={data?.total} onChange={setPage} />
      </Card>

      <PaymentDetailModal paymentId={paymentId} onClose={() => setPaymentId(null)} onChanged={reload} />
      <ActivityModal item={detail} onClose={() => setDetail(null)} />
    </>
  );
}
