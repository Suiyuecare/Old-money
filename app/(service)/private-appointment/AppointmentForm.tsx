"use client";

import { useState, type FormEvent } from "react";
import { privateAppointment } from "@/lib/editorial";
import styles from "@/app/editorial-pages.module.css";

const demoDefaults = {
  name: "Estate Guest — Demo",
  email: "guest@estate.invalid",
  service: "wardrobe",
  format: "video-demo",
  notes: "這是一段展示訊息，不含真實姓名、聯絡方式或預約需求。",
};

export function AppointmentForm() {
  const [form, setForm] = useState(demoDefaults);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acknowledged) return;
    setSubmitted(true);
  }

  function resetDemo() {
    setForm(demoDefaults);
    setAcknowledged(false);
    setSubmitted(false);
  }

  if (submitted) {
    return (
      <div className={styles.successPanel} role="status" aria-live="polite">
        <span className="eyebrow">Local demonstration only</span>
        <h3>{privateAppointment.form.successTitle}</h3>
        <p>{privateAppointment.form.successMessage}</p>
        <button className="button-secondary" type="button" onClick={resetDemo}>
          重新體驗表單
        </button>
      </div>
    );
  }

  return (
    <form
      className={styles.appointmentForm}
      onSubmit={handleSubmit}
      autoComplete="off"
      aria-describedby="appointment-privacy-notice"
    >
      <p className={styles.formNotice} id="appointment-privacy-notice">
        <strong>請勿輸入真實個資。</strong><br />
        {privateAppointment.form.privacyNotice}
      </p>

      <div className={styles.formRow}>
        <div className="field">
          <label htmlFor="appointment-name">示範稱呼</label>
          <input
            id="appointment-name"
            name="name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            autoComplete="off"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="appointment-email">示範信箱</label>
          <input
            id="appointment-email"
            name="email"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            autoComplete="off"
            inputMode="email"
            required
          />
        </div>
      </div>

      <div className={styles.formRow}>
        <div className="field">
          <label htmlFor="appointment-service">想體驗的服務</label>
          <select
            id="appointment-service"
            name="service"
            value={form.service}
            onChange={(event) => setForm({ ...form, service: event.target.value })}
          >
            <option value="wardrobe">Wardrobe Edit · 衣櫥選品</option>
            <option value="gift">The Considered Gift · 贈禮諮詢</option>
            <option value="rooms">Rooms & Rituals · 居家片刻</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="appointment-format">展示方式</label>
          <select
            id="appointment-format"
            name="format"
            value={form.format}
            onChange={(event) => setForm({ ...form, format: event.target.value })}
          >
            <option value="video-demo">線上對話示意</option>
            <option value="message-demo">書面建議示意</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="appointment-notes">展示需求</label>
        <textarea
          id="appointment-notes"
          name="notes"
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          autoComplete="off"
          required
        />
      </div>

      <label className={styles.consent}>
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          required
        />
        <span>我了解這是無法建立真實時段的本地展示，並且沒有輸入真實個人資料。</span>
      </label>

      <button className="button" type="submit">
        {privateAppointment.form.submitLabel}
      </button>
    </form>
  );
}
