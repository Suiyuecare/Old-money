import Link from "next/link";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand-mark" href="/">
      {!compact && <span className="brand-mark__monogram" aria-hidden="true">L</span>}
      <span className="brand-mark__word">LIGNÉE</span>
      <span className="sr-only">首頁</span>
    </Link>
  );
}
