import { AdminOperationsPage } from "@/components/admin/AdminOperationsPage";

export const metadata = { title: "揀貨與包裹" };

export default function AdminFulfillmentPage() {
  return (
    <AdminOperationsPage
      area="fulfillment"
      description="建立包裹、登記人工追蹤碼與取消物流；Provider 操作由 durable worker 執行。"
      eyebrow="Fulfillment"
      queue={{
        kind: "provider_operations",
        title: "Provider 操作佇列",
        description: "檢視物流、發票與退款的遠端操作狀態；只有 Owner 可讀完整佇列。",
        roles: ["owner"],
      }}
      roles={["owner", "fulfillment"]}
      title="揀貨與包裹"
    />
  );
}
