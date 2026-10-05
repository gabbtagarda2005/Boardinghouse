import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BellRing, CircleCheck, Plus, SlidersHorizontal, Wallet } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { useApi, useDebounce } from '../../hooks/useApi';
import { useNotifications } from '../../context/NotificationContext';
import { useToast } from '../../context/ToastContext';
import { Button, Card, EmptyState, ErrorState, Modal, PageHeader, Pagination, SearchInput, Select, StatusBadge, cx, Chip, ChipRow, HScroll, SkeletonList, SkeletonCards } from '../../components/ui';
import { DateRangeField } from '../../components/RangePickers';
import { PaymentCard } from '../../components/cards';
import PaymentDetailsModal from '../../components/PaymentDetailsModal';
import RecordPaymentModal from './RecordPaymentModal';
import { formatLongDate, METHOD_LABELS, peso, periodLabel } from '../../utils/format';

const TABS = [
  { value: 'verify', label: 'Needs Verification', chip: 'To check', status: 'PENDING_VERIFICATION' },
  { value: 'confirmed', label: 'Confirmed', chip: 'Confirmed', status: 'CONFIRMED' },
  { value: 'rejected', label: 'Rejected', chip: 'Rejected', status: 'REJECTED' },
  { value: 'overdue', label: 'Overdue', chip: 'Overdue' },
];
const NO_FILTERS = { method: '', from: '', to: '' };

