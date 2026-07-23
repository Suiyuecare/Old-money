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
  useCheckoutSession,
  validatePreviewDetails,
  type PaymentDemoChoice,
  type PreviewCheckoutErrors,
} from "./CheckoutSessionProvider";

const paymentLabels: Readonly<Record<PaymentDemoChoice, string>> = {
  "card-planned": "信用卡（正式版規劃）",
  "apple-pay-planned": "Apple Pay（正式版規劃）",
};

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
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const submitLockRef = useRef(false);

  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [checkout.step]);

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
    if (checkout.paymentChoice === null || !checkout.goToReview()) {
      setPaymentError("請選擇一個正式版規劃中的付款方式，僅作畫面示意。");
      focusErrors();
      return;
    }
    setPaymentError("");
  };

  const finishPrototype = () => {
    if (submitLockRef.current || cartLines.length === 0) return;
    submitLockRef.current = true;
    setSubmitting(true);

    const accepted = checkout.markCompleted({
      itemCount: cartItemCount,
      subtotalTwd,
      shippingTwd,
      totalTwd,
    });
    if (!accepted) {
      submitLockRef.current = false;
      setSubmitting(false);
      checkout.goToDetails();
      return;
    }

    clearCart();
    router.replace("/checkout/complete");
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
        <p>三個步驟只存在目前頁面的記憶體；重新整理後將安全重設。</p>
      </header>

      <div className={styles.checkoutWarning} role="note">
        <strong>請勿輸入真實個資</strong>
        <p>
          欄位已預填明顯虛構的 <code>.invalid</code> 範例。本原型不送出、不保存、不分析任何欄位值。
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
              <p className={styles.stepIntro}>只能使用虛構資料；真實版將另行提供安全的資料處理說明。</p>

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
                  <span>虛構收件稱呼</span>
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
                  <span>虛構聯絡信箱</span>
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
                  <span>虛構郵遞區號</span>
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
                    <option value="preview-offshore">台灣離島・預覽</option>
                  </select>
                  {detailErrors.region ? <small id="checkout-region-error">{detailErrors.region}</small> : null}
                </label>
                <label className={`${styles.checkoutField} ${styles.fullField}`}>
                  <span>虛構配送地址</span>
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
              <p className={styles.stepIntro}>完成後只會清空購物袋並顯示模擬完成頁，不會產生訂單編號。</p>

              <div className={styles.reviewBlocks}>
                <section>
                  <h3>虛構配送資料</h3>
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
                <p>按下後只完成前端體驗，所有虛構聯絡與地址資料將隨流程離開而清除。</p>
              </div>

              <div className={styles.stageActions}>
                <button className={styles.secondaryButton} type="button" onClick={() => checkout.goToPayment()}>
                  返回付款規劃
                </button>
                <button
                  className={styles.primaryButton}
                  type="button"
                  disabled={submitting}
                  onClick={finishPrototype}
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
                </div>
                <span>{formatTwd(line.lineTotalTwd)}</span>
              </li>
            ))}
          </ul>
          <dl className={styles.orderTotals}>
            <div><dt>商品小計</dt><dd>{formatTwd(subtotalTwd)}</dd></div>
            <div><dt>配送</dt><dd>{shippingTwd === 0 ? "免運" : formatTwd(shippingTwd)}</dd></div>
            <div><dt>概念合計</dt><dd>{formatTwd(totalTwd)}</dd></div>
          </dl>
          <p className={styles.prototypeNotice}>台灣地區配送示意；國際配送尚未開放。</p>
        </aside>
      </div>
    </div>
  );
}
