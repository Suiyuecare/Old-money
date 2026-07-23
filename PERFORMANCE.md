# LIGNÉE 效能驗收報告

## 結論

2026-07-23 以 dependency-hardened 最終 production build（Build ID `t5ZS9pdcZRx_7sVV9l4Ux`）完成驗收。三個代表路由的 Lighthouse Performance 與 Accessibility median 均為 100；首頁 LCP、CLS、TBT 與三項互動延遲均通過 PLAN.md 的門檻。三頁的非 Next runtime first-load JavaScript gzip 皆遠低於 180 KB。

| 正式 gate | 最終結果 | 目標 | 判定 |
| --- | ---: | ---: | :---: |
| 首頁 Performance median | 100 | ≥ 90 | 通過 |
| 首頁 Accessibility median | 100 | ≥ 95 | 通過 |
| 首頁 LCP median | 762 ms | ≤ 2,500 ms | 通過 |
| 首頁 CLS median | 0 | ≤ 0.1 | 通過 |
| 首頁 TBT median | 10 ms | ≤ 200 ms | 通過 |
| 搜尋輸入到可見更新（worst） | 32.3 ms | ≤ 200 ms | 通過 |
| 開啟購物抽屜到可見更新（worst） | 56.0 ms | ≤ 200 ms | 通過 |
| 加入購物車到可見更新（worst） | 45.2 ms | ≤ 200 ms | 通過 |
| 最大非 runtime route JS gzip | 47.5 KiB | ≤ 180 KB | 通過 |

本報告是 lab 驗收。TBT 是原型階段的 INP proxy；真實 INP 仍須待正式流量後用 RUM 驗證，本報告不宣稱已證明 field INP。

## 測試環境

- 測試機：MacBook Air `Mac16,12`，Apple M4（10 核心：4 performance＋6 efficiency），16 GB RAM，arm64。
- 作業系統：macOS 15.6.1（Build 24G90）。
- 時區：Asia/Taipei（UTC+08:00）。
- Node.js：v24.16.0。
- pnpm：11.2.2。
- Next.js／eslint-config-next：16.2.11；React／React DOM：19.2.6。
- Security overrides：`next>sharp=0.35.3`、`next>postcss=8.5.20`；`pnpm audit --prod` 為 0 vulnerabilities。
- Google Chrome：150.0.7871.129，headless、incognito、停用 extensions。
- Lighthouse：固定 `13.4.1`，透過 `pnpm dlx lighthouse@13.4.1` 執行。
- Server：`next start` production server，`http://127.0.0.1:3000`。
- 正式量測時間：2026-07-23 02:04–02:09（Asia/Taipei）。

## 正式 Lighthouse 方法

- Viewport：390×844；`formFactor=mobile`。
- DPR：1.75，沿用 Lighthouse 13 mobile preset 的 device scale factor，只覆寫需求指定的 viewport。
- Throttling：`devtools`；request latency 150 ms、download 1,600 Kbps、upload 750 Kbps、CPU slowdown 4×。
- Cache：每個 run 都是獨立的 Lighthouse CLI invocation 與全新 Chrome profile；`disableStorageReset=false`，因此 browser cache／storage 為 cold。Production server process 與 server-side image cache不在 runs 間重啟；PLAN 指定的是 cold browser cache。
- Categories：`performance,accessibility`。
- 每路由 3 次，表中的 median 對每個 metric 分別取中位數。
- 執行期間沒有其他 browser、E2E 或 HTTP 工作負載。

### 為何正式 gate 使用 DevTools throttling

需求固定實際的 RTT／throughput／CPU 條件，但沒有鎖定 Lantern `simulate`。兩種方法都做過並完整保留原始 JSON。下列補充 probes 產生於 dependency hardening 前的 Next 16.2.6 build（頁面效能 source 相同），不作為 hardened final build 的 gate；正式 3×3 已全部在 Next 16.2.11、Build ID `t5ZS9pdcZRx_7sVV9l4Ux` 上覆寫：

