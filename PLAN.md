# Plan: LIGNÉE 當代英倫莊園生活風格商城
_Locked via grill — by Codex + user_

## Goal
從零建立一個可分享的高擬真精品商城原型，將 LIGNÉE 定位為面向台灣 30–55 歲高收入都會族群的單一自有生活風格品牌。網站不靠醒目 Logo、折扣或浮誇的「老錢」符號，而以當代英倫莊園世界觀、克制的編輯設計、原創商品與人物影像，以及完整但不實際扣款的購物流程，販售「值得被傳承的生活方式」。第一版以繁體中文完成購物資訊，以英文承載品牌氣氛；可在本機完整運作並建立 Vercel 預覽，但不建立真實付款、庫存或訂單，也不傳輸或持久化個資；使用者輸入只在當次頁面記憶體中暫時處理。

## Approach

1. **建立前端基礎與資料邊界**
   - 使用 Next.js App Router、React Server Components 優先、TypeScript strict mode 與 `pnpm`；只有搜尋／篩選、收藏、購物車、抽屜與結帳狀態使用明確的 Client Components。
   - 使用 CSS Modules＋全域 CSS design tokens，自製語意化元件，不引入 UI component library 或動畫框架；圖片一律經 `next/image`，動態只用 CSS 與小型 IntersectionObserver hook。
   - 正式相依僅限 Next.js、React、React DOM 與 Zod；測試相依為 Vitest、Testing Library、Playwright 與 `@axe-core/playwright`。實作開始時解析當時穩定版本並立即寫入 `pnpm-lock.yaml`，之後不得浮動升級。
   - 商品、系列、Journal 與品牌故事以本地型別化模組管理，保留日後改接 CMS、庫存與商務後端的 adapter 邊界；原型不建立 API route、Server Action 或資料庫。
   - 購物車與收藏使用自製 Context＋reducer／external-store adapter；不引入另一套全域狀態函式庫。
   - 所有展示表單以 Client Component 阻止原生提交，不呼叫 `fetch`、XHR、beacon、mailto 或外部 action；姓名、地址與聯絡資料只存在當下記憶體，重新整理即清除。
   - 原型模式為 fail-closed 預設；預覽環境持續顯示「概念展示、無法交易、請勿輸入真實資料」橫幅並禁止搜尋索引。

2. **建立 LIGNÉE 品牌設計系統**
   - 固定品牌顯示名稱 `LIGNÉE`、標語 `Made to Be Inherited.`，網址與程式識別使用不含重音的 `lignee`。
   - 以暖象牙白、炭灰、深橄欖綠、牛血紅與少量黃銅色建立色彩系統；透過留白、材質與排版傳達價值，不使用滿版金色、皇冠、盾牌或仿古模板紋理。
   - 英文展示字使用 SIL Open Font License 的 Cormorant Garamond，透過 `next/font` 載入拉丁子集；繁中與內文使用系統字體堆疊（PingFang TC、Microsoft JhengHei、Noto Sans TC fallback），避免額外下載大型 CJK 字型。授權與來源記錄於 `THIRD_PARTY_NOTICES.md`。
   - 以文字標誌為主，搭配一個克制的交織 `L` 印記，僅用於皮件壓印、頁尾、favicon 與包裝情境。
   - 互動採圖片淡入、分段文字揭露、商品卡細微縮放與抽屜轉場；支援 `prefers-reduced-motion`，不使用有聲自動播放或重度視差。

3. **建立當代虛構品牌世界觀**
   - 品牌為單一自有品牌，不再採多品牌選物店架構；所有商品均掛名 LIGNÉE。
   - 世界觀為當代的 **The Lignée Estate**：以英國莊園、馬術、獵犬、林地、獵場早餐、藏書室、溫室與晚宴延展故事。
   - 狩獵以英國鄉野運動氛圍呈現；獵槍僅可作極少量遠景道具，不出現獵物、血腥或炫耀戰利品。
   - 人物保持匿名，不建立固定家族角色、爵位或可被當作史實的家族年表。
   - 可以虛構莊園與傳承敘事，但必須把品牌神話和商品事實分開；不虛構可驗證的企業歷史、實際產地、製程認證或材料來源。

