import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, UserPlus } from 'lucide-react';
import { useApi, useDebounce, usePersistentState } from '../../hooks/useApi';
import { Button, Card, DataTable, PageHeader, SearchInput, Select, StatusBadge, cx, Chip, ChipRow } from '../../components/ui';
import { peso, shortDate } from '../../utils/format';
import TenantFormModal from './TenantFormModal';
import SignupRequests from './SignupRequests';

const PAY_FILTERS = [
  { value: '', label: 'Everyone' },
  { value: 'WAITING_FOR_VERIFICATION', label: 'Waiting for verification' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'UP_TO_DATE', label: 'Paid' },
];

/** Tenant list: who lives where, what they owe and when it's due. */
export function TenantTable({ tenants, loading, error, onRetry, onOpen, emptyTitle, emptyAction }) {
  const columns = [
    {
      key: 'name',
      header: 'Tenant',
      render: (t) => (
        <div>
          <p className="font-semibold text-slate-900">{t.name}</p>
          <p className="text-sm text-slate-500">{t.phone || t.email}</p>
        </div>
      ),
    },
    { key: 'room', header: 'Room', render: (t) => (t.currentRoomNumber ? `Room ${t.currentRoomNumber}` : <span className="text-slate-500">No room</span>) },
    { key: 'rent', header: 'Monthly Rent', align: 'right', className: 'max-xl:hidden', render: (t) => (t.monthlyRent ? peso(t.monthlyRent) : '—') },
    { key: 'balance', header: 'Current Balance', align: 'right', render: (t) => <span className={cx('font-semibold', t.balance > 0 ? 'text-slate-900' : 'text-slate-500')}>{peso(t.balance)}</span> },
    { key: 'due', header: 'Due Date', render: (t) => (t.nextDueDate ? shortDate(t.nextDueDate) : '—') },
    { key: 'status', header: 'Payment Status', render: (t) => (t.status === 'ACTIVE' ? <StatusBadge status={t.paymentStatus} /> : <StatusBadge status={t.status} />) },
    {
      key: 'actions',
      header: 'Actions',
      className: 'max-xl:hidden',
      render: (t) => (
        <Button size="sm" variant="secondary" onClick={(e) => (e.stopPropagation(), onOpen(t))}>
          View
        </Button>
      ),
    },
  ];
  return <DataTable columns={columns} rows={tenants} loading={loading} error={error} onRetry={onRetry} onRowClick={onOpen} emptyTitle={emptyTitle} emptyAction={emptyAction} mobileCard={TenantMobileCard} />;
}

/** Phone card: name + status, room and bed underneath, balance on the right (red when overdue). */
function TenantMobileCard(t) {
  const active = t.status === 'ACTIVE';
  const overdue = active && t.paymentStatus === 'OVERDUE';
  const place = t.currentRoomNumber ? `Room ${t.currentRoomNumber}${t.currentBedNumber ? ` · Bed ${t.currentBedNumber}` : ''}` : 'No room';
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 truncate font-semibold text-slate-900">{t.name}</p>
          {!overdue && <StatusBadge status={active ? t.paymentStatus : t.status} />}
        </div>
        <p className="mt-0.5 text-sm text-slate-500">{place}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cx('font-semibold tabular-nums', overdue ? 'text-red-700' : t.balance > 0 ? 'text-slate-900' : 'text-slate-500')}>{peso(t.balance)}</p>
        {overdue && <StatusBadge status="OVERDUE" tone="red" />}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
    </div>
  );
}

export default function TenantsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = usePersistentState('tenants.status', 'ACTIVE');
  const [pay, setPay] = usePersistentState('tenants.pay', '');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const q = useDebounce(search);
  const { data, loading, error, reload } = useApi('/tenants', { status, search: q || undefined });
  const tenants = useMemo(() => (data?.items || []).filter((t) => !pay || t.paymentStatus === pay), [data, pay]);

  return (
    <>
      <PageHeader
        title="Tenants"
        subtitle="Who lives where, how much they owe, and when it's due"
        actions={
          <Button icon={UserPlus} className="max-md:w-full" onClick={() => setFormOpen(true)}>
            Add Tenant
          </Button>
        }
      />
      <SignupRequests onChanged={reload} />
      <Card bodyClassName="p-0">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name, room or phone number…" className="flex-1" />
            <Select
              aria-label="Show"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: 'ACTIVE', label: 'Current tenants' },
                { value: 'MOVED_OUT', label: 'Moved out' },
                { value: 'INACTIVE', label: 'Removed' },
                { value: 'ALL', label: 'Everyone' },
              ]}
              className="sm:w-48"
            />
          </div>
          <ChipRow label="Payment status">
            {PAY_FILTERS.map((f) => (
              <Chip key={f.value} active={pay === f.value} onClick={() => setPay(f.value)}>
                {f.label}
              </Chip>
            ))}
          </ChipRow>
        </div>
        <TenantTable tenants={tenants} loading={loading} error={error} onRetry={reload} onOpen={(t) => navigate(`/tenants/${t._id}`)} emptyTitle={search || pay ? 'No tenants match your search' : 'No tenants yet'} emptyAction={!search && !pay && <Button icon={UserPlus} onClick={() => setFormOpen(true)}>Add Tenant</Button>} />
        {!loading && data && <p className="px-4 py-3 text-sm text-slate-500">{tenants.length} tenant{tenants.length === 1 ? '' : 's'}</p>}
      </Card>
      <TenantFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          reload();
        }}
      />
    </>
  );
}
