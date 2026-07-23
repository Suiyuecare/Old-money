# LIGNÉE Visual QA

驗證日期：2026-07-23（Asia/Taipei）

最終狀態：**Approved — Next.js 16.2.11 production 165/165 passed；sticky-neutralized contact-sheet review 165/165 approved**

## 方法

- 單一真實來源是 `lib/route-manifest.ts`；目前共有 55 個 `visualQa` route。
- `pnpm test:visual` 使用 `playwright.visual.config.ts` 與
  `tests/visual/visual-qa.spec.ts`，在 Next.js 16.2.11、含
  `pnpm-workspace.yaml` patched transitive dependencies 的最終 production build
  `http://127.0.0.1:3000` 上，以單 worker 逐頁檢查並擷取 full-page PNG。
- 三個 browser context 的 CSS viewport 精確固定為 390×844、768×1024、
  1440×900，`deviceScaleFactor: 1`；測試另讀取 PNG header，確認輸出寬度
  等於 viewport、輸出高度至少涵蓋一個 viewport。
- 每一組都斷言：manifest 宣告的 HTTP status、`lang="zh-Hant"`、恰好一個
  可見 `h1`、document/body 無水平 overflow、本機 `<img>` 全部完成且
  `naturalWidth > 0`、無未預期的 console error、page error 或同源
  document/script/stylesheet/image/font request failure、prototype banner 與 `h1`
  中心沒有被 overlay 擋住，且沒有預設開啟的 dialog。Next 主動取消的 RSC
  prefetch 屬 `fetch` lifecycle，不視為關鍵資產失敗。
- 截圖前會逐 viewport 滾動整頁以觸發 lazy image，等待 `document.fonts.ready`
  與所有圖片完成，再回到頁首。每個測試使用隔離 context，因此購物袋、收藏與
  checkout route 均為 manifest 記錄的預設／guarded empty state。
- Chromium 對 manifest 明確宣告的 404 主文件固定輸出一則 404 console
  resource 訊息；測試只在「exact 訊息、exact 404 route URL、expectedStatus=404」
  三者同時成立時排除。其他 console error 與 broken image 仍會失敗。
- Reusable harness 會在 capture 前隱藏 Next dev toolbar（final production 不存在）
  與未聚焦、原應在畫面外的 skip link，避免 browser full-page stitching 把開發
  chrome／off-canvas 元件畫入品牌畫面；隱藏前已確認 skip link 未聚焦。這不更動
  application UI 原始碼。
- 所有行為、overflow、overlay、console、network 與 image assertions 完成後，
  capture-only 階段會把頁面上 computed `position: sticky` 的元素改成 `static`。
  元素仍留在 normal flow、沒有被隱藏；此處只防止 Chromium full-page stitching
  把 header、filter、summary 或 narrative aside 移到錯誤的頁面片段。正常 viewport
  的 sticky 行為仍由 assertions 與獨立互動測試驗證。
- PNG 保留於已 git-ignore 的 `artifacts/visual-qa/<viewport>/`。另以全頁縮圖及
  top/middle/bottom slices 製作 9 張 contact sheets，並以影像檢視工具逐張實際
  檢查；本文件不以自動測試冒充人工視覺審查。

## 最終結果

- Automated production sweep：**165 passed、0 failed**，單 worker 執行時間
  3.8 分鐘。
- Screenshot inventory：390×844、768×1024、1440×900 各 55 張，共 165 張；
  PNG header 複驗為 0 張尺寸異常。
- Full-page height 範圍分別為 2,070–17,827 px、2,133–10,162 px、
  1,510–8,857 px；三組 PNG 大小合計約 202.9 MiB。
- Contact sheets：每個 viewport 依 19／18／18 routes 分成 3 組，共 9 張；每個
  route tile 同時呈現全頁縮圖與 top/middle/bottom viewport slices。9 張均已用
  `view_image` 以 original detail 檢視。
- 人工檢查未發現截字、圖片焦點錯置、生成圖破損、錯誤字型 fallback、視覺層級或
  間距失衡、sticky／overlay 遮擋、預設 dialog、異常空白或錯誤 empty state。
  另以原始 full-page PNG 回看 desktop home、shop、collection 與 story：site header
  均只出現在 prototype banner 下方頁首，其他 sticky 元素也保留在各自 normal-flow
  位置，沒有在中段重複或位移。商品、collection、journal、靜態頁與 guarded
  empty states 在三個 viewport 均 **Approved**。
- Accessibility-related structural checks（`lang`、單一 visible `h1`、banner 可見、
  無預設 dialog）165/165 通過；完整 axe WCAG 掃描屬獨立 Playwright E2E suite，
  不以本 visual matrix 取代。

## Route / viewport matrix

每一格同時通過 automated assertions 與 sticky-neutralized contact-sheet inspection，
均標為 `Approved`。

