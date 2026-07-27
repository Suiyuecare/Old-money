import type { Metadata } from "next";
import { FocusedImage } from "@/components/site/FocusedImage";
import { privateAppointment } from "@/lib/editorial";
import { AppointmentForm } from "./AppointmentForm";
import styles from "@/app/editorial-pages.module.css";

export const metadata: Metadata = {
  title: "私人選品預約",
  description:
    "體驗 LIGNÉE 私人衣櫥選品、贈禮與居家物件諮詢的概念流程；展示表單不會傳送或保存資料。",
};

export default function PrivateAppointmentPage() {
  return (
    <>
      <header className={styles.appointmentHero}>
        <div className={styles.appointmentHeroCopy}>
          <span className="eyebrow">{privateAppointment.eyebrow}</span>
          <h1>{privateAppointment.title}</h1>
          <p>{privateAppointment.introduction}</p>
        </div>
        <div className={styles.storyImage}>
          <FocusedImage
            src="/images/editorial/the-conservatory-hour.webp"
            alt="莊園溫室午後，一位成熟女性在植物與自然光間安靜停留"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 54vw"
          />
        </div>
      </header>

      <section className="shell section" aria-labelledby="appointment-services">
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">A Considered Conversation</span>
            <h2 id="appointment-services">從使用情境開始</h2>
          </div>
        </div>
        <div className={styles.serviceGrid}>
          {privateAppointment.services.map((service, index) => (
            <article className={styles.serviceCard} key={service.title}>
              <span>Service 0{index + 1}</span>
              <h2>{service.title}</h2>
              <p><strong>{service.titleZh}</strong></p>
              <p>{service.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.productSection} section`} aria-labelledby="appointment-form-title">
        <div className={`${styles.appointmentPanel} shell`}>
          <div className={styles.appointmentAside}>
            <span className="eyebrow">Demonstration Appointment</span>
            <h2 id="appointment-form-title">{privateAppointment.form.title}</h2>
            <p>{privateAppointment.form.description}</p>
            <p>{privateAppointment.courtesy}</p>
            <p className={styles.notice}>{privateAppointment.availability}</p>
          </div>
          <AppointmentForm />
        </div>
      </section>
    </>
  );
}
