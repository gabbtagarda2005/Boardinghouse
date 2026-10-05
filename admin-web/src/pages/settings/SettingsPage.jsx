import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, Building2, ChevronRight, Globe, KeyRound, Plus, Save, Trash2, Wallet, Zap } from 'lucide-react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { api, errorMessage } from '../../api/client';
import { auth } from '../../lib/firebase';
import { useApi } from '../../hooks/useApi';
import { usePhone } from '../../hooks/useMediaQuery';
import { authErrorMessage, useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Alert, Badge, Button, Card, Checkbox, Switch, DataTable, ErrorState, IconButton, Input, Modal, PageHeader, Select, StickyBar, StickyBarSpacer, Textarea, cx, HScroll, PageSkeleton } from '../../components/ui';
import { METHOD_LABELS, SHARING_LABELS } from '../../utils/format';
import LogoUploader from '../../components/LogoUploader';

const SECTIONS = [
  { value: 'house', label: 'Boarding House Information', icon: Building2 },
  { value: 'public', label: 'Public Page & Accounts', icon: Globe },
  { value: 'payment', label: 'Payment Settings', icon: Wallet },
  { value: 'electricity', label: 'Electricity Settings', icon: Zap },
  { value: 'notifications', label: 'Notification Settings', icon: Bell },
  { value: 'account', label: 'Account Settings', icon: KeyRound },
];

/** Phones: the five sections grouped into four screens, opened from a list (?s=group). */
const GROUPS = [
  { value: 'general', label: 'General', hint: 'Name, address, contact details and your public page', icon: Building2, sections: ['house', 'public'] },
  { value: 'billing', label: 'Billing & payments', hint: 'Due date, water, extra charges, payment accounts, electricity rate', icon: Wallet, sections: ['payment', 'electricity'] },
  { value: 'notifications', label: 'Notifications', hint: 'Reminders and alerts sent to tenants', icon: Bell, sections: ['notifications'] },
  { value: 'account', label: 'Account & security', hint: 'Your name, password and other owners', icon: KeyRound, sections: ['account'] },
];

// Same rules as the sign-in system: 8+ characters with an uppercase letter, a lowercase letter and a number.
const passwordProblem = (p) => (p.length < 8 ? 'Use at least 8 characters' : !/[A-Z]/.test(p) ? 'Include an uppercase letter' : !/[a-z]/.test(p) ? 'Include a lowercase letter' : !/[0-9]/.test(p) ? 'Include a number' : '');

function PublicPage({ s, setS, onCover }) {
  return (
    <Card title="Public Page & Tenant Accounts" subtitle="What visitors see on your Send Inquiry page, and how new passwords work">
      <div className="grid gap-4">
        <LogoUploader kind="cover" logoUrl={s.coverUrl} onChange={onCover} />
        <p className="text-sm text-slate-600">
          Your public page shows your rooms and how many spaces are free right now.{' '}
          <a href="/inquire" target="_blank" rel="noreferrer" className="font-semibold text-navy-300 hover:underline">
            View your public page
          </a>
        </p>
        <div className="divide-y divide-slate-100">
          <Switch
            label="Allow inquiries for full rooms (waiting list)"
            hint="When off, people can only inquire about rooms with enough free spaces."
            checked={Boolean(s.allowWaitlistInquiries)}
            onChange={(v) => setS({ ...s, allowWaitlistInquiries: v })}
          />
        </div>
        <Select
          label="A temporary password works for"
          value={String(s.tempPasswordDays || 3)}
          onChange={(e) => setS({ ...s, tempPasswordDays: Number(e.target.value) })}
          options={[1, 2, 3, 5, 7, 14].map((d) => ({ value: String(d), label: `${d} day${d > 1 ? 's' : ''}` }))}
          hint="After this, it stops working and you give a new one. Tenants must change it when they sign in."
        />
      </div>
    </Card>
  );
}

