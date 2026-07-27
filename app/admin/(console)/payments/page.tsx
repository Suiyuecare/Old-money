import { AdminOperationsPage } from "@/components/admin/AdminOperationsPage";

export const metadata = { title: "付款事件" };

export default function AdminPaymentsPage() {
  return (
    <AdminOperationsPage
      area="payments"
      description="查看綠界 callback 持久化事件，並對未知付款執行 QueryTradeInfo。"
      eyebrow="Payments"
      queue={{
        kind: "provider_events",
        title: "付款 Provider Events",
        description: "事件先驗簽、去重並持久化；重播事件會清楚標示。",
        roles: ["owner", "support"],
      }}
      roles={["owner", "support"]}
      title="付款事件"
    />
  );
}
