import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftRight, BedDouble, ChevronLeft, Copy, DoorOpen, FileText, KeyRound, Lock, Mail, Pencil, UserCheck, UserX, Wallet } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Alert, Button, Card, ConfirmDialog, DataTable, ErrorState, Input, Modal, PageHeader, StatCard, StatusBadge, Tabs, PageSkeleton, cx } from '../../components/ui';
import { formatDate, formatDateTime, methodLabel, peso, periodLabel, shortDate, toDateInput } from '../../utils/format';
import { downloadFile } from '../../utils/download';
import { useAuth } from '../../context/AuthContext';
import { AccountStatusBadge } from '../../components/AccountStatus';
import TenantFormModal from './TenantFormModal';
import AssignRoomModal from './AssignRoomModal';
import RecordPaymentModal from '../payments/RecordPaymentModal';

function MoveOutModal({ open, onClose, tenant, onDone }) {
  const toast = useToast();
  const [date, setDate] = useState(toDateInput());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`/tenants/${tenant._id}/move-out`, { date, reason: reason || undefined });
      toast.success(`${tenant.name} has moved out. Their bed is now free.`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Is ${tenant?.name} moving out?`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={saving}>
            Yes, Move Out
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">The bed becomes free right away. Their bills and payments are kept, and any unpaid balance can still be collected.</p>
        <Input label="Move-out date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  );
}

/** One titled group in the Details panel, e.g. "Personal Information". */
function Section({ title, children }) {
  return (
    <section className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-xs font-bold tracking-wider text-navy-300 uppercase">{title}</h3>
      <dl className="space-y-3">{children}</dl>
    </section>
  );
}

function Row({ label, children, empty = 'Not provided' }) {
  const has = children !== null && children !== undefined && children !== '';
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={cx('mt-0.5 text-[15px] break-words', has ? 'text-slate-900' : 'text-slate-500')}>{has ? children : empty}</dd>
    </div>
  );
}

export default function TenantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(`/tenants/${id}`);
  const [tab, setTab] = useState('bills');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);
  const { resetPassword } = useAuth();

  if (loading && !data) return <PageSkeleton label="Loading tenant…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const { tenant, assignments, bills, payments, summary, account = {} } = data;
  const ec = tenant.emergencyContact;
  const hasRoom = Boolean(tenant.currentRoomId);

  const act = async (fn, msg) => {
    setBusy(true);
    try {
      const res = await fn();
      toast.success(msg);
      setModal(null);
      reload();
      return res;
    } catch (e) {
      toast.error(errorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/tenants" className="mb-3 hidden items-center gap-1 text-sm font-medium text-slate-500 hover:text-navy-300 md:inline-flex">
        <ChevronLeft className="h-4 w-4" /> All tenants
      </Link>
      <PageHeader
        keepTitleOnMobile
        title={tenant.name}
        subtitle={[tenant.phone, tenant.email].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="secondary" icon={Pencil} onClick={() => setModal('edit')}>
              Edit Details
            </Button>
            {tenant.status !== 'INACTIVE' &&
              (hasRoom ? (
                <>
                  <Button variant="secondary" icon={ArrowLeftRight} onClick={() => setModal('transfer')}>
                    Move to Another Room
                  </Button>
                  <Button variant="secondary" icon={DoorOpen} onClick={() => setModal('moveout')}>
                    Move Out
                  </Button>
                </>
              ) : (
                <Button variant="secondary" icon={BedDouble} onClick={() => setModal('assign')}>
                  Assign Room
                </Button>
              ))}
            <Button icon={Wallet} onClick={() => setModal('payment')} disabled={summary.balance <= 0}>
              Record Payment
            </Button>
          </>
        }
      />
      {!tenant.accountActive && <Alert tone="error" className="mb-4">This tenant has been removed and can no longer sign in to the app.</Alert>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Current Balance" value={peso(summary.balance)} hint={summary.nextDueDate ? `Next due ${shortDate(summary.nextDueDate)}` : 'Nothing to pay'} tone={summary.balance > 0 ? 'amber' : 'green'} icon={Wallet} />
        <StatCard label="Room" value={hasRoom ? `Room ${tenant.currentRoomNumber}` : 'No room'} hint={hasRoom ? `Bed ${tenant.currentBedNumber} · ${peso(tenant.monthlyRent)}/month` : undefined} icon={BedDouble} />
        <StatCard label="Payment Status" value={<StatusBadge status={summary.paymentStatus} />} hint={`Moved in ${formatDate(tenant.moveInDate)}`} icon={UserCheck} tone="slate" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card bodyClassName="p-0" className="lg:col-span-2">
          <div className="px-4 pt-3">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'bills', label: 'Billing', count: bills.length },
                { value: 'payments', label: 'Payments', count: payments.length },
                { value: 'rooms', label: 'Room History', count: assignments.length },
              ]}
            />
          </div>
          {tab === 'bills' && (
            <DataTable
              rows={bills}
              onRowClick={(b) => navigate(`/bills/${b._id}`)}
              emptyTitle="No bills yet"
              columns={[
                { key: 'm', header: 'Month', render: (b) => periodLabel(b.billingYear, b.billingMonth) },
                { key: 't', header: 'Total', align: 'right', render: (b) => peso(b.totalAmount) },
                { key: 'p', header: 'Paid', align: 'right', render: (b) => peso(b.amountPaid) },
                { key: 'b', header: 'Balance', align: 'right', render: (b) => peso(b.remainingBalance) },
                { key: 'd', header: 'Due', render: (b) => shortDate(b.dueDate) },
                { key: 's', header: 'Status', render: (b) => <StatusBadge status={b.state === 'VOID' ? 'VOID' : b.status} /> },
              ]}
            />
          )}
          {tab === 'payments' && (
            <DataTable
              rows={payments}
              onRowClick={(p) => navigate(`/payments?open=${p._id}`)}
              emptyTitle="No payments yet"
              columns={[
                { key: 'd', header: 'Date', render: (p) => formatDate(p.paymentDate) },
                { key: 'm', header: 'Method', render: (p) => methodLabel(p.paymentMethod, p.provider) },
                { key: 'a', header: 'Amount', align: 'right', render: (p) => peso(p.amount) },
                { key: 's', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
              ]}
            />
          )}
          {tab === 'rooms' && (
            <DataTable
              rows={assignments}
              emptyTitle="Never assigned to a room"
              columns={[
                { key: 'r', header: 'Room', render: (a) => <Link className="text-navy-300 hover:underline" to={`/rooms/${a.roomId}`}>Room {a.roomNumber}</Link> },
                { key: 'b', header: 'Bed', render: (a) => a.bedNumber },
                { key: 'rent', header: 'Rent', align: 'right', render: (a) => peso(a.monthlyRent) },
                { key: 'f', header: 'From', render: (a) => formatDate(a.startDate) },
                { key: 't', header: 'To', render: (a) => (a.endDate ? formatDate(a.endDate) : 'Now') },
              ]}
            />
          )}
        </Card>
        <div className="space-y-6">
          <Card title="Details">
            <div className="space-y-5">
              <Section title="Personal Information">
                <Row label="Full Name">{tenant.name}</Row>
                <Row label="Phone Number">{tenant.phone}</Row>
                <Row label="Email Address">{tenant.email}</Row>
                <Row label="School or Workplace">{tenant.occupation}</Row>
                <Row label="Home Address">{tenant.address}</Row>
                <Row label="Birthday">{tenant.birthDate ? formatDate(tenant.birthDate) : null}</Row>
                <Row label="Emergency Contact">
                  {ec?.name || ec?.phone ? (
                    <>
                      <span className="block">
                        {ec.name}
                        {ec.relationship ? ` (${ec.relationship})` : ''}
                      </span>
                      {ec.phone && <span className="block text-slate-600">{ec.phone}</span>}
                    </>
                  ) : null}
                </Row>
              </Section>
              <Section title="Room Information">
                <Row label="Room" empty="No room yet">{hasRoom ? `Room ${tenant.currentRoomNumber} · Bed ${tenant.currentBedNumber}` : null}</Row>
                <Row label="Monthly Rent" empty="—">{hasRoom ? `${peso(tenant.monthlyRent)} / month` : null}</Row>
                <Row label="Moved In">{tenant.moveInDate ? formatDate(tenant.moveInDate) : null}</Row>
              </Section>
              <Section title="Account Information">
                <Row label="Sign-in Email">{account.email || tenant.email}</Row>
                <Row label="Account Status">
                  <AccountStatusBadge status={account.status} />
                </Row>
                <Row label="Registration Date">{account.registeredAt ? formatDate(account.registeredAt) : null}</Row>
                <Row label="Last Used the App" empty="Not yet">{tenant.lastLoginAt ? formatDateTime(tenant.lastLoginAt) : null}</Row>
                <Row label="Password">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Lock className="h-4 w-4 text-slate-500" aria-hidden /> Hidden for security
                  </span>
                  <span className="mt-1 block text-sm text-slate-500">The tenant&apos;s password cannot be viewed by the owner.</span>
                  {account.temporaryPasswordPending && account.temporaryPasswordExpiresAt && (
                    <span className="mt-1 block text-sm text-amber-700">
                      A temporary password is waiting to be changed by the tenant (works until {formatDateTime(account.temporaryPasswordExpiresAt)}).
                    </span>
                  )}
                  {account.temporaryPasswordExpired && <span className="mt-1 block text-sm text-amber-700">The last temporary password expired. Give a new one if the tenant still needs to sign in.</span>}
                </Row>
                <div className="flex flex-col gap-2 pt-1">
                  <Button variant="secondary" icon={KeyRound} onClick={() => setModal('reset')}>
                    Give a New Password
                  </Button>
                  <Button variant="ghost" icon={Mail} onClick={() => setModal('resetEmail')}>
                    Send Password Reset Email
                  </Button>
                </div>
              </Section>
              <Section title="Notes">
                <Row label="Private Notes" empty="No notes">
                  {tenant.notes ? <span className="whitespace-pre-line">{tenant.notes}</span> : null}
                </Row>
              </Section>
            </div>
          </Card>
          <Card title="More Actions">
            <div className="flex flex-col gap-2">
              <Button variant="secondary" icon={FileText} onClick={() => downloadFile('/reports/tenant-statement', `statement-${tenant.name}.pdf`, { tenantId: tenant._id, format: 'pdf' }).catch((e) => toast.error(errorMessage(e)))}>
                Download Account Statement
              </Button>
              {tenant.accountActive ? (
                <Button variant="danger" icon={UserX} onClick={() => setModal('remove')}>
                  Remove Tenant
                </Button>
              ) : (
                <Button variant="success" icon={UserCheck} loading={busy} onClick={() => act(() => api.post(`/tenants/${id}/reactivate`), 'Tenant account restored.')}>
                  Restore Tenant
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>

      <TenantFormModal open={modal === 'edit'} onClose={() => setModal(null)} tenant={tenant} onSaved={reload} />
      <AssignRoomModal open={modal === 'assign' || modal === 'transfer'} mode={modal === 'transfer' ? 'transfer' : 'assign'} tenant={tenant} onClose={() => setModal(null)} onDone={reload} />
      <MoveOutModal open={modal === 'moveout'} onClose={() => setModal(null)} tenant={tenant} onDone={reload} />
      <RecordPaymentModal open={modal === 'payment'} onClose={() => setModal(null)} presetTenant={{ _id: tenant._id, name: tenant.name }} onDone={reload} />
      <ConfirmDialog
        open={modal === 'remove'}
        onClose={() => setModal(null)}
        title={`Remove ${tenant.name}?`}
        message="They will be signed out and can no longer use the app. If they have a room, they are moved out today. Their bills and payments are kept."
        tone="danger"
        confirmLabel="Remove Tenant"
        requireReason
        loading={busy}
        onConfirm={(reason) => act(() => api.post(`/tenants/${id}/deactivate`, { reason }), 'Tenant removed.')}
      />
      <ConfirmDialog
        open={modal === 'reset'}
        onClose={() => setModal(null)}
        title="Reset Tenant Password"
        message="Because passwords are private, the existing password cannot be viewed. You can create a new temporary password for this tenant."
        confirmLabel="Create New Password"
        loading={busy}
        onConfirm={async () => {
          const res = await act(() => api.post(`/tenants/${id}/reset-password`, {}), 'New temporary password created.');
          if (res) setTempPassword({ value: res.data.temporaryPassword, expiresAt: res.data.expiresAt });
        }}
      />
      <ConfirmDialog
        open={modal === 'resetEmail'}
        onClose={() => setModal(null)}
        title="Send a password reset email?"
        message={`We'll email ${account.email || tenant.email} a link to choose a new password. Ask them to check Spam if it doesn't arrive.`}
        confirmLabel="Send Email"
        loading={busy}
        onConfirm={() => act(() => resetPassword(account.email || tenant.email), 'Password reset email sent.')}
      />
      <Modal
        open={Boolean(tempPassword)}
        onClose={() => setTempPassword(null)}
        title="Temporary Password"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              icon={Copy}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(tempPassword.value);
                  toast.success('Password copied.');
                } catch {
                  toast.info('Select the password and copy it.');
                }
              }}
            >
              Copy Password
            </Button>
            <Button onClick={() => setTempPassword(null)}>Done</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">For {tenant.name}. It is shown only now and is not saved anywhere.</p>
        <p className="mt-3 rounded-2xl bg-slate-100 p-4 text-center font-mono text-2xl tracking-wider text-slate-900 select-all">{tempPassword?.value}</p>
        <Alert tone="warning" className="mt-4">
          This temporary password should only be given to the tenant privately.
        </Alert>
        <p className="mt-3 text-sm text-slate-600">
          The tenant must choose their own password when they sign in.
          {tempPassword?.expiresAt ? ` It stops working on ${formatDateTime(tempPassword.expiresAt)}.` : ''}
        </p>
      </Modal>
    </>
  );
}