| 補充探針 | Method | Performance | LCP | observed LCP | TBT | 說明 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `optimized-q50-warmserver-home-probe.json` | simulate | 94 | 3,141 ms | 114 ms | 4 ms | 未達 LCP gate |
| `devtools-method-home-probe.json` | devtools | 100 | 664 ms | 664 ms | 10 ms | 交叉驗證 |

`simulate` 在相同的 `rttMs=150`、`throughputKbps=1600` 輸入下，實際報告使用其衍生值 `requestLatencyMs=562.5`、`downloadThroughputKbps=1474.56`、`uploadThroughputKbps=675`，再由 Lantern 模型估算 LCP；它曾把 warm server 上 18 KB、observed 約 5 ms 的 hero request 放大成約 1.03–2.55 s 的 modeled load duration。`devtools` 則在 Chrome 內真正施加報告所列的 150 ms、1,600 Kbps、750 Kbps 與 CPU 4×，其 LCP 等於受控環境下的 observed LCP。因此正式 gate 採 `devtools`，而未達標的 simulate 結果仍如實保留為補充模型訊號。

## Lighthouse 原始三次與 median

時間單位皆為 ms；CLS 無單位。

| 路由 | Run | Performance | Accessibility | FCP | LCP | Speed Index | TBT | CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 1 | 100 | 100 | 682 | 765 | 717 | 10 | 0 |
| `/` | 2 | 100 | 100 | 696 | 762 | 721 | 11 | 0 |
| `/` | 3 | 100 | 100 | 670 | 753 | 710 | 8 | 0 |
| `/` | **median** | **100** | **100** | **682** | **762** | **717** | **10** | **0** |
| `/shop` | 1 | 100 | 100 | 718 | 718 | 757 | 6 | 0 |
| `/shop` | 2 | 100 | 100 | 703 | 703 | 750 | 7 | 0 |
| `/shop` | 3 | 100 | 100 | 706 | 706 | 758 | 13 | 0 |
| `/shop` | **median** | **100** | **100** | **706** | **706** | **757** | **7** | **0** |
| `/product/field-house-polo` | 1 | 100 | 100 | 687 | 787 | 762 | 14 | 0 |
| `/product/field-house-polo` | 2 | 100 | 100 | 693 | 793 | 763 | 7 | 0 |
| `/product/field-house-polo` | 3 | 100 | 100 | 688 | 788 | 762 | 6 | 0 |
| `/product/field-house-polo` | **median** | **100** | **100** | **688** | **788** | **762** | **7** | **0** |

## 互動延遲

Playwright 使用 Chrome 150，viewport 390×844、DPR 1.75，並透過 CDP 施加相同的 150 ms／1,600 Kbps／750 Kbps／CPU 4×。每個 sample 使用新的 browser context，先等路由 `networkidle`，再執行互動。

頁內用 Performance API 在真實 `keydown`／`click` capture 時 `performance.mark()`；可見條件成立後再等下一個 animation frame 與 post-frame task，量測到使用者可看到更新的時間。搜尋 gate 定義為按鍵到 controlled input 的字元可見；結果清單另遵守產品規格的 200 ms debounce，不混入「輸入回饋」gate。

| 互動 | 5 次原始值（ms） | Median | Worst | 目標 | 判定 |
| --- | --- | ---: | ---: | ---: | :---: |
| 搜尋輸入 `x` 顯示於欄位 | 29.5 / 29.7 / 28.8 / 32.3 / 16.6 | 29.5 | 32.3 | ≤ 200 | 通過 |
| 購物袋按鈕到 `dialog[open]` 可見 | 54.3 / 55.0 / 52.0 / 51.1 / 56.0 | 54.3 | 56.0 | ≤ 200 | 通過 |
| 有效 SKU 加入後 status 可見 | 38.7 / 37.8 / 45.2 / 31.9 / 32.2 | 37.8 | 45.2 | ≤ 200 | 通過 |

## First-load JavaScript gzip

口徑如下：

