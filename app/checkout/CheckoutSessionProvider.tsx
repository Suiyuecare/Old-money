"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

export type CheckoutStep = "details" | "payment-demo" | "review";
export type PaymentDemoChoice = "card-planned" | "apple-pay-planned";

export interface PreviewCheckoutDetails {
  readonly recipient: string;
  readonly email: string;
  readonly postalCode: string;
  readonly region: string;
  readonly address: string;
}

export type PreviewCheckoutErrors = Partial<
  Record<keyof PreviewCheckoutDetails, string>
>;

export interface CompletionSnapshot {
  readonly itemCount: number;
  readonly subtotalTwd: number;
  readonly shippingTwd: number;
  readonly totalTwd: number;
}

interface CheckoutSessionState {
  readonly step: CheckoutStep;
  readonly details: PreviewCheckoutDetails;
  readonly paymentChoice: PaymentDemoChoice | null;
  readonly completion: CompletionSnapshot | null;
}

interface CheckoutSessionContextValue extends CheckoutSessionState {
  readonly updateDetail: (key: keyof PreviewCheckoutDetails, value: string) => void;
  readonly choosePayment: (choice: PaymentDemoChoice) => void;
  readonly goToDetails: () => void;
  readonly goToPayment: () => boolean;
  readonly goToReview: () => boolean;
  readonly markCompleted: (snapshot: CompletionSnapshot) => boolean;
  readonly consumeCompletion: () => void;
}

export const SAFE_PREVIEW_DETAILS: PreviewCheckoutDetails = Object.freeze({
  recipient: "LIGNÉE 預覽訪客",
  email: "preview@lignee.invalid",
  postalCode: "00000",
  region: "preview-main-island",
  address: "虛構展示地址・莊園路 1 號",
});

const createInitialState = (): CheckoutSessionState => ({
  step: "details",
  details: { ...SAFE_PREVIEW_DETAILS },
  paymentChoice: null,
  completion: null,
});

export function validatePreviewDetails(
  details: PreviewCheckoutDetails,
): PreviewCheckoutErrors {
  const errors: PreviewCheckoutErrors = {};

  if (!details.recipient.trim() || details.recipient.trim().length > 60) {
    errors.recipient = "請保留 1–60 字的虛構收件稱呼。";
  }
  if (!/^[^\s@]+@[^\s@]+\.invalid$/i.test(details.email.trim())) {
    errors.email = "預覽模式只接受以 .invalid 結尾的虛構信箱。";
  }
  if (details.postalCode !== "00000") {
    errors.postalCode = "預覽模式請使用虛構郵遞區號 00000。";
  }
  if (!details.region.startsWith("preview-")) {
    errors.region = "請選擇預覽用配送區域。";
  }
  if (!details.address.includes("虛構") || details.address.trim().length > 100) {
    errors.address = "地址必須明確包含「虛構」，且不超過 100 字。";
  }

  return errors;
}

const CheckoutSessionContext = createContext<CheckoutSessionContextValue | null>(null);

export function CheckoutSessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<CheckoutSessionState>(createInitialState);

  const updateDetail = useCallback(
    (key: keyof PreviewCheckoutDetails, value: string) => {
      setSession((current) => ({
        ...current,
        details: { ...current.details, [key]: value },
        completion: null,
      }));
    },
    [],
  );

  const choosePayment = useCallback((choice: PaymentDemoChoice) => {
    setSession((current) => ({ ...current, paymentChoice: choice, completion: null }));
  }, []);

  const goToDetails = useCallback(() => {
    setSession((current) => ({ ...current, step: "details", completion: null }));
  }, []);

  const goToPayment = useCallback((): boolean => {
    if (Object.keys(validatePreviewDetails(session.details)).length > 0) return false;
    setSession((current) => ({ ...current, step: "payment-demo", completion: null }));
    return true;
  }, [session.details]);

  const goToReview = useCallback((): boolean => {
    if (session.step !== "payment-demo" || session.paymentChoice === null) return false;
    setSession((current) => ({ ...current, step: "review", completion: null }));
    return true;
  }, [session.paymentChoice, session.step]);

  const markCompleted = useCallback((snapshot: CompletionSnapshot): boolean => {
    if (
      session.step !== "review" ||
      session.paymentChoice === null ||
      session.completion !== null
    ) {
      return false;
    }
    setSession((current) => ({ ...current, completion: snapshot }));
    return true;
  }, [session.completion, session.paymentChoice, session.step]);

  const consumeCompletion = useCallback(() => {
    setSession(createInitialState());
  }, []);

  const value = useMemo<CheckoutSessionContextValue>(
    () => ({
      ...session,
      updateDetail,
      choosePayment,
      goToDetails,
      goToPayment,
      goToReview,
      markCompleted,
      consumeCompletion,
    }),
    [
      choosePayment,
      consumeCompletion,
      goToDetails,
      goToPayment,
      goToReview,
      markCompleted,
      session,
      updateDetail,
    ],
  );

  return (
    <CheckoutSessionContext.Provider value={value}>
      {children}
    </CheckoutSessionContext.Provider>
  );
}

export function useCheckoutSession(): CheckoutSessionContextValue {
  const session = useContext(CheckoutSessionContext);
  if (!session) {
    throw new Error("useCheckoutSession must be used within CheckoutSessionProvider.");
  }
  return session;
}
