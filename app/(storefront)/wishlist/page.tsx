import type { Metadata } from "next";

import { WishlistPageClient } from "./WishlistPageClient";

export const metadata: Metadata = {
  title: "收藏清單",
  description: "收藏值得稍後重訪的 LIGNÉE 概念作品。",
};

export default function WishlistPage() {
  return <WishlistPageClient />;
}
