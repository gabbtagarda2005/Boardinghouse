import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ChevronLeft, ImagePlus, Pencil, Trash2, UserPlus, Wrench } from 'lucide-react';
import { api, errorMessage, fileUrl } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Alert, Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, StatusBadge, PageSkeleton } from '../../components/ui';
import { formatDate, peso } from '../../utils/format';
import RoomFormModal from './RoomFormModal';
import AssignRoomModal from '../tenants/AssignRoomModal';

function Fact({ label, children }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{children}</p>
    </div>
  );
}

export default function RoomDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(`/rooms/${id}`);
  const [editOpen, setEditOpen] = useState(false);
  const [assign, setAssign] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  if (loading && !data) return <PageSkeleton label="Loading room…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const { room, beds, history } = data;

  const run = async (fn, msg) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      setConfirm(null);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const upload = async (files) => {
    if (!files?.length) return;
    const fd = new FormData();
    [...files].forEach((f) => fd.append('photos', f));
    setUploading(true);
    try {
      await api.post(`/rooms/${id}/photos`, fd);
      toast.success('Photos added.');
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const occupied = beds.filter((b) => b.occupied);

  return (
    <>
      <Link to="/rooms" className="mb-3 hidden items-center gap-1 text-sm font-medium text-slate-500 hover:text-navy-300 md:inline-flex">
        <ChevronLeft className="h-4 w-4" /> All rooms
      </Link>
      <PageHeader
        keepTitleOnMobile
        title={`Room ${room.roomNumber}`}
        subtitle={[room.name, room.building && `${room.building} building`].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <Button variant="secondary" icon={Pencil} onClick={() => setEditOpen(true)}>
              Edit Room
            </Button>
            {!room.isArchived && (
              <Button
                variant="secondary"
                icon={Wrench}
                onClick={() =>
                  setConfirm({
                    title: room.underMaintenance ? 'Repairs finished?' : 'Mark as under repair?',
                    message: room.underMaintenance ? 'The room will accept new tenants again.' : 'No new tenants can be assigned until repairs are finished. Current tenants are not affected.',
                    label: room.underMaintenance ? 'Yes, repairs are finished' : 'Mark Under Repair',
                    fn: () => api.patch(`/rooms/${id}`, { underMaintenance: !room.underMaintenance }),
                    msg: 'Room updated.',
                  })
                }
              >
                {room.underMaintenance ? 'Repairs Finished' : 'Under Repair'}
              </Button>
            )}
            {room.isArchived ? (
              <Button variant="secondary" icon={ArchiveRestore} onClick={() => run(() => api.post(`/rooms/${id}/restore`), 'Room is back in use.')}>
                Restore Room
              </Button>
            ) : (
              <Button
                variant="danger"
                icon={Archive}
                onClick={() =>
                  setConfirm({
                    title: 'Archive this room?',
                    message: 'Archived rooms are hidden and can’t take tenants. Its history is kept. Everyone must move out first.',
                    label: 'Archive Room',
                    tone: 'danger',
                    fn: () => api.post(`/rooms/${id}/archive`),
                    msg: 'Room archived.',
                  })
                }
              >
                Archive
              </Button>
            )}
          </>
        }
      />
      {room.isArchived && <Alert tone="warning" className="mb-4">This room is archived.</Alert>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Fact label="Capacity">{room.capacity} people</Fact>
        <Fact label="Current Occupants">{room.occupiedBeds} people</Fact>
        <Fact label="Available Spaces">{room.availableBeds}</Fact>
        <Fact label="Monthly Rent">
          {peso(room.monthlyRent)} <span className="text-sm font-medium text-slate-500">/ tenant</span>
        </Fact>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">Status</p>
          <div className="mt-2">
            <StatusBadge status={room.status} />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="Current Tenants"
            subtitle={`${occupied.length} of ${room.capacity} beds taken`}
            actions={
              room.availableBeds > 0 && (
                <Button icon={UserPlus} onClick={() => setAssign({})}>
                  Assign Tenant
                </Button>
              )
            }
            bodyClassName="p-0"
          >
            <ul className="divide-y divide-slate-100">
              {beds.map((b) => (
                <li key={b.bedNumber} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="flex items-center gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-50 text-sm font-bold text-navy-300">{b.bedNumber}</span>
                    {b.occupied ? (
                      <div>
                        <Link to={`/tenants/${b.tenantId}`} className="font-semibold text-navy-300 hover:underline">
                          {b.tenantName}
                        </Link>
                        <p className="text-sm text-slate-500">
                          Bed {b.bedNumber} · since {formatDate(b.since)} · {peso(b.monthlyRent)}/month
                        </p>
                      </div>
                    ) : (
                      <p className="text-slate-500">Bed {b.bedNumber} is free</p>
                    )}
                  </div>
                  {!b.occupied && !room.underMaintenance && !room.isArchived && (
                    <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => setAssign({ bed: b.bedNumber })}>
                      Assign
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title="Photos"
            actions={
              <>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
                <Button size="sm" variant="secondary" icon={ImagePlus} loading={uploading} onClick={() => fileRef.current?.click()}>
                  Add Photos
                </Button>
              </>
            }
          >
            {room.photos.length === 0 ? (
              <EmptyState title="No photos yet" message="Add photos so tenants can see the room. JPG, PNG or WEBP, up to 5 MB." />
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {room.photos.map((p) => (
                  <li key={p._id} className="relative overflow-hidden rounded-xl border border-slate-200">
                    <img src={fileUrl(p.url)} alt={`Room ${room.roomNumber}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    <button
                      type="button"
                      onClick={() => setConfirm({ title: 'Delete this photo?', message: 'The photo will be removed from the room.', label: 'Delete Photo', tone: 'danger', fn: () => api.delete(`/rooms/${id}/photos/${p._id}`), msg: 'Photo deleted.' })}
                      className="absolute top-2 right-2 rounded-lg bg-panel/90 p-1.5 text-red-600 shadow hover:bg-panel"
                      aria-label="Delete photo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Amenities">
            {room.amenities?.length ? (
              <ul className="space-y-2">
                {room.amenities.map((a) => (
                  <li key={a} className="flex items-center gap-2 text-[15px] text-slate-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-navy-500" aria-hidden />
                    {a}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No amenities listed. Use “Edit Room” to add them.</p>
            )}
          </Card>
          {room.description && (
            <Card title="Description">
              <p className="text-[15px] text-slate-700">{room.description}</p>
            </Card>
          )}
          <Card title="Past Tenants" bodyClassName="p-0">
            {history.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">No one has moved out of this room yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {history.map((h) => (
                  <li key={h._id} className="px-5 py-3 text-sm">
                    <Link to={`/tenants/${h.tenantId}`} className="font-semibold text-navy-300 hover:underline">
                      {h.tenantName}
                    </Link>
                    <p className="text-slate-500">
                      {formatDate(h.startDate)} – {formatDate(h.endDate)} · {h.endReason === 'TRANSFER' ? 'moved to another room' : 'moved out'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <RoomFormModal open={editOpen} onClose={() => setEditOpen(false)} room={room} onSaved={reload} />
      <AssignRoomModal open={Boolean(assign)} onClose={() => setAssign(null)} presetRoom={room} presetBed={assign?.bed} onDone={reload} />
      <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} title={confirm?.title} message={confirm?.message} tone={confirm?.tone || 'primary'} confirmLabel={confirm?.label} loading={busy} onConfirm={() => run(confirm.fn, confirm.msg)} />
    </>
  );
}
