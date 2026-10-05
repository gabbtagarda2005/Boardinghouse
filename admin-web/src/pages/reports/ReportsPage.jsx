import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { errorMessage } from '../../api/client';
import { useApi, useDebounce, usePersistentState } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Button, Card, DataTable, PageHeader, SearchInput, Select, cx } from '../../components/ui';
import { DateRangeField, MonthRangeField } from '../../components/RangePickers';
import { formatDate, peso } from '../../utils/format';
import { downloadFile } from '../../utils/download';

const REPORTS = [
  { value: 'monthly-collection', label: 'Monthly Collection', help: 'How much you billed and collected each month', filters: ['months', 'dates'] },
  { value: 'outstanding', label: 'Outstanding Payments', help: 'Who still owes money and how much', filters: ['months', 'search'] },
  { value: 'overdue', label: 'Overdue Payments', help: 'Bills that are past their due date', filters: ['months', 'search'] },
  { value: 'occupancy', label: 'Occupancy', help: 'Rooms, spaces, and who lives where', filters: ['search'] },
  { value: 'tenant-list', label: 'Tenant List', help: 'All tenants with contact details and balances', filters: ['search'] },
  { value: 'electricity', label: 'Electricity Charges', help: 'Meter readings and electricity costs per room', filters: ['months', 'search'] },
  { value: 'payment-history', label: 'Payment History', help: 'Every confirmed payment', filters: ['dates', 'search', 'method'] },
  { value: 'monthly-billing', label: 'Monthly Billing', help: 'Every bill with its breakdown', filters: ['months', 'search', 'status'] },
  { value: 'tenant-statement', label: "A Tenant's Statement", help: 'All bills and payments of one tenant', filters: ['tenant', 'months', 'dates'] },
];

const cell = (c, row) => (c.format === 'money' ? peso(row[c.key]) : c.format === 'date' ? formatDate(row[c.key]) : row[c.key] ?? '—');

export default function ReportsPage() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [type, setType] = usePersistentState('reports.type', params.get('type') || 'monthly-collection');
  const [f, setF] = useState({ fromPeriod: '', toPeriod: '', from: '', to: '', search: '', status: '', method: '', tenantId: '' });
  const [exporting, setExporting] = useState('');
  const def = REPORTS.find((r) => r.value === type) || REPORTS[0];
  const has = (k) => def.filters.includes(k);
  const search = useDebounce(f.search);
  const query = Object.fromEntries(
    Object.entries({
      fromPeriod: has('months') && f.fromPeriod,
      toPeriod: has('months') && f.toPeriod,
      from: has('dates') && f.from,
      to: has('dates') && f.to,
      search: has('search') && search,
      status: has('status') && f.status,
      method: has('method') && f.method,
      tenantId: has('tenant') && f.tenantId,
    }).filter(([, v]) => v)
  );
  const needsTenant = def.value === 'tenant-statement' && !f.tenantId;
  const { data, loading, error, reload } = useApi(needsTenant ? null : `/reports/${def.value}`, query);
  const tenants = useApi(def.value === 'tenant-statement' ? '/tenants' : null, { status: 'ALL' });
  const report = data?.report;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: typeof e === 'string' ? e : e.target.value }));

  const exportAs = async (format) => {
    setExporting(format);
    try {
      await downloadFile(`/reports/${def.value}`, `${def.value}.${format}`, { ...query, format });
    } catch (e) {
      toast.error(errorMessage(e, 'We couldn’t create the file. Please try again.'));
    } finally {
      setExporting('');
    }
  };

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Summaries of your money, tenants and rooms. Download them as PDF or Excel."
        actions={
          <>
            <Button variant="secondary" icon={FileText} loading={exporting === 'pdf'} disabled={!report} onClick={() => exportAs('pdf')}>
              Export PDF
            </Button>
            <Button variant="secondary" icon={FileSpreadsheet} loading={exporting === 'xlsx'} disabled={!report} onClick={() => exportAs('xlsx')}>
              Export Excel
            </Button>
          </>
        }
      />
      <Select className="mb-4 sm:hidden" label="Report" value={def.value} onChange={(e) => setType(e.target.value)} options={REPORTS.map((r) => ({ value: r.value, label: r.label }))} hint={def.help} />
      <div className="mb-6 hidden gap-2 sm:grid sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <button key={r.value} type="button" onClick={() => setType(r.value)} aria-pressed={def.value === r.value} className={cx('rounded-xl border p-4 text-left transition-colors', def.value === r.value ? 'border-navy-600 bg-navy-50 ring-1 ring-navy-600' : 'border-slate-200 bg-panel hover:border-navy-300')}>
            <p className="font-semibold text-slate-900">{r.label}</p>
            <p className="text-sm text-slate-500">{r.help}</p>
          </button>
        ))}
      </div>

      <Card className="mb-6" title="Filters">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
          {has('tenant') && <Select label="Tenant" value={f.tenantId} onChange={set('tenantId')} placeholder="Choose a tenant" options={(tenants.data?.items || []).map((t) => ({ value: t._id, label: t.name }))} />}
          {has('months') && (
            <div className="sm:col-span-2">
              <MonthRangeField value={{ from: f.fromPeriod, to: f.toPeriod }} onChange={({ from, to }) => setF((x) => ({ ...x, fromPeriod: from, toPeriod: to }))} />
            </div>
          )}
          {has('dates') && (
            <div className="sm:col-span-2">
              <DateRangeField label="Payment dates" value={{ from: f.from, to: f.to }} onChange={({ from, to }) => setF((x) => ({ ...x, from, to }))} />
            </div>
          )}
          {has('status') && <Select label="Status" value={f.status} onChange={set('status')} placeholder="Any" options={[['UNPAID', 'Unpaid'], ['PARTIALLY_PAID', 'Partially paid'], ['PAID', 'Paid'], ['OVERDUE', 'Overdue']].map(([value, label]) => ({ value, label }))} />}
          {has('method') && <Select label="Payment method" value={f.method} onChange={set('method')} placeholder="Any" options={[['GCASH', 'GCash'], ['MAYA', 'Maya'], ['BANK_TRANSFER', 'Bank transfer'], ['CASH', 'Cash'], ['OTHER', 'Other']].map(([value, label]) => ({ value, label }))} />}
          {has('search') && (
            <div>
              <span className="label">Search</span>
              <SearchInput value={f.search} onChange={set('search')} placeholder="Name, room…" />
            </div>
          )}
        </div>
      </Card>

      <Card title={report?.title || def.label} subtitle={report?.subtitle} bodyClassName="p-0">
        {needsTenant ? (
          <p className="px-5 py-10 text-center text-slate-500">Choose a tenant above to see their statement.</p>
        ) : (
          <>
            <DataTable
              rowKey="__k"
              rows={(report?.rows || []).map((r, i) => ({ ...r, __k: i }))}
              loading={loading}
              error={error}
              onRetry={reload}
              emptyTitle="Nothing to show for these filters"
              columns={(report?.columns || []).map((c, i) => ({ key: `${c.key}${i}`, header: c.header, align: c.format === 'money' || c.align === 'right' ? 'right' : undefined, render: (row) => cell(c, row) }))}
            />
            {report?.summary?.length > 0 && (
              <dl className="grid gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
                {report.summary.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-sm text-slate-500">{k}</dt>
                    <dd className="text-xl font-bold text-slate-900">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </Card>
    </>
  );
}
