/** Status values stored in Firestore (and their plain-language labels for the apps). */
const ROLE = { ADMIN: 'ADMIN', TENANT: 'TENANT' };
// ACTIVE = approved, INACTIVE = suspended, PENDING = waiting for approval, REJECTED = not approved.
const USER_STATUS = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE', PENDING: 'PENDING', REJECTED: 'REJECTED' };
const TENANT_STATUS = { ACTIVE: 'ACTIVE', MOVED_OUT: 'MOVED_OUT', INACTIVE: 'INACTIVE', PENDING: 'PENDING', REJECTED: 'REJECTED' };
const ROOM_STATUS = { AVAILABLE: 'AVAILABLE', PARTIALLY_OCCUPIED: 'PARTIALLY_OCCUPIED', FULL: 'FULL', MAINTENANCE: 'MAINTENANCE' };
const ASSIGNMENT_STATUS = { ACTIVE: 'ACTIVE', ENDED: 'ENDED' };
const BILL_STATE = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', VOID: 'VOID' };
const BILL_STATUS = { UNPAID: 'UNPAID', PARTIALLY_PAID: 'PARTIALLY_PAID', PAID: 'PAID', OVERDUE: 'OVERDUE' };
const PAYMENT_STATUS = { PENDING: 'PENDING_VERIFICATION', CONFIRMED: 'CONFIRMED', REJECTED: 'REJECTED', REVERSED: 'REVERSED' };
const PAYMENT_METHODS = ['GCASH', 'MAYA', 'BANK_TRANSFER', 'CASH', 'OTHER'];
const SHARING = { EQUAL: 'EQUAL', PRORATED: 'PRORATED', CUSTOM: 'CUSTOM', INDIVIDUAL_METER: 'INDIVIDUAL_METER' };

const METHOD_LABELS = { GCASH: 'GCash', MAYA: 'Maya', BANK_TRANSFER: 'Bank transfer', CASH: 'Cash', OTHER: 'Other' };

const REJECTION_REASONS = {
  INCORRECT_AMOUNT: 'Incorrect amount',
  INVALID_REFERENCE: 'Invalid reference number',
  UNCLEAR_PROOF: 'Payment proof is unclear',
  NOT_VERIFIED: 'Payment could not be verified',
  OTHER: 'Other',
};

/** Why the owner did not approve a tenant sign-up (shown to the applicant). */
const SIGNUP_REJECTION_REASONS = {
  NOT_VERIFIED: 'Information could not be verified',
  DUPLICATE: 'Duplicate account',
  NO_TENANCY: 'No active tenancy',
  OTHER: 'Other',
};

module.exports = {
  SIGNUP_REJECTION_REASONS,
  ROLE,
  USER_STATUS,
  TENANT_STATUS,
  ROOM_STATUS,
  ASSIGNMENT_STATUS,
  BILL_STATE,
  BILL_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHODS,
  SHARING,
  METHOD_LABELS,
  REJECTION_REASONS,
};
