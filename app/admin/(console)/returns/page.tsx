import { AdminOperationsPage } from "@/components/admin/AdminOperationsPage";

export const metadata = { title: "退貨驗收" };

export default function AdminReturnsPage() {
  return (
    <AdminOperationsPage
      area="returns"
      description="Support 審核 14 日退貨申請，Fulfillment 記錄到貨與驗收；不提供直接換貨。"
      eyebrow="Returns"
      roles={["owner", "fulfillment", "support"]}
      title="退貨驗收"
    />
  );
}
