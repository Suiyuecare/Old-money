export const CHECKOUT_COMMAND_STORAGE_KEY =
  "lignee.demo.checkout-order-command.v1";

export interface PersistedCheckoutCommand {
  readonly cartRevision: string;
  readonly quoteDigest: string;
  readonly idempotencyKey: string;
}

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const isPersistedCheckoutCommand = (
  value: unknown,
): value is PersistedCheckoutCommand => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Readonly<Record<string, unknown>>;
  return (
    Object.keys(record).length === 3 &&
    typeof record.cartRevision === "string" &&
    record.cartRevision.length > 0 &&
    record.cartRevision.length <= 2_000 &&
    typeof record.quoteDigest === "string" &&
    /^[a-f0-9]{64}$/.test(record.quoteDigest) &&
    typeof record.idempotencyKey === "string" &&
    /^[A-Za-z0-9._:-]{16,128}$/.test(record.idempotencyKey)
  );
};

const removeWithoutThrowing = (storage: SessionStorageLike): void => {
  try {
    storage.removeItem(CHECKOUT_COMMAND_STORAGE_KEY);
  } catch {
    // Storage can be unavailable under restrictive browser policies. A failed
    // removal must not make checkout depend on a malformed persisted command.
  }
};

export const createCartRevision = (
  lines: readonly { readonly skuId: string; readonly quantity: number }[],
): string =>
  [...lines]
    .sort((left, right) => left.skuId.localeCompare(right.skuId))
    .map((line) => `${line.skuId}:${line.quantity}`)
    .join("|");

export function readCheckoutCommand(
  storage: SessionStorageLike,
  cartRevision: string,
  quoteDigest: string,
): PersistedCheckoutCommand | undefined {
  try {
    const raw = storage.getItem(CHECKOUT_COMMAND_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (
      !isPersistedCheckoutCommand(parsed) ||
      parsed.cartRevision !== cartRevision ||
      parsed.quoteDigest !== quoteDigest
    ) {
      removeWithoutThrowing(storage);
      return undefined;
    }
    return Object.freeze({ ...parsed });
  } catch {
    removeWithoutThrowing(storage);
    return undefined;
  }
}

export function writeCheckoutCommand(
  storage: SessionStorageLike,
  command: PersistedCheckoutCommand,
): void {
  storage.setItem(CHECKOUT_COMMAND_STORAGE_KEY, JSON.stringify(command));
}

export function clearCheckoutCommand(storage: SessionStorageLike): void {
  removeWithoutThrowing(storage);
}
