"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { useStore } from "@/components/store/StoreProvider";
import styles from "@/components/store/store-ui.module.css";
import { formatTwd } from "@/lib/catalog";
import {
  clearCheckoutCommand,
  createCartRevision,
  readCheckoutCommand,
  writeCheckoutCommand,
  type PersistedCheckoutCommand,
} from "@/lib/commerce/checkout-command-storage";
import {
  useCheckoutSession,
  validatePreviewDetails,
  type PaymentDemoChoice,
  type PreviewCheckoutErrors,
} from "./CheckoutSessionProvider";

const paymentLabels: Readonly<Record<PaymentDemoChoice, string>> = {
  "card-planned": "信用卡（正式版規劃）",
  "apple-pay-planned": "Apple Pay（正式版規劃）",
};

interface ServerQuote {
  readonly quoteDigest: string;
  readonly merchandiseGrossTwd: number;
  readonly grossTwd: number;
  readonly shipping: { readonly grossTwd: number };
  readonly lines: readonly {
    readonly skuId: string;
    readonly quantity: number;
    readonly priceVersion: string;
    readonly unitGrossTwd: number;
    readonly lineGrossTwd: number;
    readonly priceChanged: boolean;
  }[];
}

type QuoteState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "ready"; readonly quote: ServerQuote }
  | { readonly status: "error"; readonly message: string };

