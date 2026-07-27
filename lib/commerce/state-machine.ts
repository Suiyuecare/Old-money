import { CommerceDomainError } from "./errors";

export type ReservationState =
  | "active"
  | "release_pending"
  | "consumed"
  | "released";

export type PaymentAttemptState =
  | "created"
  | "redirect_ready"
  | "pending"
  | "verification_pending"
  | "succeeded_applied"
  | "succeeded_duplicate"
  | "succeeded_after_release"
  | "failed"
  | "cancelled"
  | "expired"
  | "superseded_reconciling"
  | "superseded_unpaid"
  | "exception";

export type ProviderOperationState =
  | "queued"
  | "in_flight"
  | "succeeded"
  | "retry_safe"
  | "failed_terminal"
  | "unknown"
  | "manual_review";

export type ShipmentState =
  | "draft"
  | "label_pending"
  | "label_created"
  | "ready_for_pickup"
  | "cancellation_pending"
  | "shipment_cancelled"
  | "picked_up"
  | "in_transit"
  | "delivered";

export type InvoiceState =
  | "pending_issue"
  | "issuing"
  | "issued"
  | "issue_failed";

export type ReturnCaseState =
  | "requested"
  | "authorized"
  | "rejected"
  | "received"
  | "inspecting"
  | "settlement_pending"
  | "closed";

export type AuthOperationState =
  | "queued"
  | "broker_claimed"
  | "in_flight"
  | "remote_applied"
  | "unknown"
  | "reconciled_succeeded"
  | "reconciled_failed"
  | "manual_review";

export const reservationTransitions = {
  active: ["consumed", "release_pending"],
  release_pending: ["consumed", "released"],
  consumed: [],
  released: [],
} as const satisfies Record<ReservationState, readonly ReservationState[]>;

export const paymentAttemptTransitions = {
  created: ["redirect_ready", "failed", "cancelled", "expired"],
  redirect_ready: ["pending", "verification_pending", "failed", "cancelled", "expired", "superseded_reconciling"],
  pending: ["verification_pending", "failed", "cancelled", "expired", "superseded_reconciling"],
  verification_pending: ["succeeded_applied", "succeeded_duplicate", "succeeded_after_release", "exception", "superseded_reconciling"],
  succeeded_applied: [],
  succeeded_duplicate: [],
  succeeded_after_release: [],
  failed: ["succeeded_applied", "succeeded_duplicate", "succeeded_after_release"],
  cancelled: ["succeeded_applied", "succeeded_duplicate", "succeeded_after_release"],
  expired: ["succeeded_applied", "succeeded_duplicate", "succeeded_after_release"],
  superseded_reconciling: ["superseded_unpaid", "succeeded_duplicate"],
  superseded_unpaid: [],
  exception: [],
} as const satisfies Record<PaymentAttemptState, readonly PaymentAttemptState[]>;

export const providerOperationTransitions = {
  queued: ["in_flight"],
  in_flight: ["succeeded", "retry_safe", "failed_terminal", "unknown"],
  succeeded: [],
  retry_safe: ["queued"],
  failed_terminal: [],
  unknown: ["succeeded", "retry_safe", "failed_terminal", "manual_review"],
  manual_review: ["succeeded", "retry_safe", "failed_terminal"],
} as const satisfies Record<ProviderOperationState, readonly ProviderOperationState[]>;

export const shipmentTransitions = {
  draft: ["label_pending"],
  label_pending: ["label_created", "cancellation_pending"],
  label_created: ["ready_for_pickup", "cancellation_pending"],
  ready_for_pickup: ["picked_up", "cancellation_pending"],
  cancellation_pending: ["shipment_cancelled", "picked_up"],
  shipment_cancelled: [],
  picked_up: ["in_transit"],
  in_transit: ["delivered"],
  delivered: [],
} as const satisfies Record<ShipmentState, readonly ShipmentState[]>;

export const invoiceTransitions = {
  pending_issue: ["issuing"],
  issuing: ["issued", "issue_failed"],
  issued: [],
  issue_failed: ["issuing"],
} as const satisfies Record<InvoiceState, readonly InvoiceState[]>;

export const returnCaseTransitions = {
  requested: ["authorized", "rejected"],
  authorized: ["received"],
  rejected: [],
  received: ["inspecting"],
  inspecting: ["settlement_pending"],
  settlement_pending: ["closed"],
  closed: [],
} as const satisfies Record<ReturnCaseState, readonly ReturnCaseState[]>;

export const authOperationTransitions = {
  queued: ["broker_claimed"],
  broker_claimed: ["in_flight"],
  in_flight: ["remote_applied", "unknown"],
  remote_applied: ["reconciled_succeeded", "reconciled_failed", "manual_review"],
  unknown: ["reconciled_succeeded", "reconciled_failed", "manual_review"],
  reconciled_succeeded: [],
  reconciled_failed: [],
  manual_review: [],
} as const satisfies Record<AuthOperationState, readonly AuthOperationState[]>;

export function transitionState<State extends string>(
  current: State,
  next: State,
  transitions: Readonly<Record<State, readonly State[]>>,
): State {
  if (!transitions[current]?.includes(next)) {
    throw new CommerceDomainError(
      "INVALID_STATE_TRANSITION",
      `Cannot transition from ${current} to ${next}.`,
      409,
      { current, next },
    );
  }
  return next;
}

