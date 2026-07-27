import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIResponse, type Request } from "@playwright/test";

import { routeManifest } from "@/lib/route-manifest";

const BASE_ORIGIN = "http://127.0.0.1:3000";

interface CapturedRequest {
  readonly url: string;
  readonly method: string;
  readonly postData: string;
}

function captureRequest(request: Request): CapturedRequest {
  return {
    url: request.url(),
    method: request.method(),
    postData: request.postData() ?? "",
  };
}

function parseCsp(value: string): Map<string, readonly string[]> {
  return new Map(
    value
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [directive, ...tokens] = part.split(/\s+/);
        return [directive, tokens] as const;
      }),
  );
}

function expectExactSecurityHeaders(response: APIResponse, pathname = "/"): string {
  const headers = response.headers();
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["permissions-policy"]).toBe(
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  expect([
    "private, no-cache, no-store, max-age=0, must-revalidate",
    "no-cache, must-revalidate",
  ]).toContain(headers["cache-control"]);

  const rawCsp = headers["content-security-policy"];
  expect(rawCsp).toBeTruthy();
  const csp = parseCsp(rawCsp);
  expect([...csp.keys()]).toEqual([
    "default-src",
    "script-src",
    "style-src",
    "img-src",
    "font-src",
    "connect-src",
    "media-src",
    "worker-src",
    "manifest-src",
    "object-src",
    "frame-src",
    "frame-ancestors",
    "base-uri",
    "form-action",
    "upgrade-insecure-requests",
  ]);
  expect(csp.get("default-src")).toEqual(["'self'"]);

  const scriptTokens = csp.get("script-src") ?? [];
  const nonceTokens = scriptTokens.filter((token) => /^'nonce-[A-Za-z0-9+/=]+'$/.test(token));
  expect(nonceTokens).toHaveLength(1);
  const development = scriptTokens.includes("'unsafe-eval'");
  expect(scriptTokens).toEqual(
    development
      ? ["'self'", nonceTokens[0], "'strict-dynamic'", "'unsafe-eval'"]
      : ["'self'", nonceTokens[0], "'strict-dynamic'"],
  );
  expect(csp.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  expect(csp.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
  expect(csp.get("font-src")).toEqual(["'self'"]);
  expect(csp.get("connect-src")).toEqual(
    development
      ? ["'self'", "ws://localhost:*", "ws://127.0.0.1:*"]
      : ["'self'"],
  );
  expect(csp.get("media-src")).toEqual(["'self'"]);
  expect(csp.get("worker-src")).toEqual(["'self'", "blob:"]);
  expect(csp.get("manifest-src")).toEqual(["'self'"]);
  expect(csp.get("object-src")).toEqual(["'none'"]);
  expect(csp.get("frame-src")).toEqual(["'none'"]);
  expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
  expect(csp.get("base-uri")).toEqual(["'self'"]);
  expect(csp.get("form-action")).toEqual(
    pathname === "/checkout" || pathname.startsWith("/checkout/")
      ? ["'self'", "https://payment-stage.ecpay.com.tw"]
      : ["'self'"],
  );
  expect(csp.get("upgrade-insecure-requests")).toEqual([]);
  if (!pathname.startsWith("/checkout")) expect(rawCsp).not.toContain("https://");
  expect(rawCsp).not.toContain("http://");
  expect(rawCsp).not.toContain(" *");

  return nonceTokens[0];
}

test("every reachable route returns its declared status and security baseline", async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Route sweep runs once in Chromium.");
  test.setTimeout(180_000);

  const failures: string[] = [];
  const chunkSize = 6;
  for (let index = 0; index < routeManifest.length; index += chunkSize) {
    const chunk = routeManifest.slice(index, index + chunkSize);
    const responses = await Promise.all(
      chunk.map(async (route) => ({ route, response: await request.get(route.path) })),
    );

    for (const { route, response } of responses) {
      if (response.status() !== route.expectedStatus) {
        failures.push(`${route.path}: expected ${route.expectedStatus}, got ${response.status()}`);
        continue;
      }
      try {
        expect(response.headers()["content-type"], route.path).toContain("text/html");
        expectExactSecurityHeaders(response, route.path);
      } catch (error) {
        failures.push(`${route.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  expect(failures, failures.join("\n")).toEqual([]);
});

test("CSP uses a fresh nonce and exact production/development policy variants", async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Header contract runs once.");
  const home = await request.get("/");
  const product = await request.get("/product/field-house-polo");
  const homeNonce = expectExactSecurityHeaders(home, "/");
  const productNonce = expectExactSecurityHeaders(product, "/product/field-house-polo");
  expect(productNonce).not.toBe(homeNonce);
});

test("prefetch-like headers cannot bypass the HTML CSP and nonce baseline", async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Header contract runs once.");
  const response = await request.get("/", {
    headers: { Purpose: "prefetch", Accept: "text/html" },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/html");
  const nonce = expectExactSecurityHeaders(response, "/");
  const html = await response.text();
  expect(html).toContain(nonce.slice("'nonce-".length, -1));
});

test("dynamic social descriptions keep the concept and non-transaction disclosure", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Metadata contract runs once.");

  for (const path of [
    "/product/field-house-polo",
    "/collections/first-light-in-the-field",
    "/journal/before-the-house-wakes",
  ]) {
    await page.goto(path);
    const description = await page
      .locator('meta[property="og:description"]')
      .getAttribute("content");
    expect(description, path).toContain("概念展示");
    expect(description, path).toContain("不提供真實交易");
  }
});

test("canonical counts, Taiwan scope, and the sole main landmark stay consistent", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Content contract runs once.");

  for (const path of [
    "/admin",
    "/care-repair",
    "/orders",
    "/orders/access",
    "/payment",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("main main")).toHaveCount(0);
  }

  await page.goto("/shop");
  await expect(page.getByText(/50 件首發作品/)).toBeVisible();
  await page.goto("/collections");
  await expect(page.getByText(/5 個篇章/)).toBeVisible();
  await page.goto("/journal");
  await expect(page.locator("article")).toHaveCount(5);
  await page.goto("/story");
  await expect(page.getByText(/私人草地球場與長桌/)).toBeVisible();
  await page.goto("/lookbook");
  await expect(page.locator("figure")).toHaveCount(36);
  await expect(page.locator("figure img")).toHaveCount(36);
  for (const section of await page.locator("section[aria-labelledby]").all()) {
    const labelledBy = await section.getAttribute("aria-labelledby");
    expect(labelledBy).toMatch(/^[a-z][a-z0-9-]*$/);
    await expect(page.locator(`#${labelledBy}`)).toHaveCount(1);
  }

  await page.goto("/robots.txt");
  await page.evaluate(() => {
    window.localStorage.setItem(
      "lignee:cart",
      JSON.stringify({
        version: 1,
        lines: [{ skuId: "field-house-polo-s-estate-olive", quantity: 1 }],
      }),
    );
  });
  await page.goto("/checkout");
  await expect(page.getByRole("option", { name: /台灣本島/ })).toHaveCount(1);
  await expect(page.getByRole("option", { name: /離島/ })).toHaveCount(0);
});

test("five-card editorial grids remain balanced at 768px", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Tablet geometry runs once.");
  await page.setViewportSize({ width: 768, height: 1024 });

  const expectBalancedFive = async (
    cards: ReturnType<typeof page.locator>,
    label: string,
  ) => {
    await expect(cards, label).toHaveCount(5);
    const boxes = await cards.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width };
      }),
    );
    expect(Math.abs(boxes[0].y - boxes[1].y), `${label} first row`).toBeLessThan(2);
    expect(Math.abs(boxes[1].y - boxes[2].y), `${label} first row`).toBeLessThan(2);
    expect(Math.abs(boxes[3].y - boxes[4].y), `${label} second row`).toBeLessThan(2);
    expect(Math.abs(boxes[3].width - boxes[4].width), `${label} second row widths`).toBeLessThan(2);
    expect(boxes[4].x, `${label} fifth card must not be a left orphan`).toBeGreaterThan(0);
  };

  await page.goto("/");
  await expectBalancedFive(
    page.locator('section[aria-labelledby="chapters-title"] > div:last-child > a'),
    "home chapters",
  );
  await expectBalancedFive(
    page.locator("section").filter({
      has: page.getByRole("heading", { name: "寫給緩慢生活的筆記", level: 2 }),
    }).locator("article"),
    "home journal",
  );

  await page.goto("/journal");
  await expectBalancedFive(
    page.locator('section[aria-label="Estate Journal 文章"] article'),
    "journal page",
  );
});