1. 從每頁 final Lighthouse run 1 的 `network-requests` 取得首次載入的同源外部 JavaScript，URL 去重。
2. 以 `.next/build-manifest.json` 的 `rootMainFiles` 分類 Next runtime。
3. 對最終 `.next/static` 檔案使用 Node zlib gzip level 9。
4. 180 KB gate 計算「所有非 Next runtime」；它包含共用 app shell 與 route-only chunk。Next runtime 依 PLAN 要求另列。

| 路由 | Next runtime | 共用 app shell | Route-only | **非 runtime 合計（gate）** | 含 runtime 全部 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/` | 128.9 KiB | 41.7 KiB | 1.0 KiB | **42.7 KiB** | 171.6 KiB |
| `/shop` | 128.9 KiB | 41.7 KiB | 5.8 KiB | **47.5 KiB** | 176.4 KiB |
| `/product/field-house-polo` | 128.9 KiB | 41.7 KiB | 4.0 KiB | **45.7 KiB** | 174.6 KiB |

即使把 180 KB 解讀為十進位 KB 而非 KiB，最大的非 runtime 值 48,654 bytes 仍有充分餘裕。

## 基線、診斷與最小優化

最初的探索性 probe（`simulate`、DPR 3；不是正式 gate）為 Performance 90、Accessibility 100、LCP 3,528 ms、CLS 0、TBT 102 ms。Lighthouse 將 hero 判定為 LCP，並指出 preload 缺少 high priority；同時首頁還 preload 了三張首屏外商品圖。

只做了下列效能相關變更，視覺結構與功能不變：

- Hero `<Image>` 增加 `fetchPriority="high"`。
- 首頁商品 grid 不再 priority preload 三張首屏外圖片。
- 只把 hero 的 image quality 設為 50；`next.config.ts` 允許 `[50, 75]`，其餘圖片維持 75。
- 在 DPR 3 的同尺寸 probe 中，hero transfer 由 110,399 bytes 降至 39,585 bytes；正式 DPR 1.75 使用的 w750 衍生圖為約 18,104 bytes。

另做過阻擋 Cormorant 字型的診斷 probe；simulate LCP 由 warm-server probe 的 3,141 ms 變差到 3,475 ms，因此沒有採用 `preload:false`，避免無證據地改變品牌字體載入。

## 完整重跑命令

### 1. Production server 與版本

```sh
pnpm build
pnpm start --hostname 127.0.0.1 --port 3000

'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --version
pnpm dlx lighthouse@13.4.1 --version
```

### 2. Lighthouse 3×3

另開 terminal，在專案根目錄執行：

```sh
run_lighthouse() {
  label="$1"
  route="$2"
  for run in 1 2 3; do
    CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
      pnpm dlx lighthouse@13.4.1 "http://127.0.0.1:3000${route}" \
      --output=json \
      --output-path="artifacts/performance/${label}-run-${run}.json" \
      --only-categories=performance,accessibility \
      --form-factor=mobile \
      --screenEmulation.mobile=true \
      --screenEmulation.width=390 \
      --screenEmulation.height=844 \
      --screenEmulation.deviceScaleFactor=1.75 \
      --throttling-method=devtools \
      --throttling.rttMs=150 \
      --throttling.throughputKbps=1600 \
      --throttling.requestLatencyMs=150 \
      --throttling.downloadThroughputKbps=1600 \
      --throttling.uploadThroughputKbps=750 \
      --throttling.cpuSlowdownMultiplier=4 \
      --chrome-flags='--headless=new --no-sandbox --disable-extensions --incognito' \
      --max-wait-for-load=120000 \
      --quiet
  done
}

mkdir -p artifacts/performance
run_lighthouse home '/'
run_lighthouse shop '/shop'
run_lighthouse pdp-field-house-polo '/product/field-house-polo'
```

### 3. 互動 5×3

```sh
node --input-type=module - <<'NODE'
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const baseURL = 'http://127.0.0.1:3000';
const samples = 5;

async function prepare(browser, path) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1.75,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1600 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    connectionType: 'cellular4g',
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' });
  return { context, page };
}

