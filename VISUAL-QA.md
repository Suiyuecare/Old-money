# LIGNÉE Visual QA

驗證日期：2026-07-24（Asia/Taipei）

最終狀態：**Automated visual route sweep approved — 261/261 passed**

## Current matrix

`lib/route-manifest.ts` 是 route-state 清單的單一來源。本次共有 87 個
`visualQa` cases，在下列三個 CSS viewports 各執行一次：

| Viewport | Route-state cases | Result |
|---|---:|---:|
| 390×844 | 87 | 87 passed |
| 768×1024 | 87 | 87 passed |
| 1440×900 | 87 | 87 passed |
| **Total** | **261** | **261 passed** |

87 cases 包含 26 個 storefront／service／guarded routes、完整 50 個商品
routes、5 個 collection routes、5 個 Journal routes，以及 1 個宣告式 404
case。沒有排除任何商品 route。

## Harness and evidence

- `pnpm test:visual` 使用 `playwright.visual.config.ts` 與
  `tests/visual/visual-qa.spec.ts`，單 worker 執行。
- Global setup 只會解析並刪除 exact
  `artifacts/visual-qa`，隨後重建該 git-ignored 目錄；舊截圖不會混入本次結果。
- 每一格斷言 manifest HTTP status、`lang="zh-Hant"`、一個可見 `h1`、
  prototype banner 可見且未被遮擋、無預設開啟 dialog、document/body 無水平
  overflow、所有同源圖片完成且 `naturalWidth > 0`，以及無未預期
  console/page/document/script/stylesheet/image/font errors。
- 截圖前逐頁滾動以觸發 lazy images，等待字型與圖片完成，回到頁首後才擷取
  full-page PNG。PNG header 另驗證寬度等於 viewport，且高度至少等於 viewport。
- Capture-only 階段將 computed sticky 元素改為 `static`，保留 normal flow，
  避免 Chromium full-page stitching 重複或錯置 sticky 元素；正常捲動時，
  E2E 另驗證 header 固定於 viewport top、尺寸不變且未被遮擋。
- 768×1024 evidence 及獨立 geometry assertion 均確認首頁與 Journal 的五卡
  layout 為三卡加兩卡的平衡列，不會留下半寬第五張孤卡。

最終 current-run PNG 位於
`artifacts/visual-qa/{390x844,768x1024,1440x900}/`，每個 viewport
各 87 張，共 261 張。本文件不把自動 route sweep 描述成逐張人工美術核准；
商品與 lifestyle 的語意人工檢查另以 ignored asset contact sheets 完成。
這兩張 review sheets 與 25 張 ignored native source sheets 已由
`content/asset-review-record.json` 鎖定 inventory／檔案 SHA-256 與尺寸；
目前 contact-sheet digests 為：

- product-main：`4faf5d5d585d1174e90b09bbf9a29a762c4f5615874405f450d8de6e1a97b87d`
- lifestyle：`7d845dcd3fbfdd3cef1e502c6f198252bd727fbf0003b5ea0d8cc4773fd26c79`

## Scope

此矩陣是本機 Chromium responsive/structural evidence，不等同 production
Lighthouse、Safari／Firefox、真實裝置或最終攝影核准。Commerce routes 保持
Sandbox／guarded state；live checkout、provider、indexing 與 canary 仍由外部
launch gates 禁用。
