import Link from "next/link";

export default function NotFoundPage() {
  return (
    <section className="empty-state">
      <div>
        <span className="eyebrow">Beyond the estate map</span>
        <h1>這條路沒有延伸到莊園</h1>
        <p className="muted">你尋找的頁面可能已移動，或仍在下一個篇章裡。</p>
        <Link className="button" href="/">
          返回莊園入口
        </Link>
      </div>
    </section>
  );
}