4. **建立 27 件首發商品資料**
   - 每個指定方向各有一件代表商品，共 27 件；下列材質字樣是「概念開發目標」，不是已完成採購或驗證的銷售聲明：
     - 服飾 7 件：Polo 衫、牛津襯衫、針織衫、西裝外套、西裝褲、百慕達短褲、長洋裝。
     - 配件 8 件：真皮皮帶、手錶、托特包、公事包、太陽眼鏡、領帶、絲襪、珍珠耳環。
     - 居家生活 8 件：香氛蠟燭、擴香、床包、毛毯、馬克杯、玻璃杯、木製托盤、花瓶。
     - 文具 4 件：真皮筆記本、黃銅原子筆、木質收納盤、日誌／月計畫本（保留兩種版型變體，總商品數仍為 27）。
   - 男女服飾與人物曝光接近 1:1；居家、文具與多數配件不分性別。
   - 服飾提供 XS–XL 與 2–4 種低飽和色；其他商品依概念材質、容量或尺寸提供可選變體。每個有效組合必須是明確列舉的 SKU，不允許由前端自行拼出不存在的規格組合。
   - 價格使用新台幣：服飾 NT$6,800–32,000；配件 NT$4,800–68,000，手錶最高 NT$120,000；居家 NT$1,800–16,000；文具 NT$1,200–9,800。
   - `Product` 必須有穩定的 `id`／`slug`、名稱、類別、適用對象、系列 ID、基準整數 TWD 價格、可選軸、概念材質、尺寸／容量、保養、資產 ID 與相關商品 ID。產品不重複保存 SKU ID；所有 SKU 一律由 `SKU.productId` 推導。
   - `SKU` 必須有穩定的 `id`、`productId`、完整 option key/value、可選整數價格覆寫、展示狀態與代表資產 ID；SKU ID 是購物車行項目的唯一合併鍵。
   - SKU 的 effective price 定義為 `sku.priceTwd ?? product.basePriceTwd`。商品卡若所有 SKU 同價顯示單價，否則顯示最低至最高價；PDP 在完整選定 SKU 前顯示價格範圍，選定後顯示該 SKU 精確價格。
   - 價格篩選在任一有效 SKU effective price 落入含邊界區間時保留該商品；價格低到高依最低 SKU 價、高到低依最高 SKU 價排序。購物車小計、免運門檻與總額只使用每行 SKU 的 effective price × quantity。
   - 持久化的 `CartLine` 僅包含 `{ skuId, quantity }`；顯示名稱、圖片與價格每次都從 canonical catalog 重算。價格全部使用整數新台幣，不用浮點數。
   - 使用 Zod schema 與內容完整性測試，在 build 前拒絕重複 ID／slug、孤立 SKU、無效 option、缺圖、失效系列或相關商品、非正整數價格、重複 related ID 與自我引用。A→B、B→A 的互相推薦合法；UI 永遠只展開一層，不遞迴呈現。
   - 在供應商未確認前，商品名稱不直接使用未驗證材料作事實性命名；介面以「概念材質／預計規格」呈現皮革、黃銅、珍珠等方向，不得寫成「英國製」「義大利皮革」「瑞士機芯」等已證實事實。

5. **策劃四個首發莊園篇章**
   - **First Light in the Field**：戶外、馬術與男裝。
   - **The Conservatory Hour**：女裝、珍珠與花器。
   - **After Rain, the Library**：皮件、腕錶與文具。
   - **Dinner at the Long Table**：香氛、織品與餐桌器物。
   - 同一商品可出現在分類與篇章中；首頁以一天的莊園節奏帶領探索，商店頁再提供直接分類購物。