| Route | HTTP | 390×844 | 768×1024 | 1440×900 |
|---|---:|---|---|---|
| `/` | 200 | Approved | Approved | Approved |
| `/shop` | 200 | Approved | Approved | Approved |
| `/men` | 200 | Approved | Approved | Approved |
| `/women` | 200 | Approved | Approved | Approved |
| `/accessories` | 200 | Approved | Approved | Approved |
| `/home` | 200 | Approved | Approved | Approved |
| `/stationery` | 200 | Approved | Approved | Approved |
| `/search` | 200 | Approved | Approved | Approved |
| `/collections` | 200 | Approved | Approved | Approved |
| `/journal` | 200 | Approved | Approved | Approved |
| `/wishlist` | 200 | Approved | Approved | Approved |
| `/cart` | 200 | Approved | Approved | Approved |
| `/checkout` | 200 | Approved | Approved | Approved |
| `/checkout/complete` | 200 | Approved | Approved | Approved |
| `/story` | 200 | Approved | Approved | Approved |
| `/private-appointment` | 200 | Approved | Approved | Approved |
| `/shipping-returns` | 200 | Approved | Approved | Approved |
| `/privacy` | 200 | Approved | Approved | Approved |
| `/terms` | 200 | Approved | Approved | Approved |
| `/product/field-house-polo` | 200 | Approved | Approved | Approved |
| `/product/alder-oxford-shirt` | 200 | Approved | Approved | Approved |
| `/product/conservatory-knit` | 200 | Approved | Approved | Approved |
| `/product/bracken-riding-blazer` | 200 | Approved | Approved | Approved |
| `/product/long-lawn-trousers` | 200 | Approved | Approved | Approved |
| `/product/keeper-bermuda-shorts` | 200 | Approved | Approved | Approved |
| `/product/walled-garden-dress` | 200 | Approved | Approved | Approved |
| `/product/bridle-line-belt` | 200 | Approved | Approved | Approved |
| `/product/rain-ledger-watch` | 200 | Approved | Approved | Approved |
| `/product/glasshouse-tote` | 200 | Approved | Approved | Approved |
| `/product/estate-dispatch-briefcase` | 200 | Approved | Approved | Approved |
| `/product/south-lawn-sunglasses` | 200 | Approved | Approved | Approved |
| `/product/long-table-tie` | 200 | Approved | Approved | Approved |
| `/product/evening-sheer-tights` | 200 | Approved | Approved | Approved |
| `/product/dewdrop-earrings` | 200 | Approved | Approved | Approved |
| `/product/hearth-number-four-candle` | 200 | Approved | Approved | Approved |
| `/product/wet-cedar-diffuser` | 200 | Approved | Approved | Approved |
| `/product/guest-wing-bed-linen` | 200 | Approved | Approved | Approved |
| `/product/stable-door-throw` | 200 | Approved | Approved | Approved |
| `/product/breakfast-room-mug` | 200 | Approved | Approved | Approved |
| `/product/long-table-glasses` | 200 | Approved | Approved | Approved |
| `/product/library-service-tray` | 200 | Approved | Approved | Approved |
| `/product/conservatory-stem-vase` | 200 | Approved | Approved | Approved |
| `/product/estate-ledger-notebook` | 200 | Approved | Approved | Approved |
| `/product/correspondence-pen` | 200 | Approved | Approved | Approved |
| `/product/valet-desk-tray` | 200 | Approved | Approved | Approved |
| `/product/estate-almanac` | 200 | Approved | Approved | Approved |
| `/collections/first-light-in-the-field` | 200 | Approved | Approved | Approved |
| `/collections/the-conservatory-hour` | 200 | Approved | Approved | Approved |
| `/collections/after-rain-the-library` | 200 | Approved | Approved | Approved |
| `/collections/dinner-at-the-long-table` | 200 | Approved | Approved | Approved |
| `/journal/before-the-house-wakes` | 200 | Approved | Approved | Approved |
| `/journal/the-quiet-geometry-of-a-conservatory` | 200 | Approved | Approved | Approved |
| `/journal/notes-kept-after-rain` | 200 | Approved | Approved | Approved |
| `/journal/a-table-made-for-time` | 200 | Approved | Approved | Approved |
| `/__lignee-route-not-found__` | 404 | Approved | Approved | Approved |

## Diagnostic findings and re-shoot record

- Freeze 前 diagnostic sweep：160/165 passed。`/product/correspondence-pen`
  在 390×844 發現 9 px 真實水平 overflow（399 vs 390），已由 mobile PDP
  heading wrapping 修正，targeted 3-viewport rerun 通過。
- Diagnostic 期間 `/collections` 曾因同步 hot edit 產生一次 Next router
  initialization error；穩定後 targeted 3-viewport rerun 通過，final production
  完整重跑也通過。
- 404 的三次 diagnostic failure 是上述 Chromium 主文件 404 訊息；加入精確
  限定的例外後，targeted 3-viewport rerun 通過。
- Freeze 後第一次 production sweep 因 harness 把 Next 正常取消的 RSC link
  prefetch（`fetch`、`net::ERR_ABORTED`）誤判為 critical request failure 而中止；
  這不是 application anomaly。斷言收斂為真正影響畫面的
  document/script/stylesheet/image/font 後，從頭重拍並得到 165/165 passed。
- 之後人工回看舊版 `1440x900/home.png`，發現 Chromium full-page stitching 把
  sticky site header 畫到首頁商品 grid 中段；正常 1440×900 viewport 的 header
  位置正確，因此這是 capture artifact，而不是 application UI issue。當時的
  165-cell approval 已完整撤回。
- Harness 改為 assertions 後才將所有 sticky 元素 capture-only 設為 `static`；
  targeted home 三 viewport 重拍均確認 header 只在頁首。最終 Next.js 16.2.11
  build 再從空白 artifacts 目錄重跑 165/165 passed，重建 9 張 sheets 並逐張重審。
- 所有現存 final PNG 都來自這次 exact build；沒有沿用任何 diagnostic 或舊版
  approval。

## 限制

- 此 route matrix 是本機 Chromium 視覺驗收，不等同 production Lighthouse、
  真實裝置、Safari／Firefox 或作業系統字型的完整相容性證明。
- Guarded commerce route 在本表審查預設空狀態；完整加入商品、抽屜、結帳與完成頁
  狀態由獨立 Playwright commerce tests 驗證。
- Contact sheet 用於快速比較整體階層、裁切、間距、截字與 overlay；本次沒有發現
  需要回看或重拍的最終疑點。原始 full-page PNG 仍保留供後續 spot check。
