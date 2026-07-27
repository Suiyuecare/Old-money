import { AdminOperationsPage } from "@/components/admin/AdminOperationsPage";

export const metadata = { title: "電子發票" };

export default function AdminInvoicesPage() {
  return (
    <AdminOperationsPage
      area="invoices"
      description="建立 B2C 電子發票，並由 Owner 處理需最近 AAL2 的作廢與折讓。"
      eyebrow="Invoices"
      queue={{
        kind: "provider_operations",
        title: "發票 Provider 操作",
        description: "顯示發票遠端操作、租約、重試與未知結果；只有 Owner 可讀完整佇列。",
        roles: ["owner"],
      }}
      roles={["owner", "support"]}
      title="電子發票"
    />
  );
}