function House({ s, set, onLogo }) {
  return (
    <Card title="Boarding House Information" subtitle="Shown on bills, receipts and in the tenant app">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Boarding house name" required value={s.houseName} onChange={set('houseName')} />
        <Input label="Contact number" type="tel" autoComplete="tel" value={s.contactPhone} onChange={set('contactPhone')} />
        <Input label="Contact email" type="email" autoComplete="email" autoCapitalize="none" value={s.contactEmail} onChange={set('contactEmail')} />
        <Textarea label="Address" value={s.address} onChange={set('address')} rows={2} />
        <LogoUploader logoUrl={s.logoUrl} onChange={onLogo} />
      </div>
    </Card>
  );
}

function Payment({ s, set, setS }) {
  const upd = (i, k) => (e) => setS({ ...s, paymentChannels: s.paymentChannels.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) });
  return (
    <div className="space-y-6">
      <Card title="Bills">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Rent is due every month on day" type="number" inputMode="numeric" min={1} max={28} value={s.defaultDueDay} onChange={set('defaultDueDay')} hint="1 to 28" />
          <div className="space-y-2 pt-6">
            <Checkbox label="Add a water charge to every bill" checked={s.waterEnabled} onChange={(e) => setS({ ...s, waterEnabled: e.target.checked })} />
          </div>
          {s.waterEnabled && <Input label="Water charge per tenant (₱)" type="number" inputMode="decimal" min={0} step="0.01" value={s.waterChargePerTenant} onChange={set('waterChargePerTenant')} />}
        </div>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="label mb-0">Other charges added to every bill</p>
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => setS({ ...s, defaultOtherCharges: [...s.defaultOtherCharges, { label: '', amount: '' }] })}>
              Add
            </Button>
          </div>
          {s.defaultOtherCharges.length === 0 && <p className="text-sm text-slate-500">None. For example, you could add Wi-Fi here.</p>}
          <div className="space-y-2">
            {s.defaultOtherCharges.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" aria-label="Charge name" placeholder="e.g. Wi-Fi" value={c.label} onChange={(e) => setS({ ...s, defaultOtherCharges: s.defaultOtherCharges.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <input className="input w-36 text-right" aria-label="Amount" type="number" min={0} step="0.01" value={c.amount} onChange={(e) => setS({ ...s, defaultOtherCharges: s.defaultOtherCharges.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} />
                <IconButton icon={Trash2} label="Remove" className="text-red-600" onClick={() => setS({ ...s, defaultOtherCharges: s.defaultOtherCharges.filter((_, j) => j !== i) })} />
              </div>
            ))}
          </div>
        </div>
      </Card>
      <Card
        title="How tenants can pay you"
        subtitle="Tenants see this in their app"
        actions={
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => setS({ ...s, paymentChannels: [...s.paymentChannels, { paymentMethod: 'GCASH', provider: '', accountName: '', accountNumber: '' }] })}>
            Add Account
          </Button>
        }
      >
        <Textarea label="Payment instructions" rows={3} value={s.paymentInstructions} onChange={set('paymentInstructions')} />
        <div className="mt-4 space-y-3">
          {s.paymentChannels.map((c, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[10rem_1fr_1fr_1fr_auto]">
              <select className="input" aria-label="Method" value={c.paymentMethod} onChange={upd(i, 'paymentMethod')}>
                {Object.entries(METHOD_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <input className="input" aria-label="Name" placeholder="Name (e.g. BDO, Office)" value={c.provider || ''} onChange={upd(i, 'provider')} />
              <input className="input" aria-label="Account name" placeholder="Account name" value={c.accountName || ''} onChange={upd(i, 'accountName')} />
              <input className="input" aria-label="Account number" placeholder="Account / phone number" value={c.accountNumber || ''} onChange={upd(i, 'accountNumber')} />
              <IconButton icon={Trash2} label="Remove" className="text-red-600" onClick={() => setS({ ...s, paymentChannels: s.paymentChannels.filter((_, j) => j !== i) })} />
            </div>
          ))}
        </div>
        <Alert tone="info" className="mt-4">
          Tenants pay you directly, then send their reference number and a photo of the receipt in the app. You confirm each payment. Online card payments are not set up.
        </Alert>
      </Card>
    </div>
  );
}

