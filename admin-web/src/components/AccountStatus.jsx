import { Badge } from './ui';

/** Tenant account states, each with a color AND words (never color alone). */
export const ACCOUNT_STATUS = {
  PENDING: { label: 'Pending Approval', tone: 'yellow' },
  ACTIVE: { label: 'Approved', tone: 'green' },
  INACTIVE: { label: 'Suspended', tone: 'red' },
  REJECTED: { label: 'Rejected', tone: 'slate' },
};

export function AccountStatusBadge({ status }) {
  const s = ACCOUNT_STATUS[status] || { label: 'Unknown', tone: 'slate' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
