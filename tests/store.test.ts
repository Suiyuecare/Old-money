// @vitest-environment jsdom

import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CART_STORAGE_KEY,
  FREE_SHIPPING_THRESHOLD_TWD,
  MAX_CART_QUANTITY,
  STANDARD_SHIPPING_TWD,
  StoreProvider,
  WISHLIST_STORAGE_KEY,
  decodeCart,
  decodeWishlist,
  getShippingTwdForSubtotal,
  isValidQuantity,
  resolveCartLine,
  useStore,
} from "@/components/store/StoreProvider";

const KNOWN_SKU_ID = "field-house-polo-m-deep-olive";
const KNOWN_PRODUCT_ID = "field-house-polo";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("cart storage decoding", () => {
  it("uses an empty valid state when storage has not been written", () => {
    expect(decodeCart(null)).toEqual({
      valid: true,
      value: { version: 1, lines: [] },
      repairedEntries: 0,
    });
  });

  it.each([
    ["malformed JSON", "{not-json"],
    ["wrong version", JSON.stringify({ version: 2, lines: [] })],
    ["missing lines", JSON.stringify({ version: 1 })],
    ["non-array lines", JSON.stringify({ version: 1, lines: {} })],
  ])("rejects %s without trusting any entries", (_label, raw) => {
    expect(decodeCart(raw)).toEqual({
      valid: false,
      value: { version: 1, lines: [] },
      repairedEntries: 0,
    });
  });

  it("repairs unknown SKUs without invalidating the whole payload", () => {
    expect(
      decodeCart(
        JSON.stringify({
          version: 1,
          lines: [
            { skuId: "unknown-sku", quantity: 1 },
            { skuId: KNOWN_SKU_ID, quantity: 2 },
          ],
        }),
      ),
    ).toEqual({
      valid: true,
      value: { version: 1, lines: [{ skuId: KNOWN_SKU_ID, quantity: 2 }] },
      repairedEntries: 1,
    });
  });

  it.each([0, -1, 1.5, MAX_CART_QUANTITY + 1, Number.NaN, "2", null])(
    "drops invalid quantity %s",
    (quantity) => {
      const decoded = decodeCart(
        JSON.stringify({
          version: 1,
          lines: [{ skuId: KNOWN_SKU_ID, quantity }],
        }),
      );

      expect(decoded).toEqual({
        valid: true,
        value: { version: 1, lines: [] },
        repairedEntries: 1,
      });
      expect(isValidQuantity(quantity)).toBe(false);
    },
  );

  it("merges duplicate SKU lines and caps their combined quantity at nine", () => {
    const decoded = decodeCart(
      JSON.stringify({
        version: 1,
        lines: [
          { skuId: KNOWN_SKU_ID, quantity: 6 },
          { skuId: KNOWN_SKU_ID, quantity: 5 },
        ],
      }),
    );

    expect(decoded).toEqual({
      valid: true,
      value: {
        version: 1,
        lines: [{ skuId: KNOWN_SKU_ID, quantity: MAX_CART_QUANTITY }],
      },
      repairedEntries: 1,
    });
  });

  it("resolves display data exclusively from the canonical SKU and catalog", () => {
    expect(resolveCartLine({ skuId: "unknown-sku", quantity: 1 })).toBeUndefined();
    expect(resolveCartLine({ skuId: KNOWN_SKU_ID, quantity: 2 })).toMatchObject({
      skuId: KNOWN_SKU_ID,
      productId: KNOWN_PRODUCT_ID,
      quantity: 2,
      unitPriceTwd: 7_800,
      lineTotalTwd: 15_600,
    });
  });
});

describe("shipping threshold", () => {
  it("charges below the threshold and becomes free exactly at NT$12,000", () => {
    expect(FREE_SHIPPING_THRESHOLD_TWD).toBe(12_000);
    expect(STANDARD_SHIPPING_TWD).toBe(250);
    expect(getShippingTwdForSubtotal(0)).toBe(0);
    expect(getShippingTwdForSubtotal(11_999)).toBe(250);
    expect(getShippingTwdForSubtotal(12_000)).toBe(0);
    expect(getShippingTwdForSubtotal(12_001)).toBe(0);
  });
});

describe("wishlist storage decoding", () => {
  it.each([
    ["malformed JSON", "not-json"],
    ["wrong version", JSON.stringify({ version: 3, productIds: [] })],
    ["non-array IDs", JSON.stringify({ version: 1, productIds: {} })],
  ])("rejects %s safely", (_label, raw) => {
    expect(decodeWishlist(raw)).toEqual({
      valid: false,
      value: { version: 1, productIds: [] },
      repairedEntries: 0,
    });
  });

  it("removes unknown, non-string, and duplicate IDs while keeping valid order", () => {
    const decoded = decodeWishlist(
      JSON.stringify({
        version: 1,
        productIds: [KNOWN_PRODUCT_ID, "unknown-product", 7, KNOWN_PRODUCT_ID],
      }),
    );

    expect(decoded).toEqual({
      valid: true,
      value: { version: 1, productIds: [KNOWN_PRODUCT_ID] },
      repairedEntries: 3,
    });
  });
});

function StoreFallbackProbe() {
  const store = useStore();
  return createElement(
    "div",
    null,
    createElement("output", { "data-testid": "hydrated" }, String(store.hydrated)),
    createElement("output", { "data-testid": "cart-count" }, String(store.cartItemCount)),
    createElement("output", { "data-testid": "wishlist-count" }, String(store.wishlistCount)),
    createElement(
      "button",
      { type: "button", onClick: () => store.addToCart(KNOWN_SKU_ID) },
      "add cart",
    ),
    createElement(
      "button",
      { type: "button", onClick: () => store.addToWishlist(KNOWN_PRODUCT_ID) },
      "add wishlist",
    ),
  );
}

describe("storage-unavailable memory fallback", () => {
  it("hydrates and remains usable when localStorage reads and writes throw", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    render(createElement(StoreProvider, null, createElement(StoreFallbackProbe)));

    await waitFor(() => expect(screen.getByTestId("hydrated")).toHaveTextContent("true"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "add cart" }));
      fireEvent.click(screen.getByRole("button", { name: "add wishlist" }));
    });

    expect(screen.getByTestId("cart-count")).toHaveTextContent("1");
    expect(screen.getByTestId("wishlist-count")).toHaveTextContent("1");
    expect(window.localStorage.getItem).toHaveBeenCalledWith(CART_STORAGE_KEY);
    expect(window.localStorage.getItem).toHaveBeenCalledWith(WISHLIST_STORAGE_KEY);
  });
});