function Electricity({ s, set }) {
  return (
    <Card title="Electricity Settings">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Electricity rate (₱ per kWh)" type="number" inputMode="decimal" min={0} step="0.0001" value={s.electricityRate} onChange={set('electricityRate')} hint="Check your latest electric bill" />
        <Select label="Usual way to share a room's electricity" value={s.defaultElectricitySharing} onChange={set('defaultElectricitySharing')} options={Object.entries(SHARING_LABELS).map(([value, label]) => ({ value, label }))} hint="You can change it for each reading" />
      </div>
    </Card>
  );
}

function Notifications({ s, setS, features }) {
  const n = s.notifications;
  const setN = (k, v) => setS({ ...s, notifications: { ...n, [k]: v } });
  return (
    <div className="space-y-6">
      <Card title="What tenants are told automatically">
        <div className="space-y-4">
          <Checkbox label="When a new bill is sent" checked={n.notifyOnBillPublish} onChange={(e) => setN('notifyOnBillPublish', e.target.checked)} />
          <Checkbox label="When their payment is confirmed" checked={n.notifyOnPaymentConfirm} onChange={(e) => setN('notifyOnPaymentConfirm', e.target.checked)} />
          <Checkbox label="Reminders before the due date" checked={n.sendDueReminders} onChange={(e) => setN('sendDueReminders', e.target.checked)} />
          {n.sendDueReminders && (
            <Input
              label="How many days before? (separate with commas)"
              value={n.reminderDaysBefore.join(', ')}
              onChange={(e) =>
                setN(
                  'reminderDaysBefore',
                  e.target.value
                    .split(',')
                    .map((x) => parseInt(x.trim(), 10))
                    .filter((x) => Number.isInteger(x) && x >= 0 && x <= 30)
                    .slice(0, 5)
                )
              }
              hint="Example: 3, 1, 0 (0 means on the due date)"
              className="max-w-sm"
            />
          )}
          <Checkbox label="Reminders when a bill is overdue" checked={n.sendOverdueReminders} onChange={(e) => setN('sendOverdueReminders', e.target.checked)} />
          {n.sendOverdueReminders && <Input label="Remind again every (days)" type="number" min={1} max={30} value={n.overdueReminderEveryDays} onChange={(e) => setN('overdueReminderEveryDays', e.target.value)} className="max-w-sm" />}
        </div>
      </Card>
      <Card title="Delivery" subtitle="Changes are saved when you press Save">
        <div className="divide-y divide-slate-100">
          <Switch label="Notifications inside the tenant app" hint="Always on: this is how tenants get their bills and payment updates." checked disabled />
          <Switch
            label="Phone notifications"
            hint={features?.pushNotifications ? 'Pop-up alerts on tenants\' phones, in addition to the list in the app.' : 'Turned on here, they start working once phone notifications are set up for your app.'}
            checked={n.pushEnabled}
            onChange={(v) => setN('pushEnabled', v)}
          />
          <Switch
            label="Email new tenants their login"
            hint={features?.email ? 'When you add a tenant, they get an email with their sign-in details.' : 'Needs an email account to be connected first. Until then, give new tenants their temporary password yourself (it is shown once when you add them).'}
            checked={features?.email ? n.emailNewTenants !== false : false}
            disabled={!features?.email}
            onChange={(v) => setN('emailNewTenants', v)}
          />
        </div>
      </Card>
    </div>
  );
}

