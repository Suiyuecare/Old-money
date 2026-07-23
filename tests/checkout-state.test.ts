// @vitest-environment jsdom

import { createElement, type PropsWithChildren } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CheckoutSessionProvider,
  SAFE_PREVIEW_DETAILS,
  useCheckoutSession,
  validatePreviewDetails,
  type CompletionSnapshot,
} from "@/app/checkout/CheckoutSessionProvider";

const COMPLETION: CompletionSnapshot = {
  itemCount: 2,
  subtotalTwd: 15_600,
  shippingTwd: 0,
  totalTwd: 15_600,
};

const wrapper = ({ children }: PropsWithChildren) =>
  createElement(CheckoutSessionProvider, null, children);

afterEach(cleanup);

describe("preview detail boundary", () => {
  it("accepts only the safe prefilled .invalid example", () => {
    expect(validatePreviewDetails(SAFE_PREVIEW_DETAILS)).toEqual({});
    expect(
      validatePreviewDetails({
        ...SAFE_PREVIEW_DETAILS,
        recipient: "",
        email: "real@example.com",
        postalCode: "10001",
        region: "taipei",
        address: "一段看似真實的地址",
      }),
    ).toEqual({
      recipient: "請保留 1–60 字的虛構收件稱呼。",
      email: "預覽模式只接受以 .invalid 結尾的虛構信箱。",
      postalCode: "預覽模式請使用虛構郵遞區號 00000。",
      region: "請選擇預覽用配送區域。",
      address: "地址必須明確包含「虛構」，且不超過 100 字。",
    });
  });
});

describe("checkout guarded state machine", () => {
  it("does not permit skipping payment choice, review, or completion", () => {
    const { result } = renderHook(() => useCheckoutSession(), { wrapper });

    expect(result.current.step).toBe("details");
    expect(result.current.completion).toBeNull();

    act(() => {
      expect(result.current.goToReview()).toBe(false);
      expect(result.current.markCompleted(COMPLETION)).toBe(false);
    });
    expect(result.current.step).toBe("details");
    expect(result.current.completion).toBeNull();

    act(() => {
      result.current.updateDetail("email", "real@example.com");
    });
    act(() => {
      expect(result.current.goToPayment()).toBe(false);
    });
    expect(result.current.step).toBe("details");

    act(() => {
      result.current.updateDetail("email", SAFE_PREVIEW_DETAILS.email);
    });
    act(() => {
      expect(result.current.goToPayment()).toBe(true);
    });
    expect(result.current.step).toBe("payment-demo");

    act(() => {
      expect(result.current.goToReview()).toBe(false);
      expect(result.current.markCompleted(COMPLETION)).toBe(false);
    });
    expect(result.current.step).toBe("payment-demo");
    expect(result.current.completion).toBeNull();

    act(() => {
      result.current.choosePayment("card-planned");
    });
    act(() => {
      expect(result.current.goToReview()).toBe(true);
    });
    expect(result.current.step).toBe("review");

    act(() => {
      expect(result.current.markCompleted(COMPLETION)).toBe(true);
    });
    expect(result.current.completion).toEqual(COMPLETION);

    act(() => {
      expect(result.current.markCompleted(COMPLETION)).toBe(false);
    });
    expect(result.current.completion).toEqual(COMPLETION);
  });

  it("consumes completion back to safe initial state", () => {
    const { result } = renderHook(() => useCheckoutSession(), { wrapper });

    act(() => {
      result.current.goToPayment();
    });
    act(() => {
      result.current.choosePayment("apple-pay-planned");
    });
    act(() => {
      result.current.goToReview();
    });
    act(() => {
      result.current.markCompleted(COMPLETION);
    });
    expect(result.current.completion).toEqual(COMPLETION);

    act(() => {
      result.current.consumeCompletion();
    });
    expect(result.current.step).toBe("details");
    expect(result.current.details).toEqual(SAFE_PREVIEW_DETAILS);
    expect(result.current.paymentChoice).toBeNull();
    expect(result.current.completion).toBeNull();
  });

  it("loses completion and contact state across a provider remount like reload", () => {
    const first = renderHook(() => useCheckoutSession(), { wrapper });

    act(() => {
      first.result.current.updateDetail("recipient", "另一位虛構預覽訪客");
      first.result.current.goToPayment();
    });
    act(() => {
      first.result.current.choosePayment("card-planned");
    });
    act(() => {
      first.result.current.goToReview();
    });
    act(() => {
      first.result.current.markCompleted(COMPLETION);
    });
    expect(first.result.current.completion).toEqual(COMPLETION);
    first.unmount();

    const reloaded = renderHook(() => useCheckoutSession(), { wrapper });
    expect(reloaded.result.current.step).toBe("details");
    expect(reloaded.result.current.details).toEqual(SAFE_PREVIEW_DETAILS);
    expect(reloaded.result.current.paymentChoice).toBeNull();
    expect(reloaded.result.current.completion).toBeNull();
  });
});
