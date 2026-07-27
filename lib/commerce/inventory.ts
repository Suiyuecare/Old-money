import { CommerceDomainError } from "./errors";

export type InventoryOperationKind =
  | "receive"
  | "reserve"
  | "release"
  | "sale"
  | "cancel_restock"
  | "return_sellable"
  | "return_damaged";

export interface InventoryBalance {
  readonly skuId: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly safetyStock: number;
}

export interface InventoryMovement {
  readonly operationKey: string;
  readonly skuId: string;
  readonly kind: InventoryOperationKind;
  readonly quantity: number;
  readonly deltaOnHand: number;
  readonly deltaReserved: number;
  readonly orderId?: string;
  readonly reservationId?: string;
  readonly occurredAt: string;
}

export interface InventoryOperationResult {
  readonly balance: InventoryBalance;
  readonly movement: InventoryMovement;
  readonly replayed: boolean;
}

const operationDeltas = (
  kind: InventoryOperationKind,
  quantity: number,
): readonly [number, number] => {
  switch (kind) {
    case "receive":
    case "cancel_restock":
    case "return_sellable":
      return [quantity, 0];
    case "reserve":
      return [0, quantity];
    case "release":
      return [0, -quantity];
    case "sale":
      return [-quantity, -quantity];
    case "return_damaged":
      return [0, 0];
  }
};

const assertBalance = (balance: InventoryBalance): void => {
  if (
    ![balance.onHand, balance.reserved, balance.safetyStock].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    balance.reserved + balance.safetyStock > balance.onHand
  ) {
    throw new CommerceDomainError(
      "INVENTORY_INVARIANT_FAILED",
      "Inventory operation would violate stock invariants.",
      409,
    );
  }
};

export class DeterministicInventoryLedger {
  readonly #balances = new Map<string, InventoryBalance>();
  readonly #openingBalances = new Map<string, InventoryBalance>();
  readonly #movements = new Map<string, InventoryMovement>();

  constructor(initialBalances: readonly InventoryBalance[] = []) {
    for (const balance of initialBalances) {
      assertBalance(balance);
      const snapshot = Object.freeze({ ...balance });
      this.#balances.set(balance.skuId, snapshot);
      this.#openingBalances.set(balance.skuId, snapshot);
    }
  }

  getBalance(skuId: string): InventoryBalance | undefined {
    return this.#balances.get(skuId);
  }

  get availableBySku(): Readonly<Record<string, number>> {
    return Object.freeze(
      Object.fromEntries(
        [...this.#balances].map(([skuId, balance]) => [
          skuId,
          balance.onHand - balance.reserved - balance.safetyStock,
        ]),
      ),
    );
  }

  apply(input: {
    readonly operationKey: string;
    readonly skuId: string;
    readonly kind: InventoryOperationKind;
    readonly quantity: number;
    readonly orderId?: string;
    readonly reservationId?: string;
    readonly occurredAt?: string;
  }): InventoryOperationResult {
    if (!input.operationKey || !Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
      throw new CommerceDomainError("INVALID_INVENTORY_OPERATION", "Operation key and positive quantity are required.");
    }
    const prior = this.#movements.get(input.operationKey);
    if (prior) {
      const same =
        prior.skuId === input.skuId &&
        prior.kind === input.kind &&
        prior.quantity === input.quantity &&
        prior.orderId === input.orderId &&
        prior.reservationId === input.reservationId;
      if (!same) {
        throw new CommerceDomainError(
          "INVENTORY_OPERATION_CONFLICT",
          "Inventory operation key was reused with different input.",
          409,
        );
      }
      return {
        balance: this.#balances.get(input.skuId) as InventoryBalance,
        movement: prior,
        replayed: true,
      };
    }
    const current = this.#balances.get(input.skuId);
    if (!current) {
      throw new CommerceDomainError("UNKNOWN_SKU", `No inventory balance exists for ${input.skuId}.`, 404);
    }
    const [deltaOnHand, deltaReserved] = operationDeltas(input.kind, input.quantity);
    const next = Object.freeze({
      ...current,
      onHand: current.onHand + deltaOnHand,
      reserved: current.reserved + deltaReserved,
    });
    assertBalance(next);
    const movement: InventoryMovement = Object.freeze({
      operationKey: input.operationKey,
      skuId: input.skuId,
      kind: input.kind,
      quantity: input.quantity,
      deltaOnHand,
      deltaReserved,
      ...(input.orderId ? { orderId: input.orderId } : {}),
      ...(input.reservationId ? { reservationId: input.reservationId } : {}),
      occurredAt: input.occurredAt ?? new Date(0).toISOString(),
    });
    this.#balances.set(input.skuId, next);
    this.#movements.set(input.operationKey, movement);
    return { balance: next, movement, replayed: false };
  }

  reconcile(): readonly string[] {
    const errors: string[] = [];
    for (const [skuId, balance] of this.#balances) {
      const opening = this.#openingBalances.get(skuId);
      const ledgerOnHand = [...this.#movements.values()]
        .filter((movement) => movement.skuId === skuId)
        .reduce((sum, movement) => sum + movement.deltaOnHand, 0);
      const ledgerReserved = [...this.#movements.values()]
        .filter((movement) => movement.skuId === skuId)
        .reduce((sum, movement) => sum + movement.deltaReserved, 0);
      if (
        !opening ||
        opening.onHand + ledgerOnHand !== balance.onHand ||
        opening.reserved + ledgerReserved !== balance.reserved ||
        opening.safetyStock !== balance.safetyStock
      ) {
        errors.push(`Opening balance plus movements does not match current balance for ${skuId}.`);
      }
      if (!Number.isSafeInteger(ledgerOnHand) || !Number.isSafeInteger(ledgerReserved)) {
        errors.push(`Invalid ledger sum for ${skuId}.`);
      }
      try {
        assertBalance(balance);
      } catch {
        errors.push(`Invalid balance for ${skuId}.`);
      }
    }
    return Object.freeze(errors);
  }
}