6. **生成並管理約 35 張原創影像**
   - 生成 27 張商品主圖與 8 張莊園生活／篇章形象照，建立統一的攝影提示、色彩、鏡頭、服裝與人物規則。
   - 人物以 30–55 歲的英國紳士與成熟女性為主，男女比例接近 1:1，呈現當代英國多元面貌；氣質自然、知性、有閱歷，不做成古裝、貴族扮裝或年輕網紅形象。
   - 首頁與 Journal 約 60% 使用人物生活影像；商品列表與詳情約 40% 使用乾淨商品特寫。
   - 商品詳情頁透過原圖的安全裁切、放大與版面組合提供視覺層次，不假裝不同裁切是不同商品角度。每張商品圖綁定一個 pictured SKU；選擇未拍攝的顏色不更換圖片，並顯示「影像為代表色」的可見與螢幕閱讀器提示。
   - 建立 asset manifest：`id`、本地路徑、OpenAI 生成來源、prompt source／hash、生成日期、資產類型、depicted product／SKU、原始尺寸、顯示比例、焦點座標、alt、檔案大小與人工 QA 狀態。
   - 商品圖目標 4:5、至少 1600×2000，輸出 WebP／AVIF 不超過 350 KB；篇章圖目標 3:2 或 16:9、長邊至少 2400 px、不超過 500 KB。手機 art direction 必須使用 manifest 內的安全焦點。
   - 人工 QA 必須逐張確認：無真實人物參考或可辨識公眾人物、無第三方 Logo／商標、解剖與手部合理、商品結構可信、無生成文字、跨圖色彩一致、主要裁切不切斷人物臉部或商品；只有 `qaStatus: approved` 的資產可以被頁面引用。

7. **完成資訊架構與主要頁面**
   - 首頁、全部商品、男裝、女裝、配件、居家、文具。
   - 四個情境篇章列表與詳情。
   - 商品詳情、搜尋結果、收藏、購物車與三步驟結帳。
   - 訂單完成、品牌故事、Estate Journal 列表與四篇文章。
   - `Private Appointment`、配送退換貨、隱私條款、使用條款與 404。
   - 因定位已改為單一自有品牌，移除多品牌目錄與品牌詳情頁。
   - 桌面與手機使用一致的分類模型；導覽在手機端保留清楚的搜尋、收藏與購物車入口。

8. **設計編輯式首頁與內容語氣**
   - 首屏以品牌、標語與當代莊園形象建立世界，不用優惠訊息搶占視覺焦點。
   - 首頁依四個篇章展開，穿插精選商品、品牌信念、材質／保養價值與 Estate Journal。
   - 主要購物資訊用繁體中文；系列、商品與形象標題可保留英文並附中文說明。第一版不做完整語言切換。
   - 文案克制、知性、帶文學感，使用觸感、場景、時間與細節表達價值，避免反覆自稱「頂級、尊榮、奢華」。
   - 不使用折扣標籤、促銷碼、倒數計時或限時特價。

9. **完成商品發現與商品詳情體驗**
   - 提供關鍵字搜尋，以及類別、性別／適用對象、價格、顏色、概念材質與系列篩選；顯示有效篩選、結果數、清除與無結果狀態。
   - 查詢狀態以 URL 為 canonical source：`q`、重複的 `category`／`audience`／`collection`／`color`／`material`、整數 `min`／`max` 與單值 `sort`。同一 facet 內為 OR，不同 facet 間為 AND；價格上下限皆包含邊界。
   - 搜尋字串以 Unicode NFKD、移除 combining marks、trim、lowercase 與空白 token 化；每個 token 都必須命中名稱、繁中副名、類別、系列或敘事 searchable text。無效或未知參數被忽略並在下一次互動時 canonicalize；多值依固定順序輸出。
   - 所有 query mutation 只能經過單一 `CatalogQueryCoordinator`：它持有最新 draft state，以一次 atomic serialization 更新完整 query。搜尋輸入採 200 ms debounce；任何 facet／sort／price 立即更新都先取消舊 debounce，再以最新 draft 排程搜尋，並以 sequence token 丟棄過期 callback，避免快速混合操作覆蓋彼此。
   - 篩選互動最終以 `router.replace(..., { scroll: false })` 提交；重新整理、分享網址、上一頁／下一頁必須重現相同結果與控制項狀態。只有 pathname／document 導航後才把焦點移至主標題；純 query 更新保持目前控制項焦點並透過 polite live region 宣告新結果數。單元與 E2E 測試需包含快速輸入搜尋同時切換多個 facet／sort 的順序組合。
   - 商品卡顯示名稱、類別／系列、價格與可選色彩提示；快速加入只在規格已明確時可用。
   - 商品頁內容順序為：一句傳承敘事、影像、價格與規格選擇、材質與剪裁／用途、尺寸或容量、保養、概念規格告知、配送退換貨、搭配商品。
   - 尺寸或必要規格未選時不得加入購物車，並提供可理解的欄位錯誤提示。