/** Payment method and date filters, in a sheet that slides up on phones. */
function FiltersSheet({ open, value, onApply, onClose }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filters"
      size="sm"
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button variant="secondary" onClick={() => onApply(NO_FILTERS)}>
            Reset
          </Button>
          <Button onClick={() => onApply(draft)}>Apply</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Select label="Payment method" value={draft.method} onChange={(e) => setDraft((d) => ({ ...d, method: e.target.value }))} placeholder="Any method" options={Object.entries(METHOD_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
        <DateRangeField label="Date sent" value={{ from: draft.from, to: draft.to }} onChange={({ from, to }) => setDraft((d) => ({ ...d, from, to }))} />
      </div>
    </Modal>
  );
}

function OverdueList() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi('/bills', { status: 'OVERDUE', limit: 200 });
  const [sending, setSending] = useState(null);
  const [record, setRecord] = useState(null);
  const remind = async (b) => {
    setSending(b._id);
    try {
      await api.post(`/bills/${b._id}/remind`, {});
      toast.success(`Reminder sent to ${b.tenantName}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(null);
    }
  };
  if (loading && !data) return <div className="card"><SkeletonList label="Loading overdue bills…" /></div>;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const items = data?.items || [];
  if (!items.length) return <div className="card"><EmptyState icon={CircleCheck} title="No overdue bills" message="Everyone is paying on time." /></div>;
  return (
    <div className="space-y-3">
      {items.map((b) => (
        <article key={b._id} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">{b.tenantName}</h3>
              <StatusBadge status="OVERDUE" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">{peso(b.remainingBalance)}</p>
            <p className="text-sm text-slate-600">
              {periodLabel(b.billingYear, b.billingMonth)} bill · Room {b.roomNumber} · was due {formatLongDate(b.dueDate)}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:w-48">
            <Button variant="secondary" icon={BellRing} loading={sending === b._id} onClick={() => remind(b)}>
              Send Reminder
            </Button>
            <Button variant="secondary" icon={Wallet} onClick={() => setRecord(b)}>
              Record Payment
            </Button>
            <Link to={`/bills/${b._id}`} className="text-center text-sm font-semibold text-navy-300 hover:underline">
              View Bill
            </Link>
          </div>
        </article>
      ))}
      <RecordPaymentModal open={Boolean(record)} onClose={() => setRecord(null)} presetTenant={record && { _id: record.tenantId, name: record.tenantName }} presetBill={record} onDone={reload} />
    </div>
  );
}

export default function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  // Tab and opened payment live in state; the URL is only read on arrival (links from notifications/dashboard).
  const [tab, setTab] = useState(params.get('tab') || 'verify');
  const [openId, setOpenId] = useState(params.get('open'));
  const [openAction, setOpenAction] = useState(null);
  useEffect(() => {
    if (params.get('open')) setOpenId(params.get('open'));
    if (params.get('tab')) setTab(params.get('tab'));
  }, [params]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [recordOpen, setRecordOpen] = useState(false);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = (filters.method ? 1 : 0) + (filters.from || filters.to ? 1 : 0);
  const q = useDebounce(search);
  const { pendingSignal } = useNotifications();
  const current = TABS.find((t) => t.value === tab) || TABS[0];
  const { data, loading, error, reload } = useApi(current.status ? '/payments' : null, { status: current.status, search: q || undefined, paymentMethod: filters.method || undefined, from: filters.from || undefined, to: filters.to || undefined, page, limit: 20 });

  useEffect(() => {
    if (pendingSignal) reload();
  }, [pendingSignal, reload]);
  useEffect(() => setPage(1), [tab, q, filters]);

  const closePayment = () => {
    setOpenId(null);
    if (params.get('open')) {
      const next = new URLSearchParams(params);
      next.delete('open');
      setParams(next, { replace: true });
    }
  };
  const pendingCount = data?.pendingCount;

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Check payments tenants sent, and record money you received in person"
        actions={
          <Button icon={Plus} className="max-md:w-full" onClick={() => setRecordOpen(true)}>
            Record a Payment
          </Button>
        }
      />
      <ChipRow label="Show payments" className="mb-3 md:hidden">
        {TABS.map((t) => (
          <Chip key={t.value} active={tab === t.value} count={t.value === 'verify' && pendingCount > 0 ? pendingCount : undefined} onClick={() => setTab(t.value)}>
            {t.chip}
          </Chip>
        ))}
      </ChipRow>
      <HScroll className="mb-4 flex gap-1 border-b border-slate-200 max-md:hidden" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cx('-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-4 text-[15px] font-semibold whitespace-nowrap', tab === t.value ? 'border-navy-700 text-navy-300' : 'border-transparent text-slate-500 hover:text-slate-700')}
          >
            {t.label}
            {t.value === 'verify' && pendingCount > 0 && <span className="ml-2 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-slate-900">{pendingCount}</span>}
          </button>
        ))}
      </HScroll>

      {tab === 'overdue' ? (
        <OverdueList />
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name or reference…" className="min-w-0 flex-1 sm:max-w-md sm:flex-none sm:basis-96" />
            <Button variant="secondary" icon={SlidersHorizontal} onClick={() => setFiltersOpen(true)} aria-label={activeFilters ? `Filters, ${activeFilters} active` : 'Filters'} className="shrink-0">
              <span className="max-sm:sr-only">Filters</span>
              {activeFilters > 0 && <span className="rounded-full bg-navy-700 px-1.5 text-xs font-bold text-white">{activeFilters}</span>}
            </Button>
          </div>
          {loading && !data ? (
            <SkeletonCards count={4} label="Loading payments…" className="space-y-3" />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : !data?.items?.length ? (
            <Card>
              <EmptyState
                icon={tab === 'verify' ? CircleCheck : Wallet}
                title={activeFilters || q ? 'No payments match your filters' : tab === 'verify' ? 'No payments are waiting for you' : tab === 'confirmed' ? 'No confirmed payments yet' : 'No rejected payments'}
                message={tab === 'verify' ? 'When a tenant sends a payment, it will appear here for you to check. Paid in cash? Record it yourself.' : undefined}
                action={activeFilters ? <Button variant="secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button> : tab !== 'rejected' && <Button icon={Plus} onClick={() => setRecordOpen(true)}>Record a Payment</Button>}
              />
            </Card>
          ) : (
            <div className={cx('space-y-3', loading && 'opacity-60')}>
              {data.items.map((p) => (
                <PaymentCard
                  key={p._id}
                  payment={p}
                  onView={() => (setOpenAction(null), setOpenId(p._id))}
                  onConfirm={() => (setOpenAction('confirm'), setOpenId(p._id))}
                  onReject={() => (setOpenAction('reject'), setOpenId(p._id))}
                />
              ))}
              <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
            </div>
          )}
        </>
      )}

      <FiltersSheet
        open={filtersOpen}
        value={filters}
        onClose={() => setFiltersOpen(false)}
        onApply={(v) => {
          setFilters(v);
          setFiltersOpen(false);
        }}
      />
      <PaymentDetailsModal paymentId={openId} initialAction={openAction} onClose={closePayment} onChanged={reload} />
      <RecordPaymentModal open={recordOpen} onClose={() => setRecordOpen(false)} onDone={reload} />
    </>
  );
}
