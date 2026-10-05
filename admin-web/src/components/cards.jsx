import { Link } from "react-router-dom";
import {
  BedDouble,
  Check,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  Users,
  X,
} from "lucide-react";
import { fileUrl } from "../api/client";
import { Button, IconButton, StatusBadge, cx } from "./ui";
import {
  MONTHS,
  formatDateTime,
  formatLongDate,
  methodLabel,
  peso,
  periodLabel,
  shortDate,
  yearOptions,
} from "../utils/format";

/** The room's first photo (Room → Photos), or a plain placeholder when there is none yet. */
export function RoomPhoto({ room, className }) {
  const photo = room.photos?.[0];
  return (
    <div
      className={cx(
        "relative overflow-hidden bg-gradient-to-br from-[#13224d] to-[#0a1430]",
        className,
      )}
    >
      {photo ? (
        <img
          src={fileUrl(photo.url)}
          alt={`Room ${room.roomNumber}`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-500">
          <BedDouble className="h-7 w-7" aria-hidden />
          <span className="text-xs font-medium">No photo yet</span>
        </div>
      )}
    </div>
  );
}

/** One room at a glance: photo, spaces, rent, status and who lives there. */
export function RoomCard({ room }) {
  const pct = room.capacity
    ? Math.round((room.occupiedBeds / room.capacity) * 100)
    : 0;
  return (
    <article
      className={cx(
        "card flex min-w-0 flex-col overflow-hidden transition-shadow hover:shadow-lift",
        room.isArchived && "opacity-70",
      )}
    >
      <div className="relative">
        <RoomPhoto room={room} className="aspect-[16/9] w-full" />
        <span className="absolute top-3 right-3 rounded-full bg-[#050a18]/70 p-0.5 backdrop-blur">
          {room.isArchived ? (
            <StatusBadge status="ARCHIVED" label="Archived" />
          ) : (
            <StatusBadge status={room.status} />
          )}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-slate-900">
            Room {room.roomNumber}
          </h3>
          {(room.name || room.building) && (
            <p className="truncate text-sm text-slate-500">
              {[room.name, room.building].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-3">
          <p className="text-sm text-slate-600">
            <span className="text-2xl font-bold text-slate-900">
              {room.occupiedBeds} / {room.capacity}
            </span>{" "}
            occupants
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">
              {peso(room.monthlyRent)}
            </span>{" "}
            / month
          </p>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
          aria-hidden
        >
          <div
            className={cx(
              "h-full rounded-full",
              pct >= 100 ? "bg-violet-500" : "bg-navy-600",
            )}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <p
          className={cx(
            "mt-2 text-sm font-medium",
            room.availableBeds ? "text-emerald-700" : "text-slate-500",
          )}
        >
          {room.underMaintenance
            ? "Under repair: not taking tenants"
            : room.availableBeds
              ? `${room.availableBeds} space${room.availableBeds > 1 ? "s" : ""} available`
              : "No space available"}
        </p>
        {room.occupants?.length > 0 && (
          <p className="mt-3 flex items-start gap-2 text-sm text-slate-600">
            <Users
              className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"
              aria-hidden
            />
            <span>
              {room.occupants.map((o) => o.name.split(" ")[0]).join(", ")}
            </span>
          </p>
        )}
        {room.amenities?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {room.amenities.slice(0, 5).map((a) => (
              <span
                key={a}
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
              >
                {a}
              </span>
            ))}
            {room.amenities.length > 5 && (
              <span className="text-xs text-slate-500">
                +{room.amenities.length - 5} more
              </span>
            )}
          </div>
        )}
        <div className="mt-auto pt-4">
          <Link to={`/rooms/${room._id}`}>
            <Button variant="secondary" className="w-full">
              View Room
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}

/** Phone version of a room: name + status, a thin occupancy bar and the rent. Tap opens the room. */
export function RoomRow({ room }) {
  const pct = room.capacity
    ? Math.round((room.occupiedBeds / room.capacity) * 100)
    : 0;
  const where = [room.name, room.building].filter(Boolean).join(" · ");
  return (
    <Link
      to={`/rooms/${room._id}`}
      className={cx(
        "card flex gap-3 p-3 transition-shadow hover:shadow-lift active:bg-slate-50",
        room.isArchived && "opacity-70",
      )}
    >
      <RoomPhoto room={room} className="h-[5.5rem] w-24 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1 py-0.5 pr-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-bold text-slate-900">
            Room {room.roomNumber}
            {where && (
              <span className="font-normal text-slate-500"> · {where}</span>
            )}
          </p>
          {room.isArchived ? (
            <StatusBadge status="ARCHIVED" label="Archived" />
          ) : (
            <StatusBadge status={room.status} />
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"
            aria-hidden
          >
            <div
              className={cx(
                "h-full rounded-full",
                pct >= 100 ? "bg-violet-500" : "bg-navy-600",
              )}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <span className="shrink-0 text-sm text-slate-600 tabular-nums">
            {room.occupiedBeds}/{room.capacity} beds
          </span>
        </div>
        <p className="mt-2 flex items-center justify-between text-sm text-slate-600">
          <span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {peso(room.monthlyRent)}
            </span>{" "}
            / tenant
          </span>
          <ChevronRight className="h-5 w-5 text-slate-500" aria-hidden />
        </p>
      </div>
    </Link>
  );
}

/** A bill with its breakdown, so the total is understood immediately. */
export function BillCard({ bill, selectable, selected, onSelect }) {
  const other = (bill.otherCharges || []).reduce((s, c) => s + c.amount, 0);
  const isDraft = bill.state === "DRAFT";
  return (
    <article
      className={cx(
        "card flex min-w-0 flex-col p-5 transition-shadow hover:shadow-lift",
        selected && "ring-2 ring-navy-500",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {periodLabel(bill.billingYear, bill.billingMonth)}
          </p>
          <h3 className="truncate text-lg font-bold text-slate-900">
            {bill.tenantName}
          </h3>
          <p className="text-sm text-slate-500">Room {bill.roomNumber}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isDraft ? (
            <StatusBadge status="DRAFT" />
          ) : bill.state === "VOID" ? (
            <StatusBadge status="VOID" />
          ) : (
            <StatusBadge status={bill.status} />
          )}
          {selectable && (
            <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={selected}
                onChange={onSelect}
              />
              Select
            </label>
          )}
        </div>
      </div>
      <dl className="mt-4 space-y-1.5 text-sm">
        {[
          ["Monthly Rent", bill.rent],
          ["Electricity", bill.electricity],
          ["Water", bill.water],
          ["Other Charges", other],
          bill.discount ? ["Discount", -bill.discount] : null,
        ]
          .filter(Boolean)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-slate-600">{k}</dt>
              <dd
                className={cx(
                  "tabular-nums",
                  v < 0 ? "text-emerald-700" : "text-slate-800",
                )}
              >
                {peso(v)}
              </dd>
            </div>
          ))}
        <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
          <dt>TOTAL</dt>
          <dd className="tabular-nums">{peso(bill.totalAmount)}</dd>
        </div>
        {bill.amountPaid > 0 && (
          <div className="flex justify-between text-sm">
            <dt className="text-slate-600">Still to pay</dt>
            <dd className="font-semibold tabular-nums">
              {peso(bill.remainingBalance)}
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-sm text-slate-600">
        Due Date:{" "}
        <span className="font-semibold text-slate-800">
          {formatLongDate(bill.dueDate)}
        </span>
      </p>
      <div className="mt-auto pt-4">
        <Link to={`/bills/${bill._id}`}>
          <Button variant="secondary" className="w-full">
            View Bill
          </Button>
        </Link>
      </div>
    </article>
  );
}

/**
 * A payment in a simple card: who, how much, how, when, and its status.
 * Phones get a compact card; waiting payments show Confirm / Reject right on it.
 */
export function PaymentCard({ payment, onView, onConfirm, onReject }) {
  const pending = payment.status === "PENDING_VERIFICATION";
  return (
    <>
      <article className="card p-4 md:hidden">
        <button
          type="button"
          onClick={() => onView(payment)}
          className="block w-full text-left"
          aria-label={`View payment from ${payment.tenantName}, ${peso(payment.amount)}`}
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate font-semibold text-slate-900">
              {payment.tenantName}
            </span>
            <span className="shrink-0 text-lg font-bold text-slate-900 tabular-nums">
              {peso(payment.amount)}
            </span>
          </span>
          <span className="mt-1 flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-slate-600">
              {methodLabel(payment.paymentMethod, payment.provider)} ·{" "}
              {shortDate(payment.paymentDate || payment.submittedAt)}
            </span>
            <StatusBadge status={payment.status} />
          </span>
        </button>
        {pending && onConfirm && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              icon={X}
              className="text-red-700"
              onClick={() => onReject(payment)}
            >
              Reject
            </Button>
            <Button
              variant="success"
              icon={Check}
              onClick={() => onConfirm(payment)}
            >
              Confirm
            </Button>
          </div>
        )}
      </article>
      <PaymentCardWide payment={payment} onView={onView} />
    </>
  );
}

function PaymentCardWide({ payment, onView }) {
  return (
    <article className="card hidden gap-3 p-5 transition-shadow hover:shadow-lift md:flex md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold text-slate-900">
            {payment.tenantName}
          </h3>
          <StatusBadge status={payment.status} />
        </div>
        <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
          {peso(payment.amount)}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
          <span>{methodLabel(payment.paymentMethod, payment.provider)}</span>
          {payment.referenceNumber && (
            <span>Ref: {payment.referenceNumber}</span>
          )}
          {payment.hasProof && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3.5 w-3.5" aria-hidden /> Proof attached
            </span>
          )}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {payment.source === "ADMIN" ? "Recorded" : "Submitted"}:{" "}
          {formatDateTime(payment.submittedAt)}
        </p>
      </div>
      <Button
        variant={
          payment.status === "PENDING_VERIFICATION" ? "primary" : "secondary"
        }
        onClick={() => onView(payment)}
        className="md:w-40"
      >
        View Payment
      </Button>
    </article>
  );
}

/** Month/year selector with previous/next buttons. value = { year, month } */
export function MonthPicker({ value, onChange }) {
  const shift = (d) => {
    const x = new Date(Date.UTC(value.year, value.month - 1 + d, 1));
    onChange({ year: x.getUTCFullYear(), month: x.getUTCMonth() + 1 });
  };
  return (
    <div className="flex w-full items-center gap-1 sm:w-auto">
      <IconButton
        icon={ChevronLeft}
        label="Previous month"
        onClick={() => shift(-1)}
      />
      <select
        aria-label="Month"
        className="input min-w-0 flex-1 sm:w-auto sm:flex-none"
        value={value.month}
        onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <select
        aria-label="Year"
        className="input w-auto min-w-0 shrink"
        value={value.year}
        onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}
      >
        {yearOptions().map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <IconButton
        icon={ChevronRight}
        label="Next month"
        onClick={() => shift(1)}
      />
    </div>
  );
}
