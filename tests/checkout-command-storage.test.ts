import { describe, expect, it } from "vitest";

import {
  CHECKOUT_COMMAND_STORAGE_KEY,
  clearCheckoutCommand,
  createCartRevision,
  readCheckoutCommand,
  writeCheckoutCommand,
} from "@/lib/commerce/checkout-command-storage";

class MemorySessionStorage {
  readonly records = new Map<string, string>();

  getItem(key: string): string | null {
    return this.records.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.records.set(key, value);
  }

  removeItem(key: string): void {
    this.records.delete(key);
  }
}

describe("checkout retry command session storage", () => {
  it("reuses only the minimal same-cart, same-quote command after refresh", () => {
    const storage = new MemorySessionStorage();
    const cartRevision = createCartRevision([
      { skuId: "sku-b", quantity: 2 },
      { skuId: "sku-a", quantity: 1 },
    ]);
    const command = {
      cartRevision,
      quoteDigest: "a".repeat(64),
      idempotencyKey: "demo-ui:retry-key-0001",
    };
    writeCheckoutCommand(storage, command);
    expect(JSON.parse(storage.getItem(CHECKOUT_COMMAND_STORAGE_KEY) ?? "")).toEqual(
      command,
    );
    expect(
      readCheckoutCommand(storage, cartRevision, command.quoteDigest),
    ).toEqual(command);
    expect(
      readCheckoutCommand(storage, `${cartRevision}|changed`, command.quoteDigest),
    ).toBeUndefined();
    expect(storage.getItem(CHECKOUT_COMMAND_STORAGE_KEY)).toBeNull();
  });

  it("clears malformed, stale-quote, and successful command records", () => {
    const storage = new MemorySessionStorage();
    storage.setItem(CHECKOUT_COMMAND_STORAGE_KEY, "{malformed");
    expect(readCheckoutCommand(storage, "cart", "b".repeat(64))).toBeUndefined();
    expect(storage.getItem(CHECKOUT_COMMAND_STORAGE_KEY)).toBeNull();

    writeCheckoutCommand(storage, {
      cartRevision: "sku-a:1",
      quoteDigest: "a".repeat(64),
      idempotencyKey: "demo-ui:retry-key-0002",
    });
    expect(
      readCheckoutCommand(storage, "sku-a:1", "b".repeat(64)),
    ).toBeUndefined();
    writeCheckoutCommand(storage, {
      cartRevision: "sku-a:1",
      quoteDigest: "b".repeat(64),
      idempotencyKey: "demo-ui:retry-key-0003",
    });
    clearCheckoutCommand(storage);
    expect(storage.getItem(CHECKOUT_COMMAND_STORAGE_KEY)).toBeNull();
  });
});
