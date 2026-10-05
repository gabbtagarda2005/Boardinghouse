import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BedDouble, Plus } from 'lucide-react';
import { useApi, usePersistentState } from '../../hooks/useApi';
import { Button, EmptyState, ErrorState, PageHeader, SearchInput, Chip, ChipRow, SkeletonCards } from '../../components/ui';
import { RoomCard, RoomRow } from '../../components/cards';
import RoomFormModal from './RoomFormModal';

const FILTERS = [
  { value: 'all', label: 'All rooms' },
  { value: 'available', label: 'Has space' },
  { value: 'full', label: 'Full' },
  { value: 'repair', label: 'Under repair' },
  { value: 'archived', label: 'Archived' },
];

export default function RoomsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [filter, setFilter] = usePersistentState('rooms.filter', 'all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const active = params.get('filter') || filter;
  const { data, loading, error, reload } = useApi('/rooms', { archived: active === 'archived' ? 'true' : 'false' });

  const rooms = useMemo(() => {
    let list = data?.items || [];
    if (active === 'available') list = list.filter((r) => r.availableBeds > 0);
    if (active === 'full') list = list.filter((r) => r.status === 'FULL');
    if (active === 'repair') list = list.filter((r) => r.underMaintenance);
    const s = search.trim().toLowerCase();
    if (s) list = list.filter((r) => [r.roomNumber, r.name, r.building, ...(r.occupants || []).map((o) => o.name)].some((v) => v && v.toLowerCase().includes(s)));
    return list;
  }, [data, active, search]);

  const totalSpaces = (data?.items || []).reduce((s, r) => s + (r.underMaintenance ? 0 : r.availableBeds), 0);

  return (
    <>
      <PageHeader
        title="Rooms"
        subtitle={data ? `${data.items.length} rooms · ${totalSpaces} space${totalSpaces === 1 ? '' : 's'} available` : 'Your rooms and who lives in them'}
        actions={
          <Button icon={Plus} onClick={() => setFormOpen(true)}>
            Add Room
          </Button>
        }
      />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <ChipRow label="Show">
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              active={active === f.value}
              onClick={() => {
                setFilter(f.value);
                if (params.get('filter')) navigate('/rooms', { replace: true });
              }}
            >
              {f.label}
            </Chip>
          ))}
        </ChipRow>
        <SearchInput value={search} onChange={setSearch} placeholder="Search room or tenant name…" className="lg:ml-auto lg:w-72" />
      </div>

      {loading && !data ? (
        <SkeletonCards label="Loading rooms…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rooms.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={BedDouble}
            title={data?.items?.length ? 'No rooms match this filter' : 'You have no rooms yet'}
            message={data?.items?.length ? 'Try another filter or search.' : 'Add your first room to start assigning tenants.'}
            action={!data?.items?.length && <Button icon={Plus} onClick={() => setFormOpen(true)}>Add Room</Button>}
          />
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {rooms.map((r) => (
              <RoomRow key={r._id} room={r} />
            ))}
          </div>
          <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-3">
            {rooms.map((r) => (
              <RoomCard key={r._id} room={r} />
            ))}
          </div>
        </>
      )}
      <RoomFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={(room) => navigate(`/rooms/${room._id}`)} />
    </>
  );
}
