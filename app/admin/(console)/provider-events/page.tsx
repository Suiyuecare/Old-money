import { AdminQueuePage } from "@/components/admin/AdminOperationsPage";

export const metadata = { title: "Provider Events" };

export default function AdminProviderEventsPage() {
  return (
    <AdminQueuePage
      description="查看付款、發票、物流與 Email webhook 的已驗證、已去重事件。"
      eyebrow="Provider Inbox"
      queueDescription="原始敏感欄位不在 UI 顯示；此處只讀持久化後的 redacted event metadata。"
      queueKind="provider_events"
      queueTitle="Provider Event Inbox"
      roles={["owner", "support"]}
      title="Provider Events"
    />
  );
}