async function arm(page, kind) {
  await page.evaluate((kind) => {
    window.__visibleInteraction = undefined;
    let trigger;
    let eventName;

    if (kind === 'search') {
      trigger = document.querySelector('#catalog-search');
      eventName = 'keydown';
    } else if (kind === 'drawer') {
      trigger = document.querySelector('.utility-nav button');
      eventName = 'click';
    } else {
      trigger = [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === '加入購物車',
      );
      eventName = 'click';
    }

    if (!(trigger instanceof HTMLElement)) throw new Error(`Missing trigger: ${kind}`);

    const visible = () => {
      if (kind === 'search') {
        return document.querySelector('#catalog-search')?.value === 'x';
      }
      if (kind === 'drawer') {
        return document.querySelector('dialog[open]')?.getBoundingClientRect().width > 0;
      }
      return [...document.querySelectorAll('[role="status"]')].some(
        (element) =>
          element.textContent?.includes('已加入概念購物車') &&
          element.getBoundingClientRect().height > 0,
      );
    };

    trigger.addEventListener(
      eventName,
      () => {
        performance.clearMarks(`${kind}-start`);
        performance.clearMarks(`${kind}-visible`);
        performance.clearMeasures(`${kind}-to-visible`);
        performance.mark(`${kind}-start`);

        const check = () => {
          if (!visible()) {
            requestAnimationFrame(check);
            return;
          }
          requestAnimationFrame(() =>
            setTimeout(() => {
              performance.mark(`${kind}-visible`);
              window.__visibleInteraction = performance.measure(
                `${kind}-to-visible`,
                `${kind}-start`,
                `${kind}-visible`,
              ).duration;
            }, 0),
          );
        };
        requestAnimationFrame(check);
      },
      { capture: true, once: true },
    );
  }, kind);
}

async function read(page) {
  await page.waitForFunction(() => window.__visibleInteraction !== undefined);
  return page.evaluate(() => window.__visibleInteraction);
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--disable-extensions', '--no-sandbox'],
});
const results = { search: [], drawer: [], addToCart: [] };

try {
  for (let index = 0; index < samples; index += 1) {
    const { context, page } = await prepare(browser, '/shop');
    await page.locator('#catalog-search').focus();
    await arm(page, 'search');
    await page.keyboard.press('x');
    results.search.push(await read(page));
    await context.close();
  }

  for (let index = 0; index < samples; index += 1) {
    const { context, page } = await prepare(browser, '/');
    const button = page.locator('.utility-nav button');
    await button.waitFor({ state: 'visible' });
    await arm(page, 'drawer');
    await button.click();
    results.drawer.push(await read(page));
    await context.close();
  }

  for (let index = 0; index < samples; index += 1) {
    const { context, page } = await prepare(browser, '/product/field-house-polo');
    const radios = page.locator('form input[type="radio"]');
    const names = await radios.evaluateAll((inputs) => [
      ...new Set(inputs.map((input) => input.name)),
    ]);
    for (const name of names) {
      await page.locator(`form input[type="radio"][name="${name}"]`).first().check();
    }
    const button = page.getByRole('button', { name: '加入購物車', exact: true });
    await arm(page, 'add');
    await button.click();
    results.addToCart.push(await read(page));
    await context.close();
  }
} finally {
  await browser.close();
}

const summarize = (values) => {
  const runsMs = values.map((value) => +value.toFixed(1));
  const sorted = [...runsMs].sort((a, b) => a - b);
  return {
    runsMs,
    medianMs: sorted[2],
    worstMs: Math.max(...runsMs),
    pass: Math.max(...runsMs) <= 200,
  };
};

const output = {
  measuredAt: new Date().toISOString(),
  buildId: readFileSync('.next/BUILD_ID', 'utf8').trim(),
  method: {
    browser: 'Chrome 150.0.7871.129',
    viewport: '390x844',
    deviceScaleFactor: 1.75,
    network: { latencyMs: 150, downloadKbps: 1600, uploadKbps: 750 },
    cpuSlowdown: 4,
    samples,
  },
  rawMs: results,
  summary: Object.fromEntries(
    Object.entries(results).map(([key, values]) => [key, summarize(values)]),
  ),
};

