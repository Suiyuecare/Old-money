import { CommerceDomainError } from "./errors";

export const TAX_RATE_PERCENT = 5;
export const FREE_SHIPPING_THRESHOLD_TWD = 12_000;
export const STANDARD_SHIPPING_TWD = 250;
export const MAX_ORDER_TOTAL_TWD = 250_000;

export interface TaxAllocation {
  readonly grossTwd: number;
  readonly netTwd: number;
  readonly taxTwd: number;
}

export interface CartInputLine {
  readonly skuId: string;
  readonly quantity: number;
  readonly priceVersion: string;
  readonly unitGrossTwd: number;
}

export interface OrderUnitSnapshot extends TaxAllocation {
  readonly skuId: string;
  readonly unitOrdinal: number;
  readonly invoiceLineKey: string;
}

export interface OrderLineSnapshot extends TaxAllocation {
  readonly skuId: string;
  readonly quantity: number;
  readonly unitGrossTwd: number;
  readonly priceVersion: string;
  readonly invoiceLineKey: string;
  readonly units: readonly OrderUnitSnapshot[];
}

export interface OrderTotalsSnapshot extends TaxAllocation {
  readonly merchandiseGrossTwd: number;
  readonly shipping: TaxAllocation & { readonly invoiceLineKey: "shipping" };
  readonly lines: readonly OrderLineSnapshot[];
  readonly currency: "TWD";
  readonly taxRatePercent: 5;
}

const assertNonNegativeInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CommerceDomainError("INVALID_MONEY", `${label} must be a non-negative TWD integer.`);
  }
};

export const splitTaxIncludedTwd = (grossTwd: number): TaxAllocation => {
  assertNonNegativeInteger(grossTwd, "grossTwd");
  const netTwd = Math.round((grossTwd * 100) / 105);
  return Object.freeze({ grossTwd, netTwd, taxTwd: grossTwd - netTwd });
};

const allocateInteger = (
  total: number,
  weights: readonly number[],
): readonly number[] => {
  if (weights.length === 0) return [];
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  if (weightTotal === 0) return Object.freeze(weights.map(() => 0));

  const raw = weights.map((weight) => (total * weight) / weightTotal);
  const allocated = raw.map(Math.floor);
  let remainder = total - allocated.reduce((sum, value) => sum + value, 0);
  const residualOrder = raw
    .map((value, index) => ({ index, residual: value - Math.floor(value) }))
    .sort((left, right) => right.residual - left.residual || left.index - right.index);
  for (const item of residualOrder) {
    if (remainder === 0) break;
    allocated[item.index] += 1;
    remainder -= 1;
  }
  return Object.freeze(allocated);
};

export const shippingForMerchandise = (merchandiseGrossTwd: number): number => {
  assertNonNegativeInteger(merchandiseGrossTwd, "merchandiseGrossTwd");
  return merchandiseGrossTwd === 0 ||
    merchandiseGrossTwd >= FREE_SHIPPING_THRESHOLD_TWD
    ? 0
    : STANDARD_SHIPPING_TWD;
};

export function createOrderTotalsSnapshot(
  inputLines: readonly CartInputLine[],
): OrderTotalsSnapshot {
  if (inputLines.length === 0 || inputLines.length > 10) {
    throw new CommerceDomainError("INVALID_CART_SIZE", "Checkout requires 1–10 distinct SKUs.");
  }
  if (new Set(inputLines.map((line) => line.skuId)).size !== inputLines.length) {
    throw new CommerceDomainError(
      "DUPLICATE_SKU",
      "Each SKU must appear exactly once in a checkout command.",
    );
  }
  const itemCount = inputLines.reduce((sum, line) => sum + line.quantity, 0);
  if (itemCount > 10) {
    throw new CommerceDomainError("INVALID_CART_QUANTITY", "Checkout is limited to 10 items.");
  }
  for (const line of inputLines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 3) {
      throw new CommerceDomainError("INVALID_LINE_QUANTITY", "Each SKU is limited to 1–3 items.");
    }
    assertNonNegativeInteger(line.unitGrossTwd, "unitGrossTwd");
    if (!line.skuId || !line.priceVersion) {
      throw new CommerceDomainError("INVALID_PRICE_SNAPSHOT", "SKU and price version are required.");
    }
  }

  // Canonical order is part of the financial model, not merely a presentation
  // or hashing concern. It makes tax remainder allocation and invoice line keys
  // stable for the same cart regardless of request order.
  const canonicalInputLines = [...inputLines].sort((left, right) =>
    left.skuId.localeCompare(right.skuId),
  );
  const lineGross = canonicalInputLines.map(
    (line) => line.unitGrossTwd * line.quantity,
  );
  const merchandiseGrossTwd = lineGross.reduce((sum, value) => sum + value, 0);
  const shippingGrossTwd = shippingForMerchandise(merchandiseGrossTwd);
  const grossTwd = merchandiseGrossTwd + shippingGrossTwd;
  if (grossTwd > MAX_ORDER_TOTAL_TWD) {
    throw new CommerceDomainError("ORDER_LIMIT_EXCEEDED", "Order exceeds the TWD 250,000 limit.");
  }

  const merchandiseTax = splitTaxIncludedTwd(merchandiseGrossTwd);
  const lineNets = allocateInteger(merchandiseTax.netTwd, lineGross);
  const lines = canonicalInputLines.map((line, lineIndex): OrderLineSnapshot => {
    const invoiceLineKey = `item:${String(lineIndex + 1).padStart(2, "0")}:${line.skuId}`;
    const gross = lineGross[lineIndex];
    const net = lineNets[lineIndex];
    const unitGrosses = Array.from({ length: line.quantity }, () => line.unitGrossTwd);
    const unitNets = allocateInteger(net, unitGrosses);
    const units = unitGrosses.map((unitGrossTwd, unitIndex): OrderUnitSnapshot =>
      Object.freeze({
        skuId: line.skuId,
        unitOrdinal: unitIndex + 1,
        grossTwd: unitGrossTwd,
        netTwd: unitNets[unitIndex],
        taxTwd: unitGrossTwd - unitNets[unitIndex],
        invoiceLineKey,
      }),
    );
    return Object.freeze({
      skuId: line.skuId,
      quantity: line.quantity,
      unitGrossTwd: line.unitGrossTwd,
      priceVersion: line.priceVersion,
      invoiceLineKey,
      grossTwd: gross,
      netTwd: net,
      taxTwd: gross - net,
      units: Object.freeze(units),
    });
  });
  const shipping = Object.freeze({
    ...splitTaxIncludedTwd(shippingGrossTwd),
    invoiceLineKey: "shipping" as const,
  });
  const netTwd = merchandiseTax.netTwd + shipping.netTwd;
  return Object.freeze({
    currency: "TWD",
    taxRatePercent: TAX_RATE_PERCENT,
    merchandiseGrossTwd,
    grossTwd,
    netTwd,
    taxTwd: grossTwd - netTwd,
    shipping,
    lines: Object.freeze(lines),
  });
}
