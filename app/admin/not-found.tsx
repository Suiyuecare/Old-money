import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="admin-main">
      <div className="admin-empty">
        <span aria-hidden="true">◇</span>
        <h2>找不到這個後台項目</h2>
        <p>它可能已封存，或你的角色沒有檢視權限。</p>
        <Link className="admin-button" href="/admin">返回儀表板</Link>
      </div>
    </div>
  );
}