export function CheckoutClient() {
  const router = useRouter();
  const {
    cartItemCount,
    cartLines,
    clearCart,
    hydrated,
    shippingTwd,
    subtotalTwd,
    totalTwd,
  } = useStore();
  const checkout = useCheckoutSession();
  const [detailErrors, setDetailErrors] = useState<PreviewCheckoutErrors>({});
  const [paymentError, setPaymentError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [quoteState, setQuoteState] = useState<QuoteState>({ status: "idle" });
  const [priceAcknowledged, setPriceAcknowledged] = useState(false);
  const [orderError, setOrderError] = useState("");
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const submitLockRef = useRef(false);
  const orderCommandRef = useRef<PersistedCheckoutCommand | undefined>(
    undefined,
  );

  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [checkout.step]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const cartRevision = createCartRevision(cartLines);
    if (
      cartLines.length === 0 ||
      (orderCommandRef.current &&
        orderCommandRef.current.cartRevision !== cartRevision)
    ) {
      clearCheckoutCommand(window.sessionStorage);
      orderCommandRef.current = undefined;
    }
  }, [cartLines, hydrated]);

  useEffect(() => {
    if (!hydrated || cartLines.length === 0) {
      queueMicrotask(() => setQuoteState({ status: "idle" }));
      return;
    }
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setQuoteState({ status: "loading" });
        setPriceAcknowledged(false);
      }
    });
    void fetch("/api/catalog/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: cartLines.map((line) => ({
          skuId: line.skuId,
          quantity: line.quantity,
          lastSeenPriceVersion: line.lastSeenPriceVersion,
          lastSeenUnitPriceTwd: line.lastSeenUnitPriceTwd,
        })),
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("QUOTE_REJECTED");
        const body = (await response.json()) as {
          readonly totals?: ServerQuote;
          readonly lines?: ServerQuote["lines"];
          readonly quoteDigest?: string;
        };
        if (
          !body.totals ||
          !body.quoteDigest ||
          !/^[a-f0-9]{64}$/.test(body.quoteDigest) ||
          !Number.isSafeInteger(body.totals.grossTwd) ||
          !Number.isSafeInteger(body.totals.merchandiseGrossTwd)
        ) {
          throw new Error("QUOTE_INVALID");
        }
        setQuoteState({
          status: "ready",
          quote: {
            ...body.totals,
            quoteDigest: body.quoteDigest,
            lines: body.lines ?? [],
          },
        });
        setPriceAcknowledged(!(body.lines ?? []).some((line) => line.priceChanged));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setQuoteState({
          status: "error",
          message: "無法取得伺服器價格確認；為保護金額完整性，本次流程已停止。",
        });
      });
    return () => controller.abort();
  }, [cartLines, hydrated]);

  useEffect(() => {
    if (quoteState.status !== "ready" || typeof window === "undefined") return;
    const cartRevision = createCartRevision(cartLines);
    orderCommandRef.current = readCheckoutCommand(
      window.sessionStorage,
      cartRevision,
      quoteState.quote.quoteDigest,
    );
  }, [cartLines, quoteState]);

  const focusErrors = () => {
    window.requestAnimationFrame(() => errorSummaryRef.current?.focus());
  };

  const submitDetails = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validatePreviewDetails(checkout.details);
    setDetailErrors(errors);
    if (Object.keys(errors).length > 0 || !checkout.goToPayment()) {
      focusErrors();
      return;
    }
    setDetailErrors({});
  };

  const submitPaymentDemo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (quoteState.status !== "ready") {
      setPaymentError("尚未完成伺服器價格確認，請稍候或重新載入頁面。");
      focusErrors();
      return;
    }
    if (checkout.paymentChoice === null || !checkout.goToReview()) {
      setPaymentError("請選擇一個正式版規劃中的付款方式，僅作畫面示意。");
      focusErrors();
      return;
    }
    setPaymentError("");
  };

  const finishPrototype = async () => {
    if (
      submitLockRef.current ||
      cartLines.length === 0 ||
      quoteState.status !== "ready"
    ) {
      return;
    }
    const quote = quoteState.quote;
    const acknowledgementRequired = quote.lines.some((line) => line.priceChanged);
    if (acknowledgementRequired && !priceAcknowledged) {
      setOrderError("請先勾選「我已確認目前價格」，再完成模擬結帳。");
      focusErrors();
      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    setOrderError("");

    try {
      const cartRevision = createCartRevision(cartLines);
      let command = orderCommandRef.current;
      if (
        !command ||
        command.cartRevision !== cartRevision ||
        command.quoteDigest !== quote.quoteDigest
      ) {
        command =
          readCheckoutCommand(
            window.sessionStorage,
            cartRevision,
            quote.quoteDigest,
          ) ??
          Object.freeze({
            cartRevision,
            quoteDigest: quote.quoteDigest,
            idempotencyKey: `demo-ui:${crypto.randomUUID()}`,
          });
        writeCheckoutCommand(window.sessionStorage, command);
        orderCommandRef.current = command;
      }
      const response = await fetch("/api/checkout/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: command.idempotencyKey,
          confirmationToken: "demo-confirmation-token-00000000000000000000",
          emailVerificationToken: "demo-email-token-000000",
          cart: {
            lines: quote.lines.map((line) => ({
              skuId: line.skuId,
              quantity: line.quantity,
              lastSeenPriceVersion: line.priceVersion,
              lastSeenUnitPriceTwd: line.unitGrossTwd,
              acceptedQuoteDigest: quote.quoteDigest,
            })),
          },
        }),
      });
      const body = (await response.json()) as {
        readonly order?: { readonly publicId?: string };
        readonly error?: {
          readonly code?: string;
          readonly details?: {
            readonly quote?: {
              readonly quoteDigest?: string;
              readonly lines: ServerQuote["lines"];
              readonly totals?: Omit<ServerQuote, "quoteDigest" | "lines">;
            };
          };
        };
      };
      if (!response.ok || !body.order?.publicId) {
        const currentQuote = body.error?.details?.quote;
        if (
          response.status === 409 &&
          body.error?.code === "PRICE_CHANGED" &&
          currentQuote?.totals &&
          currentQuote.quoteDigest
        ) {
          setQuoteState({
            status: "ready",
            quote: {
              ...currentQuote.totals,
              quoteDigest: currentQuote.quoteDigest,
              lines: currentQuote.lines,
            },
          });
          setPriceAcknowledged(false);
          setOrderError("價格已更新；請重新檢視摘要並確認目前價格。");
          submitLockRef.current = false;
          setSubmitting(false);
          focusErrors();
          return;
        }
        throw new Error("ORDER_REJECTED");
      }

      const accepted = checkout.markCompleted({
        demoOrderPublicId: body.order.publicId,
        itemCount: cartItemCount,
        subtotalTwd: quote.merchandiseGrossTwd,
        shippingTwd: quote.shipping.grossTwd,
        totalTwd: quote.grossTwd,
      });
      if (!accepted) throw new Error("CHECKOUT_STATE_REJECTED");

      clearCheckoutCommand(window.sessionStorage);
      orderCommandRef.current = undefined;
      clearCart();
      router.replace("/checkout/complete");
    } catch {
      submitLockRef.current = false;
      setSubmitting(false);
      setOrderError(
        "Sandbox 訂單命令未完成。購物袋仍保留，且沒有啟動付款或建立正式訂單。",
      );
      focusErrors();
    }
  };

  if (!hydrated) {
    return (
      <section className={styles.loadingPage} aria-busy="true" aria-live="polite">
        <span className="eyebrow">Private checkout preview</span>
        <h1>模擬結帳</h1>
        <p>正在確認這個瀏覽器中的概念購物袋…</p>
      </section>
    );
  }

  if (cartLines.length === 0 && !submitting) {
    return (
      <section className={styles.emptyPage}>
        <span className="eyebrow">No checkout in progress</span>
        <h1>目前沒有可結帳的商品</h1>
        <p>結帳原型不會建立空白訂單。請先回到商品頁選擇完整規格。</p>
        <Link className={styles.primaryLink} href="/shop">返回商店</Link>
      </section>
    );
  }

  const detailErrorCount = Object.keys(detailErrors).length;

  return (
    <div className={styles.checkoutPage}>
      <header className={styles.checkoutHeader}>
        <span className="eyebrow">Private checkout preview</span>
        <h1>模擬結帳</h1>
        <p>欄位只存在目前頁面；同一分頁僅保存不含個資的重試識別，以避免重複建立 Sandbox 紀錄。</p>
      </header>

      <div className={styles.checkoutWarning} role="note">
        <strong>請勿輸入真實個資</strong>
        <p>
          欄位已預填明確的 Sandbox <code>.invalid</code> 範例。本模式不送出、不保存、不分析任何欄位值。
        </p>
      </div>

      <ol className={styles.checkoutSteps} aria-label="結帳進度">
        <li aria-current={checkout.step === "details" ? "step" : undefined}>
          <span>01</span>配送示意
        </li>
        <li aria-current={checkout.step === "payment-demo" ? "step" : undefined}>
          <span>02</span>付款規劃
        </li>
        <li aria-current={checkout.step === "review" ? "step" : undefined}>
          <span>03</span>確認預覽
        </li>
      </ol>

      <div className={styles.checkoutLayout}>
        <section className={styles.checkoutStage}>
          {checkout.step === "details" ? (
            <form autoComplete="off" noValidate onSubmit={submitDetails}>
              <span className={styles.stepKicker}>Step 01</span>
              <h2 ref={stepHeadingRef} tabIndex={-1}>配送資料示意</h2>
              <p className={styles.stepIntro}>只能使用 Sandbox 資料；正式處理須完成環境與法務啟用條件。</p>

              {detailErrorCount > 0 ? (
                <div
                  className={styles.formErrorSummary}
                  ref={errorSummaryRef}
                  role="alert"
                  tabIndex={-1}
                >
                  <strong>請修正 {detailErrorCount} 個預覽欄位</strong>
                  <ul>
                    {Object.entries(detailErrors).map(([field, message]) => (
                      <li key={field}><a href={`#checkout-${field}`}>{message}</a></li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className={styles.checkoutFields}>
                <label className={styles.checkoutField}>
                  <span>Sandbox 收件稱呼</span>
                  <input
                    id="checkout-recipient"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={checkout.details.recipient}
                    aria-invalid={Boolean(detailErrors.recipient)}
                    aria-describedby={detailErrors.recipient ? "checkout-recipient-error" : undefined}
                    onChange={(event) => checkout.updateDetail("recipient", event.target.value)}
                  />
                  {detailErrors.recipient ? <small id="checkout-recipient-error">{detailErrors.recipient}</small> : null}
                </label>
                <label className={styles.checkoutField}>
                  <span>Sandbox 聯絡信箱</span>
                  <input
                    id="checkout-email"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    spellCheck={false}
                    value={checkout.details.email}
                    aria-invalid={Boolean(detailErrors.email)}
                    aria-describedby={detailErrors.email ? "checkout-email-error" : undefined}
                    onChange={(event) => checkout.updateDetail("email", event.target.value)}
                  />
                  {detailErrors.email ? <small id="checkout-email-error">{detailErrors.email}</small> : null}
                </label>
                <label className={styles.checkoutField}>
                  <span>Sandbox 郵遞區號</span>
                  <input
                    id="checkout-postalCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={checkout.details.postalCode}
                    aria-invalid={Boolean(detailErrors.postalCode)}
                    aria-describedby={detailErrors.postalCode ? "checkout-postalCode-error" : undefined}
                    onChange={(event) => checkout.updateDetail("postalCode", event.target.value)}
                  />
                  {detailErrors.postalCode ? <small id="checkout-postalCode-error">{detailErrors.postalCode}</small> : null}
                </label>
                <label className={styles.checkoutField}>
                  <span>配送區域（示意）</span>
                  <select
                    id="checkout-region"
                    autoComplete="off"
                    value={checkout.details.region}
                    aria-invalid={Boolean(detailErrors.region)}
                    aria-describedby={detailErrors.region ? "checkout-region-error" : undefined}
                    onChange={(event) => checkout.updateDetail("region", event.target.value)}
                  >
                    <option value="preview-main-island">台灣本島・預覽</option>
                  </select>
                  {detailErrors.region ? <small id="checkout-region-error">{detailErrors.region}</small> : null}
                </label>
                <label className={`${styles.checkoutField} ${styles.fullField}`}>
                  <span>Sandbox 配送地址</span>
                  <input
                    id="checkout-address"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={checkout.details.address}
                    aria-invalid={Boolean(detailErrors.address)}
                    aria-describedby={detailErrors.address ? "checkout-address-error" : undefined}
                    onChange={(event) => checkout.updateDetail("address", event.target.value)}
                  />
                  {detailErrors.address ? <small id="checkout-address-error">{detailErrors.address}</small> : null}
                </label>
              </div>

              <div className={styles.stageActions}>
                <Link className={styles.secondaryLink} href="/cart">返回購物袋</Link>
                <button className={styles.primaryButton} type="submit">繼續付款規劃</button>
              </div>
            </form>
          ) : null}

          {checkout.step === "payment-demo" ? (
            <form noValidate onSubmit={submitPaymentDemo}>
              <span className={styles.stepKicker}>Step 02</span>
              <h2 ref={stepHeadingRef} tabIndex={-1}>付款方式規劃</h2>
              <p className={styles.stepIntro}>
                僅呈現未來可能支援的方式；本頁沒有卡號欄位，也不載入任何支付服務或 Apple Payment API。
              </p>

              {paymentError ? (
                <div
                  className={styles.formErrorSummary}
                  ref={errorSummaryRef}
                  role="alert"
                  tabIndex={-1}
                >
                  <strong>請完成付款方式示意</strong>
                  <p><a href="#payment-demo-options">{paymentError}</a></p>
                </div>
              ) : null}

              <fieldset className={styles.paymentChoices} id="payment-demo-options">
                <legend>正式版規劃</legend>
                {(Object.entries(paymentLabels) as [PaymentDemoChoice, string][]).map(
                  ([value, label]) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="payment-demo"
                        value={value}
                        checked={checkout.paymentChoice === value}
                        onChange={() => checkout.choosePayment(value)}
                      />
                      <span>
                        <strong>{label}</strong>
                        <small>僅為靜態介面示意，不會要求或傳送付款資料。</small>
                      </span>
                    </label>
                  ),
                )}
              </fieldset>

              <div className={styles.stageActions}>
                <button className={styles.secondaryButton} type="button" onClick={checkout.goToDetails}>
                  返回配送示意
                </button>
                <button className={styles.primaryButton} type="submit">檢視概念摘要</button>
              </div>
            </form>
          ) : null}

          {checkout.step === "review" ? (
            <div>
              <span className={styles.stepKicker}>Step 03</span>
              <h2 ref={stepHeadingRef} tabIndex={-1}>確認概念摘要</h2>
              <p className={styles.stepIntro}>完成後會以伺服器命令建立可重播的 Sandbox 訂單紀錄；不會啟動付款或產生正式訂單。</p>

              {orderError ? (
                <div
                  className={styles.formErrorSummary}
                  ref={errorSummaryRef}
                  role="alert"
                  tabIndex={-1}
                >
                  <strong>Sandbox 訂單未建立</strong>
                  <p>{orderError}</p>
                </div>
              ) : null}

              <div className={styles.reviewBlocks}>
                <section>
                  <h3>Sandbox 配送資料</h3>
                  <p>{checkout.details.recipient}</p>
                  <p>{checkout.details.email}</p>
                  <p>{checkout.details.postalCode} · {checkout.details.address}</p>
                  <button type="button" onClick={checkout.goToDetails}>修改示意資料</button>
                </section>
                <section>
                  <h3>付款方式規劃</h3>
                  <p>{checkout.paymentChoice ? paymentLabels[checkout.paymentChoice] : "尚未選擇"}</p>
                  <p>不會要求卡號或啟動支付。</p>
                  <button type="button" onClick={() => checkout.goToPayment()}>修改付款規劃</button>
                </section>
              </div>

              <div className={styles.finalConsent}>
                <strong>這不是購買按鈕</strong>
                <p>按下後只完成 Sandbox 體驗，所有聯絡與地址測試資料將隨流程離開而清除。</p>
              </div>

              {quoteState.status === "ready" &&
              quoteState.quote.lines.some((line) => line.priceChanged) ? (
                <label className={styles.finalConsent}>
                  <input
                    type="checkbox"
                    checked={priceAcknowledged}
                    onChange={(event) => setPriceAcknowledged(event.target.checked)}
                  />
                  <strong>我已確認目前價格</strong>
                  <span>摘要與送出資料均採用目前伺服器價格。</span>
                </label>
              ) : null}

              <div className={styles.stageActions}>
                <button className={styles.secondaryButton} type="button" onClick={() => checkout.goToPayment()}>
                  返回付款規劃
                </button>
                <button
                  className={styles.primaryButton}
                  type="button"
                  disabled={
                    submitting ||
                    (quoteState.status === "ready" &&
                      quoteState.quote.lines.some((line) => line.priceChanged) &&
                      !priceAcknowledged)
                  }
                  onClick={() => void finishPrototype()}
                >
                  {submitting ? "正在完成預覽…" : "完成模擬結帳"}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <aside className={styles.checkoutSummary} aria-labelledby="checkout-summary-title">
          <span className={styles.summaryKicker}>Your selection</span>
          <h2 id="checkout-summary-title">{cartItemCount} 件概念商品</h2>
          <ul>
            {cartLines.map((line) => (
              <li key={line.skuId}>
                <div>
                  <strong>{line.name} × {line.quantity}</strong>
                  <span>{line.options.map((option) => option.valueLabel).join(" · ")}</span>
                  {quoteState.status === "ready" ? (
                    <small>
                      每件{" "}
                      {formatTwd(
                        quoteState.quote.lines.find(
                          (quotedLine) => quotedLine.skuId === line.skuId,
                        )?.unitGrossTwd ?? line.unitPriceTwd,
                      )}
                    </small>
                  ) : null}
                </div>
                <span>
                  {formatTwd(
                    quoteState.status === "ready"
                      ? quoteState.quote.lines.find(
                          (quotedLine) => quotedLine.skuId === line.skuId,
                        )?.lineGrossTwd ?? line.lineTotalTwd
                      : line.lineTotalTwd,
                  )}
                </span>
              </li>
            ))}
          </ul>
          <dl className={styles.orderTotals}>
            <div><dt>商品小計</dt><dd>{formatTwd(quoteState.status === "ready" ? quoteState.quote.merchandiseGrossTwd : subtotalTwd)}</dd></div>
            <div><dt>配送</dt><dd>{(quoteState.status === "ready" ? quoteState.quote.shipping.grossTwd : shippingTwd) === 0 ? "免運" : formatTwd(quoteState.status === "ready" ? quoteState.quote.shipping.grossTwd : shippingTwd)}</dd></div>
            <div><dt>概念合計</dt><dd>{formatTwd(quoteState.status === "ready" ? quoteState.quote.grossTwd : totalTwd)}</dd></div>
          </dl>
          {quoteState.status === "loading" ? <p role="status">正在向伺服器確認價格…</p> : null}
          {quoteState.status === "error" ? <p role="alert">{quoteState.message}</p> : null}
          {quoteState.status === "ready" ? <p role="status">伺服器價格已確認。</p> : null}
          {quoteState.status === "ready" && quoteState.quote.lines.some((line) => line.priceChanged) ? (
            <p role="status">價格版本已有更新，摘要已採用目前伺服器價格。</p>
          ) : null}
          <p className={styles.prototypeNotice}>V1 僅提供台灣本島配送示意。</p>
        </aside>
      </div>
    </div>
  );
}
