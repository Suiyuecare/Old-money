import { AdminQueuePage } from "@/components/admin/AdminOperationsPage";

export const metadata = { title: "每日對帳" };

export default function AdminReconciliationPage() {
  return (
    <AdminQueuePage
      description="比對訂單、付款、退款、發票與物流 Provider 的最終狀態。"
      eyebrow="Reconciliation"
      queueDescription="只執行安全查詢或人工判讀；timeout 不會觸發可能重複的遠端副作用。"
      queueKind="reconciliation"
      queueTitle="待對帳項目"
      roles={["owner"]}
      title="每日對帳"
    />
  );
}
