import { AdminOperationsPage } from "@/components/admin/AdminOperationsPage";

export const metadata = { title: "退款作業" };

export default function AdminRefundsPage() {
  return (
    <AdminOperationsPage
      area="refunds"
      description="Support 建立退款申請，Owner 以最近 AAL2 執行；未知 Provider 結果進入人工對帳。"
      eyebrow="Refunds"
      queue={{
        kind: "reconciliation",
        title: "退款對帳佇列",
        description: "列出等待 Provider 最終證據或人工判讀的遠端操作。",
        roles: ["owner"],
      }}
      roles={["owner", "support"]}
      title="退款作業"
    />
  );
}
