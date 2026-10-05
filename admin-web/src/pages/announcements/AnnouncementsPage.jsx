import { useState } from 'react';
import { useUndoableRemove } from '../../hooks/useUndo';
import { CircleCheck, Megaphone, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Alert, AsyncContent, Badge, Button, Card, Checkbox, ConfirmDialog, IconButton, Input, Modal, PageHeader, Pagination, Textarea, cx } from '../../components/ui';
import { formatDateTime } from '../../utils/format';

const AUDIENCES = [
  { value: 'ALL', label: 'All Tenants' },
  { value: 'ROOMS', label: 'Specific Room' },
  { value: 'TENANTS', label: 'Selected Tenants' },
];

function CreateModal({ open, onClose, onSent }) {
  const [form, setForm] = useState({ title: '', body: '', audience: 'ALL', roomIds: [], tenantIds: [], pinned: false });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(null);
  const rooms = useApi(open ? '/rooms' : null);
  const tenants = useApi(open ? '/tenants' : null);
  const toggle = (key, id) => setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));

  const close = () => {
    setForm({ title: '', body: '', audience: 'ALL', roomIds: [], tenantIds: [], pinned: false });
    setSent(null);
    setError('');
    onClose();
  };
  const submit = async (e) => {
    e.preventDefault();
    if (form.title.trim().length < 3 || form.body.trim().length < 3) return setError('Please write a title and a message.');
    if (form.audience === 'ROOMS' && !form.roomIds.length) return setError('Please choose at least one room.');
    if (form.audience === 'TENANTS' && !form.tenantIds.length) return setError('Please choose at least one tenant.');
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/announcements', { ...form, title: form.title.trim(), body: form.body.trim() });
      setSent(res.data.announcement);
      onSent();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (sent) {
    return (
      <Modal open={open} onClose={close} title="Announcement" size="sm" footer={<Button onClick={close}>Done</Button>}>
        <div className="py-4 text-center">
          <CircleCheck className="mx-auto h-14 w-14 text-emerald-600" aria-hidden />
          <p className="mt-3 text-xl font-bold">Announcement sent successfully.</p>
          <p className="mt-1 text-slate-600">
            {sent.recipientCount} tenant{sent.recipientCount === 1 ? '' : 's'} will see it in their app.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create Announcement"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="ann-form" loading={saving} icon={Megaphone}>
            Send Announcement
          </Button>
        </>
      }
    >
      <form id="ann-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Title" required maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Water interruption on Saturday" />
        <Textarea label="Message" required rows={5} maxLength={5000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <fieldset>
          <legend className="label">Send To</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {AUDIENCES.map((a) => (
              <label key={a.value} className={cx('flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-[15px]', form.audience === a.value ? 'border-navy-500 bg-navy-50' : 'border-slate-200')}>
                <input type="radio" name="audience" checked={form.audience === a.value} onChange={() => setForm({ ...form, audience: a.value })} /> {a.label}
              </label>
            ))}
          </div>
        </fieldset>
        {form.audience === 'ROOMS' && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(rooms.data?.items || []).filter((r) => r.occupiedBeds > 0).map((r) => (
              <Checkbox key={r._id} label={`Room ${r.roomNumber}`} checked={form.roomIds.includes(r._id)} onChange={() => toggle('roomIds', r._id)} />
            ))}
          </div>
        )}
        {form.audience === 'TENANTS' && (
          <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
            {(tenants.data?.items || []).map((t) => (
              <Checkbox key={t._id} label={t.name} description={t.currentRoomNumber ? `Room ${t.currentRoomNumber}` : undefined} checked={form.tenantIds.includes(t._id)} onChange={() => toggle('tenantIds', t._id)} />
            ))}
          </div>
        )}
        <Checkbox label="Keep this at the top of the tenants' announcement list" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
      </form>
    </Modal>
  );
}

export default function AnnouncementsPage() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const { data, loading, error, reload } = useApi('/announcements', { page, limit: 20 });
  const undo = useUndoableRemove();
  const shown = (data?.items || []).filter((a) => !undo.isHidden(a._id));

  const pin = async (a) => {
    try {
      await api.post(`/announcements/${a._id}/pin`);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const remove = () => {
    const a = deleting;
    setDeleting(null);
    undo.remove(a._id, 'Announcement deleted.', async () => {
      await api.delete(`/announcements/${a._id}`);
      reload();
    });
  };

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle="Send news and reminders to your tenants. They see them in their app."
        actions={
          <Button icon={Plus} onClick={() => setOpen(true)}>
            Create Announcement
          </Button>
        }
      />
      <Card bodyClassName="p-0">
        <AsyncContent loading={loading && !data} error={error} onRetry={reload} empty={!shown.length} emptyProps={{ title: 'No announcements yet', icon: Megaphone, message: 'Create one to tell your tenants about water interruptions, rules, or events.', action: <Button icon={Plus} onClick={() => setOpen(true)}>New Announcement</Button> }}>
          <ul className="divide-y divide-slate-100">
            {shown.map((a) => (
              <li key={a._id} className="flex gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[17px] font-bold text-slate-900">{a.title}</h3>
                    {a.pinned && <Badge tone="blue">Pinned</Badge>}
                  </div>
                  <p className="mt-1 text-[15px] whitespace-pre-line text-slate-700">{a.body}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Sent to {a.audienceText || 'all tenants'} · {formatDateTime(a.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <IconButton icon={a.pinned ? PinOff : Pin} label={a.pinned ? 'Unpin' : 'Pin to top'} onClick={() => pin(a)} />
                  <IconButton icon={Trash2} label="Delete" className="text-red-600 hover:bg-red-50" onClick={() => setDeleting(a)} />
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={data?.page} pages={data?.pages} total={data?.total} onChange={setPage} />
        </AsyncContent>
      </Card>
      <CreateModal open={open} onClose={() => setOpen(false)} onSent={reload} />
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete this announcement?" message="It will be removed from the tenants' announcement list." tone="danger" confirmLabel="Delete" onConfirm={remove} />
    </>
  );
}