test("the site header remains sticky and unobstructed during normal scroll", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Sticky geometry runs once.");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");

  const header = page.locator(".site-header");
  await expect(header).toBeVisible();
  const initial = await header.boundingBox();
  expect(initial).not.toBeNull();
  expect(initial?.y ?? 0).toBeGreaterThan(0);

  await page.evaluate(() => window.scrollTo(0, 1_200));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1_000);
  const stuck = await header.boundingBox();
  expect(stuck).not.toBeNull();
  expect(Math.abs(stuck?.y ?? 100)).toBeLessThan(2);
  expect(Math.abs((stuck?.height ?? 0) - (initial?.height ?? 0))).toBeLessThan(2);
  expect(
    await header.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.height / 2);
      return hit instanceof Node && element.contains(hit);
    }),
  ).toBe(true);
});

test("newsletter, appointment, and checkout demo values never leave the browser", async ({
  page,
}) => {
  const requests: CapturedRequest[] = [];
  page.on("request", (request) => requests.push(captureRequest(request)));

  const newsletterValue = "sentinel-newsletter@privacy.invalid";
  await page.goto("/");
  await page.getByRole("textbox", { name: /Email（請使用示範資料）/ }).fill(newsletterValue);
  await page.getByRole("button", { name: "訂閱來信" }).click();
  await expect(page.getByRole("status")).toContainText("沒有任何資料被傳送或保存");

  const appointmentName = "SENTINEL-APPOINTMENT-NAME";
  const appointmentEmail = "sentinel-appointment@privacy.invalid";
  const appointmentNotes = "SENTINEL-APPOINTMENT-NOTES";
  await page.goto("/private-appointment");
  await page.getByRole("textbox", { name: "示範稱呼" }).fill(appointmentName);
  await page.getByRole("textbox", { name: "示範信箱" }).fill(appointmentEmail);
  await page.getByRole("textbox", { name: "展示需求" }).fill(appointmentNotes);
  await page.getByRole("checkbox", { name: /我了解這是無法建立真實時段/ }).check();
  await page.getByRole("button", { name: "送出展示預約" }).click();
  await expect(page.getByRole("status")).toContainText("沒有資料被送出");

  await page.addInitScript(() => {
    window.localStorage.setItem(
      "lignee:cart",
      JSON.stringify({
        version: 1,
        lines: [{ skuId: "field-house-polo-s-estate-olive", quantity: 1 }],
      }),
    );
  });
  const checkoutName = "SENTINEL-CHECKOUT-NAME";
  const checkoutEmail = "sentinel-checkout@privacy.invalid";
  const checkoutAddress = "Sandbox SENTINEL-CHECKOUT-ADDRESS";
  await page.goto("/checkout");
  await expect(page.getByText("伺服器價格已確認。")).toBeVisible();
  await page.getByRole("textbox", { name: "Sandbox 收件稱呼" }).fill(checkoutName);
  await page.getByRole("textbox", { name: "Sandbox 聯絡信箱" }).fill(checkoutEmail);
  await page.getByRole("textbox", { name: "Sandbox 配送地址" }).fill(checkoutAddress);
  await page.getByRole("button", { name: "繼續付款規劃" }).click();
  await expect(page.getByRole("heading", { name: "付款方式規劃" })).toBeVisible();

  for (const request of requests) {
    const url = new URL(request.url);
    expect(url.origin, `${request.method} ${request.url}`).toBe(BASE_ORIGIN);
  }

  const serializedRequests = JSON.stringify(requests);
  for (const privateValue of [
    newsletterValue,
    appointmentName,
    appointmentEmail,
    appointmentNotes,
    checkoutName,
    checkoutEmail,
    checkoutAddress,
  ]) {
    expect(serializedRequests).not.toContain(privateValue);
    expect(decodeURIComponent(serializedRequests)).not.toContain(privateValue);
  }
});

for (const representativeRoute of ["/", "/shop", "/product/field-house-polo"] as const) {
  test(`axe has no critical or serious violations on ${representativeRoute}`, async ({
    page,
  }, testInfo) => {
    await page.goto(representativeRoute);
    if (representativeRoute.startsWith("/product/")) {
      await expect(page.getByRole("button", { name: "加入購物車" })).toBeEnabled();
    }
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    );

    if (blocking.length > 0) {
      await testInfo.attach("axe-blocking-violations", {
        body: JSON.stringify(blocking, null, 2),
        contentType: "application/json",
      });
    }

    expect(
      blocking.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.flatMap((node) => node.target),
      })),
    ).toEqual([]);
  });
}