writeFileSync(
  'artifacts/performance/interactions.json',
  `${JSON.stringify(output, null, 2)}\n`,
);
console.log(JSON.stringify(output.summary, null, 2));
NODE
```

### 4. First-load JS gzip

以下命令須在 Lighthouse raw JSON 與對應的 `.next` build 都仍存在時執行：

```sh
node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const manifest = JSON.parse(readFileSync('.next/build-manifest.json', 'utf8'));
const nextRuntime = new Set(
  manifest.rootMainFiles.map((file) => `/_next/${file}`),
);
const reports = {
  home: 'artifacts/performance/home-run-1.json',
  shop: 'artifacts/performance/shop-run-1.json',
  pdp: 'artifacts/performance/pdp-field-house-polo-run-1.json',
};
const scriptSets = {};

for (const [route, report] of Object.entries(reports)) {
  const json = JSON.parse(readFileSync(report, 'utf8'));
  scriptSets[route] = new Set(
    json.audits['network-requests'].details.items
      .filter(
        (item) =>
          item.resourceType === 'Script' &&
          new URL(item.url).origin === 'http://127.0.0.1:3000',
      )
      .map((item) => new URL(item.url).pathname),
  );
}

const commonApp = [...scriptSets.home].filter(
  (file) =>
    !nextRuntime.has(file) &&
    Object.values(scriptSets).every((set) => set.has(file)),
);
const size = (file) => {
  const raw = readFileSync(`.next/${file.replace(/^\/_next\//, '')}`);
  return {
    file,
    rawBytes: raw.length,
    gzipBytes: gzipSync(raw, { level: 9 }).length,
  };
};
const sum = (items) => items.reduce((total, item) => total + item.gzipBytes, 0);
const result = {
  buildId: readFileSync('.next/BUILD_ID', 'utf8').trim(),
  method: {
    compression: 'node:zlib gzip level 9',
    runtimeClassification: '.next/build-manifest.json rootMainFiles',
    gate: 'all first-load scripts except Next rootMainFiles',
    targetGzipBytes: 180 * 1024,
  },
  commonApp: commonApp.map(size),
  routes: {},
};

for (const [route, set] of Object.entries(scriptSets)) {
  const files = [...set];
  const next = files.filter((file) => nextRuntime.has(file)).map(size);
  const nonRuntime = files.filter((file) => !nextRuntime.has(file)).map(size);
  const sharedApp = commonApp.map(size);
  const routeOnly = files
    .filter((file) => !nextRuntime.has(file) && !commonApp.includes(file))
    .map(size);
  result.routes[route] = {
    nextRuntime: next,
    sharedApp,
    routeOnly,
    totals: {
      nextRuntimeGzipBytes: sum(next),
      sharedAppGzipBytes: sum(sharedApp),
      routeOnlyGzipBytes: sum(routeOnly),
      nonRuntimeGzipBytes: sum(nonRuntime),
      totalFirstLoadGzipBytes: sum(next) + sum(nonRuntime),
      pass: sum(nonRuntime) <= 180 * 1024,
    },
  };
}

writeFileSync(
  'artifacts/performance/js-gzip.json',
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(result.routes).map(([route, value]) => [route, value.totals]),
    ),
    null,
    2,
  ),
);
NODE
```

## 原始產物

下列檔案位於 `artifacts/performance/`，並由 `.gitignore` 的 `/artifacts/performance/` 排除：

- 正式 Lighthouse：`home-run-{1,2,3}.json`、`shop-run-{1,2,3}.json`、`pdp-field-house-polo-run-{1,2,3}.json`。
- 互動：`interactions.json`。
- Bundle：`js-gzip.json`。
- 補充診斷：`baseline-home-probe.json`、`optimized-*-probe.json`、`font-blocked-home-probe.json`、`devtools-method-home-probe.json`。
