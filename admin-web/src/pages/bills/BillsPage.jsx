import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FilePlus2, LayoutGrid, List, Receipt, Send } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { useApi, usePersistentState } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Alert, Button, Card, Checkbox, ConfirmDialog, DataTable, EmptyState, ErrorState, Input, Modal, PageHeader, SearchInput, StatCard, StatusBadge, StickyBar, StickyBarSpacer, cx, Chip, ChipRow, SkeletonCards } from '../../components/ui';
import { BillCard, MonthPicker } from '../../components/cards';
import { currentPeriod, peso, periodLabel, shortDate } from '../../utils/format';
import { CircleAlert, Clock, Wallet } from 'lucide-react';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Not sent yet' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIALLY_PAID', label: 'Partially paid' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'PAID', label: 'Paid' },
];

function CreateBillsModal({ open, onClose, period, settings, onDone }) {
  const toast = useToast();
  const [dueDate, setDueDate] = useState('');
  const [water, setWater] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const day = Math.min(settings?.defaultDueDay || 5, new Date(Date.UTC(period.year, period.month, 0)).getUTCDate());
    setDueDate(`${period.year}-${String(period.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    setWater(Boolean(settings?.waterEnabled));
    setResult(null);
    setError('');
  }, [open, period, settings]);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/bills/generate', { billingYear: period.year, billingMonth: period.month, dueDate, includeWater: water });
      setResult(res.data);
      toast.success(`${res.data.createdCount} bill(s) created.`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Create bills for ${periodLabel(period.year, period.month)}`}
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving} disabled={!dueDate}>
              Create Bills
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3 text-[15px]">
          <Alert tone="success">
            {result.createdCount} bill(s) created. Check them, then press <strong>Send Bills to Tenants</strong> so tenants can see them.
          </Alert>
          {result.skipped.length > 0 && (
            <div>
              <p className="font-semibold text-slate-700">Skipped</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
                {result.skipped.map((s) => (
                  <li key={s.tenantId}>
                    {s.tenantName}: {s.reason.toLowerCase()}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 text-[15px]">
          {error && <Alert tone="error">{error}</Alert>}
          <p className="text-slate-600">We&apos;ll make a bill for every tenant who stayed this month, using their rent and the electricity readings you recorded. You can check and change each bill before sending it.</p>
          <Input label="Due date" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Checkbox label={`Add water (${peso(settings?.waterChargePerTenant)} per tenant)`} checked={water} onChange={(e) => setWater(e.target.checked)} />
        </div>
      )}
    </Modal>
  );
}

export default function BillsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [period, setPeriod] = useState(currentPeriod());
  const [filter, setFilter] = useState(params.get('status') || '');
  const [view, setView] = usePersistentState('bills.view', 'cards');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [sending, setSending] = useState(null);
  const [busy, setBusy] = useState(false);
  const bills = useApi('/bills', { billingYear: period.year, billingMonth: period.month, limit: 500 });
  const summary = useApi('/bills/summary', { billingYear: period.year, billingMonth: period.month });
  const settings = useApi('/settings');

  useEffect(() => setSelected([]), [period, filter]);
  // Arriving from the dashboard 'Create bills' shortcut opens the form straight away.
  useEffect(() => {
    if (params.get('create')) setCreateOpen(true);
  }, [params]);
  const reloadAll = () => {
    bills.reload();
    summary.reload();
  };
  const s = summary.data?.summary;

  const items = useMemo(() => {
    let list = bills.data?.items || [];
    if (filter === 'DRAFT') list = list.filter((b) => b.state === 'DRAFT');
    else if (filter) list = list.filter((b) => b.state === 'PUBLISHED' && b.status === filter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((b) => [b.tenantName, b.roomNumber].some((v) => v && String(v).toLowerCase().includes(q)));
    return list;
  }, [bills.data, filter, search]);
  const drafts = items.filter((b) => b.state === 'DRAFT');

  const send = async () => {
    setBusy(true);
    try {
      const body = sending === 'selected' ? { billIds: selected } : { billingYear: period.year, billingMonth: period.month };
      const res = await api.post('/bills/publish', body);
      toast.success(`${res.data.publishedCount} bill(s) sent. Tenants have been notified.`);
      setSending(null);
      setSelected([]);
      reloadAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id) => setSelected((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const allBills = bills.data?.items || [];
  const sendCount = selected.length || s?.drafts || 0;
  const sendTotal = selected.length ? allBills.filter((x) => selected.includes(x._id)).reduce((t, x) => t + (x.totalAmount || 0), 0) : s?.draftTotal || 0;
  const sendBlocked = !bills.data || !summary.data ? '' : !allBills.length ? 'Create bills first' : !sendCount ? `All ${periodLabel(period.year, period.month)} bills are already sent` : '';
  const plural = (n) => `${n} bill${n === 1 ? '' : 's'}`;
  const toSend = sending === 'selected' ? selected.length : s?.drafts || 0;

  return (
    <>
      <PageHeader
        title="Bills"
        subtitle="Create each tenant's monthly bill, check it, then send it"
        actions={
          <>
            <MonthPicker value={period} onChange={setPeriod} />
            <Button variant="secondary" icon={FilePlus2} className="max-md:hidden" onClick={() => setCreateOpen(true)}>
              Create Bills
            </Button>
            <Button icon={Send} className="max-md:hidden" disabled={!s?.drafts} onClick={() => setSending('all')}>
              Send Bills to Tenants{s?.drafts ? ` (${s.drafts})` : ''}
            </Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard compact label="Total billed" value={peso(s?.publishedTotal)} hint={`${s?.published ?? 0} bills sent`} icon={Receipt} />
        <StatCard compact label="Collected" value={peso(s?.collected)} hint={`${s?.paid ?? 0} fully paid`} icon={Wallet} tone="green" />
        <StatCard compact label="Still unpaid" value={peso(s?.balance)} hint={`${s?.overdue ?? 0} overdue`} icon={CircleAlert} tone={s?.overdue ? 'red' : 'amber'} />
        <StatCard compact label="Not sent yet" value={s?.drafts ?? 0} hint="Tenants can't see these yet" icon={Clock} tone="slate" />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <ChipRow label="Show">
          {FILTERS.map((f) => (
            <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </Chip>
          ))}
        </ChipRow>
        <div className="flex gap-2 lg:ml-auto">
          <SearchInput value={search} onChange={setSearch} placeholder="Search tenant or room…" className="flex-1 lg:w-64" />
          <div className="inline-flex rounded-lg border border-slate-300 bg-panel p-0.5" role="group" aria-label="View">
            <button type="button" aria-pressed={view === 'cards'} aria-label="Cards" onClick={() => setView('cards')} className={cx('inline-flex h-11 w-11 items-center justify-center rounded-md md:h-8 md:w-8', view === 'cards' ? 'bg-navy-700 text-white' : 'text-slate-500')}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button type="button" aria-pressed={view === 'list'} aria-label="List" onClick={() => setView('list')} className={cx('inline-flex h-11 w-11 items-center justify-center rounded-md md:h-8 md:w-8', view === 'list' ? 'bg-navy-700 text-white' : 'text-slate-500')}>
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      {selected.length > 0 && (
        <div className="mb-4 hidden items-center justify-between gap-3 rounded-xl border border-navy-200 bg-navy-50 px-4 py-3 md:flex">
          <p className="text-sm font-medium text-navy-300">{selected.length} bill(s) selected</p>
          <Button icon={Send} onClick={() => setSending('selected')}>
            Send Selected
          </Button>
        </div>
      )}

      {bills.loading && !bills.data ? (
        <SkeletonCards label="Loading bills…" />
      ) : bills.error ? (
        <ErrorState message={bills.error} onRetry={bills.reload} />
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Receipt}
            title={bills.data?.items?.length ? 'No bills match this filter' : `No bills for ${periodLabel(period.year, period.month)} yet`}
            message={bills.data?.items?.length ? 'Try another filter.' : 'Tip: record this month’s electricity readings first, then create the bills.'}
            action={!bills.data?.items?.length && <Button icon={FilePlus2} onClick={() => setCreateOpen(true)}>Create Bills</Button>}
          />
        </div>
      ) : view === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((b) => (
            <BillCard key={b._id} bill={b} selectable={b.state === 'DRAFT'} selected={selected.includes(b._id)} onSelect={() => toggle(b._id)} />
          ))}
        </div>
      ) : (
        <Card bodyClassName="p-0">
          <DataTable
            rows={items}
            onRowClick={(b) => navigate(`/bills/${b._id}`)}
            columns={[
              { key: 't', header: 'Tenant', render: (b) => <span className="font-semibold">{b.tenantName}</span> },
              { key: 'r', header: 'Room', render: (b) => b.roomNumber },
              { key: 'total', header: 'Total', align: 'right', render: (b) => peso(b.totalAmount) },
              { key: 'bal', header: 'Still to pay', align: 'right', render: (b) => peso(b.remainingBalance) },
              { key: 'd', header: 'Due', render: (b) => shortDate(b.dueDate) },
              { key: 's', header: 'Status', render: (b) => <StatusBadge status={b.state === 'PUBLISHED' ? b.status : b.state} /> },
            ]}
          />
        </Card>
      )}
      {drafts.length > 0 && !selected.length && <p className="mt-4 text-center text-sm text-slate-500">Tip: tick “Select” on bills to send only some of them.</p>}

      <StickyBarSpacer />
      <StickyBar>
        <div className="flex gap-2">
          <Button variant="secondary" icon={FilePlus2} onClick={() => setCreateOpen(true)}>
            Create
          </Button>
          <Button className="flex-1" icon={Send} disabled={!sendCount} onClick={() => setSending(selected.length ? 'selected' : 'all')}>
            {sendCount ? `Send ${plural(sendCount)}` : 'Send bills'}
          </Button>
        </div>
        {sendBlocked && <p className="mt-1.5 text-center text-xs text-slate-600">{sendBlocked}</p>}
      </StickyBar>
      <CreateBillsModal open={createOpen} onClose={() => setCreateOpen(false)} period={period} settings={settings.data?.settings} onDone={reloadAll} />
      <ConfirmDialog
        open={Boolean(sending)}
        onClose={() => setSending(null)}
        title={`Send ${plural(toSend)}?`}
        message={
          <div className="space-y-3">
            <dl className="divide-y divide-slate-200 rounded-lg bg-slate-50 px-3">
              <div className="flex justify-between gap-3 py-2">
                <dt>Bills</dt>
                <dd className="font-semibold text-slate-900">{sending === 'selected' ? `${selected.length} selected` : `All ${s?.drafts ?? 0} not sent yet`}</dd>
              </div>
              <div className="flex justify-between gap-3 py-2">
                <dt>Month</dt>
                <dd className="font-semibold text-slate-900">{periodLabel(period.year, period.month)}</dd>
              </div>
              <div className="flex justify-between gap-3 py-2">
                <dt>Total amount</dt>
                <dd className="font-semibold text-slate-900 tabular-nums">{peso(sending === 'selected' ? sendTotal : s?.draftTotal)}</dd>
              </div>
            </dl>
            <p>The bills will appear in the tenants&apos; app and they&apos;ll be notified. After sending, you can still add a discount or an extra charge.</p>
          </div>
        }
        confirmLabel={`Send ${plural(toSend)}`}
        loading={busy}
        onConfirm={send}
      />
    </>
  );
}