10. **完成模擬商務流程**
    - 購物車支援加入、刪除、數量 1–9、規格顯示、價格小計、運費提示與瀏覽器持久化。儲存格式為 `{ version: 1, lines: [{ skuId, quantity }] }`；Zod 驗證失敗、未知 SKU 或無效數量時安全捨棄該行並顯示非阻塞提示。
    - SSR 使用空的 server snapshot；購物車數量與收藏在 client hydration 完成前顯示中性 placeholder，避免 mismatch 或錯誤閃爍。所有價格由 catalog 重算，不信任 storage 內任何舊值。
    - 同一 SKU 合併成一行；跨分頁透過 `storage` event 同步，採最後一次有效寫入為準。`localStorage` 不可用時退化為當次記憶體狀態，購物流程仍可使用。
    - 配送範圍先設定為台灣本島與離島；滿 NT$12,000 免運，未滿收 NT$250；國際配送標示為尚未開放。
    - 結帳使用明確路由 `/checkout` 與 `/checkout/complete`，兩者共享只存在記憶體的 checkout-layout provider。`/checkout` 內的三步驟 guarded state machine 為 `details → payment-demo → review`；空購物車或跳過步驟時導回購物車／details，重新整理會清除聯絡與地址並回到 details，上一頁不重複提交。
    - 聯絡與地址欄位預填明顯虛構的 `.invalid` 範例，關閉 autocomplete，欄位上方固定警告「請勿輸入真實個資」；值只存在 React memory，不寫入 URL、storage、cookie、log 或 analytics。
    - 付款頁僅顯示「信用卡（正式版規劃）」與「Apple Pay（正式版規劃）」的靜態示意，不使用官方 Apple Pay 按鈕、不要求卡號、不載入 Apple Payment API，也不暗示 merchant validation 已完成。
    - 模擬提交採單次鎖定避免重複觸發，在 checkout-layout provider 將 eligibility 設為 `completed`、清空購物車，再導向 `/checkout/complete`；不使用 `sessionStorage`、不產生訂單編號。正常 client navigation 會保留 layout provider 並顯示完成狀態；直接開啟或重新整理完成頁時 provider 初始為 invalid，顯示「沒有真實訂單」與返回商店入口。回到 `/checkout` 時重設 eligibility。
    - 提供到貨後 14 日退貨的品牌服務文案，同時保留台灣通訊交易法定權益；絲襪、耳環等可能涉及衛生商品的例外文字在正式上線前須經專業法律確認。

11. **加入高端服務與留存入口**
    - **Letters from the Estate** 僅出現在首頁下方與頁尾，訴求季節選品、莊園來信與私人預覽；不使用彈窗或折扣交換信箱。
    - **Private Appointment** 提供私人選品與送禮諮詢展示表單，並描述免費禮盒包裝與手寫卡片服務。
    - 電子報與預約欄位使用 `.invalid` 範例與「請勿輸入真實資料」提示；提交只呈現前端成功狀態，不傳送、不持久化，且清楚標示預覽模式。
    - 收藏持久化格式為 `{ version: 1, productIds: string[] }`；以 Zod 驗證、移除未知／重複 ID，採與購物車相同的 hydration gate、`storage` event 最後有效寫入同步及 storage 不可用時的記憶體 fallback。