function Account() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState('');
  const admins = useApi('/users/admins');
  const [adding, setAdding] = useState(false);
  const [na, setNa] = useState({ name: '', email: '', password: '' });

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving('profile');
    try {
      const res = await api.patch('/users/me', profile);
      setUser((u) => ({ ...u, ...res.data.user }));
      toast.success('Profile saved.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving('');
    }
  };
  const pwErr = pw.next ? passwordProblem(pw.next) : '';
  const changePw = async (e) => {
    e.preventDefault();
    if (pwErr || pw.next !== pw.confirm) return;
    setSaving('pw');
    try {
      const u = auth.currentUser;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, pw.current));
      await updatePassword(u, pw.next);
      await api.post('/auth/password-changed').catch(() => {});
      setPw({ current: '', next: '', confirm: '' });
      toast.success('Your password was changed.');
    } catch (err) {
      toast.error(err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' ? 'Your current password is not correct.' : authErrorMessage(err));
    } finally {
      setSaving('');
    }
  };
  const addAdmin = async () => {
    setSaving('admin');
    try {
      await api.post('/users/admins', na);
      toast.success(`${na.name} can now sign in.`);
      setAdding(false);
      setNa({ name: '', email: '', password: '' });
      admins.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving('');
    }
  };
  const toggle = async (a) => {
    try {
      await api.patch(`/users/admins/${a._id}`, { isActive: a.status !== 'ACTIVE' });
      admins.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Your Profile">
          <form onSubmit={saveProfile} className="space-y-4">
            <Input label="Name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required />
            <Input label="Email" value={user?.email || ''} disabled hint="This is the email you sign in with" />
            <Input label="Phone" type="tel" autoComplete="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            <Button type="submit" loading={saving === 'profile'}>
              Save Changes
            </Button>
          </form>
        </Card>
        <Card title="Change Password">
          <form onSubmit={changePw} className="space-y-4">
            <Input label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
            <Input label="New password" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} error={pwErr} hint="At least 8 characters with a letter and a number" required />
            <Input label="Type the new password again" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} error={pw.confirm && pw.confirm !== pw.next ? 'The passwords are not the same' : ''} required />
            <Button type="submit" loading={saving === 'pw'} disabled={!pw.current || !pw.next || Boolean(pwErr) || pw.next !== pw.confirm}>
              Change Password
            </Button>
          </form>
        </Card>
      </div>
      <Card title="People who can manage the boarding house" bodyClassName="p-0" actions={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setAdding(true)}>Add Person</Button>}>
        <DataTable
          rows={admins.data?.items}
          loading={admins.loading}
          error={admins.error}
          columns={[
            { key: 'name', header: 'Name' },
            { key: 'email', header: 'Email' },
            { key: 's', header: 'Can sign in?', render: (a) => (a.status === 'ACTIVE' ? <Badge tone="green">Yes</Badge> : <Badge tone="red">No</Badge>) },
            { key: 'a', header: '', render: (a) => (a._id === user?.uid ? <span className="text-sm text-slate-500">You</span> : <Button size="sm" variant="secondary" onClick={() => toggle(a)}>{a.status === 'ACTIVE' ? 'Turn Off' : 'Turn On'}</Button>) },
          ]}
        />
      </Card>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a person who can manage the boarding house"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button loading={saving === 'admin'} disabled={!na.name || !na.email || Boolean(passwordProblem(na.password))} onClick={addAdmin}>
              Add Person
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Name" value={na.name} onChange={(e) => setNa({ ...na, name: e.target.value })} />
          <Input label="Email" type="email" autoComplete="off" autoCapitalize="none" value={na.email} onChange={(e) => setNa({ ...na, email: e.target.value })} />
          <Input label="Password" type="password" autoComplete="new-password" value={na.password} onChange={(e) => setNa({ ...na, password: e.target.value })} error={na.password ? passwordProblem(na.password) : ''} />
        </div>
      </Modal>
    </div>
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi('/settings');
  const [section, setSection] = useState('house');
  const [params, setParams] = useSearchParams();
  const phone = usePhone();
  const group = GROUPS.find((g) => g.value === params.get('s'));
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data?.settings) setS(JSON.parse(JSON.stringify(data.settings)));
  }, [data]);
  if (loading && !data) return <PageSkeleton label="Loading settings…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!s) return null;
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const withoutLogo = (x) => JSON.stringify({ ...x, logoUrl: null, coverUrl: null });
  const dirty = withoutLogo(s) !== withoutLogo(data.settings);
  const onLogo = (logoUrl) => {
    setS((x) => ({ ...x, logoUrl }));
    window.dispatchEvent(new Event('settings:changed')); // sidebar picks up the new logo
  };
  const onCover = (coverUrl) => setS((x) => ({ ...x, coverUrl }));
  const discard = () => setS(JSON.parse(JSON.stringify(data.settings)));
  const renderSection = (key) =>
    ({
      house: <House s={s} set={set} onLogo={onLogo} />,
      public: <PublicPage s={s} setS={setS} onCover={onCover} />,
      payment: <Payment s={s} set={set} setS={setS} />,
      electricity: <Electricity s={s} set={set} />,
      notifications: <Notifications s={s} setS={setS} features={data.features} />,
      account: <Account />,
    })[key];

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/settings', {
        houseName: s.houseName,
        address: s.address,
        contactPhone: s.contactPhone,
        contactEmail: s.contactEmail,
        defaultDueDay: Number(s.defaultDueDay),
        electricityRate: Number(s.electricityRate),
        defaultElectricitySharing: s.defaultElectricitySharing,
        waterEnabled: s.waterEnabled,
        waterChargePerTenant: Number(s.waterChargePerTenant),
        defaultOtherCharges: s.defaultOtherCharges.filter((c) => c.label && c.amount !== '').map((c) => ({ label: c.label, amount: Number(c.amount) })),
        paymentInstructions: s.paymentInstructions,
        tenantAppUrl: (s.tenantAppUrl || '').trim(),
        allowWaitlistInquiries: Boolean(s.allowWaitlistInquiries),
        tempPasswordDays: Number(s.tempPasswordDays || 3),
        paymentChannels: s.paymentChannels.map(({ _id, ...c }) => c),
        notifications: { ...s.notifications, overdueReminderEveryDays: Number(s.notifications.overdueReminderEveryDays) },
      });
      toast.success('Settings saved.');
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (phone) {
    return (
      <>
        <PageHeader title={group ? group.label : 'Settings'} />
        {!group ? (
          <nav className="card divide-y divide-slate-100 overflow-hidden" aria-label="Settings sections">
            {GROUPS.map((g) => (
              <button key={g.value} type="button" onClick={() => setParams({ s: g.value })} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-300">
                  <g.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900">{g.label}</span>
                  <span className="block text-sm text-slate-500">{g.hint}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
              </button>
            ))}
          </nav>
        ) : (
          <div className="space-y-4">{group.sections.map((key) => <div key={key}>{renderSection(key)}</div>)}</div>
        )}
        {dirty && (
          <>
            <StickyBarSpacer />
            <StickyBar>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium text-slate-700">Unsaved changes</p>
                <Button variant="secondary" onClick={discard} disabled={saving}>
                  Discard
                </Button>
                <Button icon={Save} loading={saving} onClick={save}>
                  Save
                </Button>
              </div>
            </StickyBar>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        actions={
          section !== 'account' && (
            <Button icon={Save} loading={saving} onClick={save}>
              Save Changes
            </Button>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <HScroll role="navigation" className="flex gap-1 lg:flex-col lg:overflow-visible" aria-label="Settings sections">
          {SECTIONS.map((x) => (
            <button key={x.value} type="button" onClick={() => setSection(x.value)} aria-current={section === x.value} className={cx('flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium whitespace-nowrap', section === x.value ? 'bg-navy-700 text-white' : 'text-slate-600 hover:bg-panel')}>
              <x.icon className="h-5 w-5 shrink-0" aria-hidden />
              {x.label}
            </button>
          ))}
        </HScroll>
        <div>{renderSection(section)}</div>
      </div>
    </>
  );
}
