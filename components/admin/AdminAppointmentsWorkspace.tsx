"use client";

import { useActionState } from "react";

import { transitionAppointmentAction } from "@/lib/admin/engagement-actions";
import type {
  AdminAppointmentProjection,
  AdminAppointmentState,
  AdminEngagementPage,
} from "@/lib/admin/engagement";
import type { AdminActionState } from "@/lib/admin/types";

import { ActionFeedback } from "./AdminActionFeedback";
import {
  AdminEmpty,
  AdminStatus,
  formatAdminDate,
} from "./AdminUi";
import { useAdminIdempotencyKey } from "./useAdminIdempotencyKey";

const idle: AdminActionState<AdminAppointmentProjection> = {
  status: "idle",
  message: "",
};

const stateLabels: Readonly<Record<AdminAppointmentState, string>> = {
  requested: "待確認",
  confirmed: "已確認",
  completed: "已完成",
  cancelled: "已取消",
};

const kindLabels = {
  private_showing: "私人鑑賞",
  fitting: "量身諮詢",
  store_visit: "到店時段",
} as const;

function taipeiDateTimeLocal(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value)).replace(" ", "T");
}

export function AdminAppointmentsWorkspace({
  page,
}: {
  readonly page: AdminEngagementPage<AdminAppointmentProjection>;
}) {
  if (page.items.length === 0) {
    return (
      <AdminEmpty
        description="目前沒有由私有資料層匯入的預約；公開展示表單不會傳送個資。"
        title="目前沒有預約"
      />
    );
  }

  return (
    <section className="admin-workbench" aria-labelledby="appointments-queue-heading">
      <header className="admin-workbench__header">
        <div>
          <span className="admin-eyebrow">Encrypted Intake</span>
          <h2 id="appointments-queue-heading">預約佇列</h2>
          <p>
            共 {page.total} 筆。列表只顯示狀態與密封資料是否存在，
            不會從 RPC 回傳聯絡內容或留言明文。
          </p>
        </div>
      </header>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <caption className="sr-only">
            私人預約狀態、時段與可執行操作
          </caption>
          <thead>
            <tr>
              <th scope="col">預約</th>
              <th scope="col">密封資料</th>
              <th scope="col">時段</th>
              <th scope="col">狀態</th>
              <th scope="col">安全操作</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((appointment) => (
              <tr key={appointment.id}>
                <th scope="row">
                  {appointment.reference}
                  <small>
                    {kindLabels[appointment.kind]} · v{appointment.version}
                    {" · "}
                    {formatAdminDate(appointment.createdAt)}
                  </small>
                </th>
                <td>
                  <span className="admin-sealed-data">
                    聯絡資料：{appointment.hasContact ? "已密封" : "缺少"}
                  </span>
                  <small>
                    需求留言：{appointment.hasMessage ? "已密封" : "無"}
                  </small>
                </td>
                <td>
                  {appointment.scheduledFor
                    ? (
                        <time dateTime={appointment.scheduledFor}>
                          {formatAdminDate(appointment.scheduledFor)}
                        </time>
                      )
                    : "尚未安排"}
                </td>
                <td>
                  <AdminStatus
                    label={stateLabels[appointment.state]}
                    value={appointment.state}
                  />
                </td>
                <td>
                  <AppointmentControls appointment={appointment} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AppointmentControls({
  appointment,
}: {
  readonly appointment: AdminAppointmentProjection;
}) {
  if (
    appointment.state === "completed"
    || appointment.state === "cancelled"
  ) {
    return <small>終止狀態，不再接受變更。</small>;
  }
  return (
    <div className="admin-engagement-actions">
      <AppointmentCommand
        appointment={appointment}
        label={appointment.state === "confirmed" ? "更新時段" : "確認時段"}
        requiresSchedule
        targetState="confirmed"
      />
      {appointment.state === "confirmed" ? (
        <AppointmentCommand
          appointment={appointment}
          label="標記完成"
          targetState="completed"
        />
      ) : null}
      <AppointmentCommand
        appointment={appointment}
        danger
        label="取消預約"
        targetState="cancelled"
      />
    </div>
  );
}

function AppointmentCommand({
  appointment,
  danger = false,
  label,
  requiresSchedule = false,
  targetState,
}: {
  readonly appointment: AdminAppointmentProjection;
  readonly danger?: boolean;
  readonly label: string;
  readonly requiresSchedule?: boolean;
  readonly targetState: Exclude<AdminAppointmentState, "requested">;
}) {
  const [state, action, pending] = useActionState(
    transitionAppointmentAction,
    idle,
  );
  const key = useAdminIdempotencyKey(state);
  return (
    <form
      action={action}
      aria-busy={pending}
      className="admin-inline-form"
    >
      <input name="appointmentId" type="hidden" value={appointment.id} />
      <input name="expectedVersion" type="hidden" value={appointment.version} />
      <input
        name="idempotencyKey"
        type="hidden"
        value={`${key}:${appointment.version}:${targetState}`}
      />
      <input name="targetState" type="hidden" value={targetState} />
      {requiresSchedule ? (
        <label>
          <span className="sr-only">{appointment.reference} 台北時段</span>
          <input
            aria-label={`${appointment.reference} 台北時段`}
            defaultValue={taipeiDateTimeLocal(appointment.scheduledFor)}
            name="scheduledFor"
            required
            type="datetime-local"
          />
        </label>
      ) : null}
      <button
        aria-label={`${label}：${appointment.reference}`}
        className={danger ? "admin-button admin-button--danger" : undefined}
        disabled={pending}
        type="submit"
      >
        {pending ? "處理中…" : label}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}