12. **完成品質、無障礙與預覽部署驗證**
    - 目標 WCAG 2.2 AA：語意化 HTML、完整鍵盤操作、可見焦點、跳至內容、表單標籤／錯誤關聯、AA 對比、圖片 alt 與減少動態模式。
    - 抽屜與 mobile filter 必須 focus trap、Escape 關閉並將焦點還給觸發器；色票有文字 label 與選取狀態；搜尋結果數與購物車更新用適量 live region；結帳驗證將焦點移至 error summary；只有 pathname／document 切換後焦點進入主標題，query-only 篩選更新不移動焦點。
    - 原型 mode 預設在 root metadata 設 `noindex, nofollow, noarchive`，並由 Next.js headers 對所有路由送出 `X-Robots-Tag`；每頁保留 prototype banner。`noindex` 只降低索引風險、不作存取控制；有權限時另開 Vercel Deployment Protection。
    - 預覽與 production 以每次 request nonce 套用精確 CSP baseline：`default-src 'self'; script-src 'self' 'nonce-{requestNonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'; upgrade-insecure-requests`。唯一 `unsafe-*` 例外是 Next／React 樣式所需的 `style-src 'unsafe-inline'`；禁止 wildcard、外部 origin 與 `unsafe-eval`。若框架不再需要該 style 例外，只能收緊不能放寬；任何新例外須在 `SECURITY.md` 寫出理由。
    - 另送 `Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff` 與 `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`。本機 dev 使用獨立 policy，只可額外允許 localhost HMR WebSocket 與開發工具需要的 `unsafe-eval`，不得帶入預覽／production。測試必須解析 CSP 並逐一比對 directive 值、禁止的 token 與外部 origin，而非只檢查 header 存在。
    - 原型完全不輸出 Product／Offer JSON-LD；只有未來顯式的 production mode 且商品事實完成審核後才可啟用。一般頁面 metadata、Open Graph 圖與 favicon 仍可提供，但標示概念預覽。
    - Vitest 覆蓋 pricing、運費邊界、搜尋 normalization／facet semantics、query coordinator 的取消／sequence／快速混合 mutation、cart reducer／migration／無效 storage、checkout guards；內容測試驗證所有 product、SKU、collection、asset 與 related ID。
    - Playwright＋axe 至少覆蓋：首頁到完成頁、直接／重新整理受保護步驟、空購物車、NT$12,000 運費邊界、缺少規格、invalid storage、搜尋網址的 refresh／back、抽屜 focus restore 與鍵盤完成結帳。隱私測試允許同源 App Router／RSC 請求，但斷言任何 request／beacon／navigation 都不含表單值且沒有外部 origin；另驗證 `form-action 'none'` 與 CSP／安全 headers。
    - 執行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:e2e` 與 `pnpm build`；代表性 viewport 至少為 390×844、768×1024、1440×900。
    - 效能驗收只對 production `pnpm build && pnpm start` 執行：Chrome／Lighthouse 固定版本、無 extension、cold cache、mobile 390×844、RTT 150 ms、throughput 1.6 Mbps、CPU slowdown 4×；每個代表頁跑三次並取 median。首頁 Performance ≥90、Accessibility ≥95、LCP ≤2.5 s、CLS ≤0.1、TBT ≤200 ms；TBT 是原型階段的 INP lab proxy，另由 Playwright 對搜尋、開抽屜與加入購物車量測 click/keypress 到可見 UI 更新 ≤200 ms。真實 INP 僅能在正式流量階段以 RUM 驗證，不宣稱本原型已證明。
    - 每路由 first-load JS 目標 ≤180 KB gzip（Next runtime 另列），並遵守上述影像大小限制；效能報告記錄測試機、瀏覽器／Lighthouse 版本、命令、三次原始值與 median。
    - 建立自動化 route manifest，對每個可到達的實際 route（包含 27 個商品、4 個篇章、4 篇 Journal 與所有靜態頁）在 390×844、768×1024、1440×900 擷取 full-page screenshot。人工逐張檢查 overflow、字體 fallback、截字、圖片焦點／裁切、視覺層級、間距、sticky／overlay 遮擋與空狀態，結果與重拍原因記錄於 `VISUAL-QA.md`；所有 route／viewport 均為 approved 才可交付。
    - 先完成本機驗證，再用既有、已授權的 Vercel 專案／登入建立受保護預覽；不得建立或提交 secrets。若憑證或專案權限不可用，交付可重現的本機 build 與部署指令並把預覽 URL 標記為未完成，而不是改用其他帳戶或降低保護。

## Key decisions & tradeoffs

- **單一自有品牌取代多品牌選物店。** LIGNÉE 承擔全部商品與敘事一致性，失去多品牌背書，換取更清楚的品牌資產與長期可控性。
- **高擬真原型先於真實商務系統。** 第一版可完整體驗購物，但不扣款、不建訂單、不管理庫存，也不保存個資；以降低未確認供應鏈與法務之前的風險。
- **情境策展優先、分類購物並存。** 首頁先販售世界觀，商店與搜尋仍提供效率，避免精品感犧牲可用性。
- **虛構品牌神話、真實商品聲明。** 莊園與傳承敘事可虛構，但產地、材質、製程與公司歷史不可冒充可驗證事實。
- **當代英倫而非古裝懷舊。** 以莊園生活與鄉野運動作文化語彙，但人物、服裝與使用情境都屬當代；狩獵元素保持非血腥、非炫耀。
- **繁中交易、英文造境。** 先服務台灣市場並控制內容成本，不在第一版承擔完整雙語維護。
- **無會員、保留收藏。** 以瀏覽器儲存降低後端與隱私負擔，代價是跨裝置同步、真實帳戶與訂單查詢延後。
- **27 件精選而非大量目錄。** 每個指定品項都有代表作與變體，將資源集中在敘事與品質；不營造虛假的龐大庫存。
- **約 35 張高品質原創影像而非多角度海量圖。** 用一致性和版面重組換取可控的生成範圍；正式商品攝影仍須在量產後補齊。
- **預覽部署而非正式上線。** 可分享和驗證，但保留 `noindex`、非交易告知與示範資料邊界。
- **App Router＋CSS Modules＋最小相依。** 以 RSC 為預設、互動採小型 client islands；代價是自製元件較多，但可控性、bundle 與精品視覺一致性更高。
- **URL 是商品搜尋狀態的唯一來源。** 可分享、可返回、可測試，代價是篩選互動必須維護 canonical query contract。
- **原型不傳輸或持久化付款／個資。** 表單值只在當次頁面記憶體暫時處理；結帳只驗證互動與狀態機，付款品牌僅作明確不可用的文字示意。

## Risks / open questions

- `LIGNÉE` 的商標、公司名稱、社群帳號與網域尚未查核；正式投入品牌或公開銷售前必須完成專業檢索與註冊評估。
- 商品供應商、打樣、成本、實際材質、尺寸表、產地、保固、維修與庫存均未確定；目前資料只能是概念原型，不能直接作為銷售承諾。
- 生成影像可能出現商品結構、手部、文字、花紋或跨圖一致性問題；建置時需逐張人工檢查並重生成不合格資產。
- 原創生成圖不能代替量產商品攝影；正式銷售前必須換成與實物一致、能呈現所有角度與細節的照片。
- 14 日退貨、衛生用品例外、隱私、條款、稅務與商品標示須在正式上線前由台灣法律與會計專業人員審閱。
- 真實付款、物流、電子發票、訂單通知、客服 SLA、庫存同步、退貨處理與資料保存政策尚未選型。
- Vercel 預覽若公開分享，仍可能被截圖或轉傳；需保持明顯的非交易提示，且不得放入真實個資或未授權素材。
- Vercel 登入與目標專案目前尚未驗證；沒有既有授權時，本次只能完成本機交付，不能擅自建立帳戶、專案或降低部署保護。

## Out of scope

- 真實信用卡／Apple Pay 扣款、訂單建立、電子發票、物流串接、庫存與退貨後台。
- 會員註冊登入、跨裝置收藏、會員等級、訂單查詢與管理後台。
- CMS、PIM、ERP、CRM、客服系統、電子報寄送與真實預約排程整合。
- 國際配送、多幣別、完整英文版與自動翻譯。
- 多品牌市集、第三方品牌目錄或未授權品牌／商品素材。
- 超過 27 件首發商品或每件商品的完整量產攝影組。
- 對未確認的產地、材料、製程、認證、家族史或企業年份作事實性宣稱。
- 正式網域切換、搜尋引擎公開索引、付費廣告、分析追蹤與正式營運上線。
