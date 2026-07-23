"use client";

import { FormEvent, useState } from "react";

export function NewsletterForm() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <p className="newsletter__success" role="status">
        示範訂閱已完成；沒有任何資料被傳送或保存。
      </p>
    );
  }

  return (
    <form className="newsletter__form" onSubmit={handleSubmit} action="" autoComplete="off">
      <label htmlFor="newsletter-email">Email（請使用示範資料）</label>
      <div>
        <input
          id="newsletter-email"
          name="email"
          type="email"
          required
          defaultValue="guest@example.invalid"
          aria-describedby="newsletter-help"
        />
        <button type="submit">訂閱來信</button>
      </div>
      <small id="newsletter-help">僅模擬成功狀態，不會寄送或儲存。</small>
    </form>
  );
}
