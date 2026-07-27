import { AdminQueuePage } from "@/components/admin/AdminOperationsPage";

export const metadata = { title: "Dead Letters" };

export default function AdminDeadLettersPage() {
  return (
    <AdminQueuePage
      description="隔離超過重試預算或需人工證據的操作；不從畫面直接盲目重送。"
      eyebrow="Recovery"
      queueDescription="每筆 dead letter 保留 aggregate、operation key、嘗試次數與最後錯誤碼。"
      queueKind="dead_letters"
      queueTitle="Dead Letter Queue"
      roles={["owner"]}
      title="Dead Letters"
    />
  );
}
