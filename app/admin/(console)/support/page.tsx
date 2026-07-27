import { AdminOperationsPage } from "@/components/admin/AdminOperationsPage";

export const metadata = { title: "客服案件" };

export default function AdminSupportPage() {
  return (
    <AdminOperationsPage
      area="support"
      description="建立、追加與結束訂單客服案件；取消與退款使用各自的 durable command。"
      eyebrow="Client Services"
      queue={{
        kind: "support",
        title: "待處理客服佇列",
        description: "只顯示仍開啟的案件投影，不揭露公開流程不需要的個資。",
        roles: ["owner", "support"],
      }}
      roles={["owner", "support"]}
      title="客服案件"
    />
  );
}
