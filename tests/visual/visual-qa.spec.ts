import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { visualQaRouteManifest } from "@/lib/route-manifest";

const ARTIFACT_ROOT = path.resolve(process.cwd(), "artifacts/visual-qa");
const EXPECTED_VIEWPORTS = new Map([
  ["390x844", { width: 390, height: 844 }],
  ["768x1024", { width: 768, height: 1024 }],
  ["1440x900", { width: 1440, height: 900 }],
]);
const CRITICAL_RESOURCE_TYPES = new Set([
  "document",
  "script",
  "stylesheet",
  "image",
  "font",
]);

interface BrowserIssue {
  readonly kind: "console" | "pageerror" | "requestfailed";
  readonly message: string;
}

async function settleImagesAndReturnToTop(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;

    const stride = Math.max(240, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += stride) {
      window.scrollTo(0, y);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 24));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 80));

    const pendingImages = Array.from(document.images)
      .filter((image) => !image.complete)
      .map(
        (image) =>
          new Promise<void>((resolve) => {
            const finish = () => resolve();
            image.addEventListener("load", finish, { once: true });
            image.addEventListener("error", finish, { once: true });
            window.setTimeout(finish, 5_000);
          }),
      );
    await Promise.all(pendingImages);
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(100);
}

async function assertPrototypeBannerIsUnobstructed(page: Page) {
  const banner = page.locator(".prototype");
  await expect(banner).toHaveCount(1);
  await expect(banner).toBeVisible();

  const result = await banner.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centerX = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
    const centerY = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(centerX, centerY);
    return {
      withinViewport:
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.right <= window.innerWidth &&
        rect.bottom <= window.innerHeight,
      hitBelongsToBanner: hit instanceof Node && element.contains(hit),
      openDialogs: document.querySelectorAll("dialog[open]").length,
    };
  });

  expect(result.withinViewport, "prototype banner must fit inside the initial viewport").toBe(true);
  expect(result.hitBelongsToBanner, "prototype banner center must not be covered").toBe(true);
  expect(result.openDialogs, "no dialog or viewport overlay may start open").toBe(0);
}

function readPngDimensions(buffer: Buffer) {
  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function neutralizeStickyElementsForFullPageCapture(page: Page) {
  const neutralized = await page.locator("body *").evaluateAll((elements) =>
    elements.flatMap((element) => {
      if (!(element instanceof HTMLElement) || getComputedStyle(element).position !== "sticky") {
        return [];
      }
      element.style.position = "static";
      return [
        {
          tag: element.tagName.toLowerCase(),
          className: element.className,
        },
      ];
    }),
  );

  expect(
    neutralized.some(({ className }) =>
      typeof className === "string" ? className.split(/\s+/).includes("site-header") : false,
    ),
    "the sticky site header must be kept in normal flow for full-page stitching",
  ).toBe(true);
}

for (const route of visualQaRouteManifest) {
  test(`${route.id} · ${route.path}`, async ({ page }, testInfo) => {
    const viewport = EXPECTED_VIEWPORTS.get(testInfo.project.name);
    expect(viewport, `unexpected visual QA project ${testInfo.project.name}`).toBeDefined();
    if (!viewport) return;

    const browserIssues: BrowserIssue[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        const isDeclaredDocument404 =
          route.expectedStatus === 404 &&
          message.text() ===
            "Failed to load resource: the server responded with a status of 404 (Not Found)" &&
          message.location().url.length > 0 &&
          new URL(message.location().url).pathname === route.path;
        if (isDeclaredDocument404) return;
        browserIssues.push({ kind: "console", message: message.text() });
      }
    });
    page.on("pageerror", (error) => {
      browserIssues.push({ kind: "pageerror", message: error.message });
    });
    page.on("requestfailed", (request) => {
      const url = new URL(request.url());
      if (
        url.origin === "http://127.0.0.1:3000" &&
        CRITICAL_RESOURCE_TYPES.has(request.resourceType())
      ) {
        browserIssues.push({
          kind: "requestfailed",
          message: `${request.method()} ${url.pathname}: ${request.failure()?.errorText ?? "unknown"}`,
        });
      }
    });

    const response = await page.goto(route.path, { waitUntil: "networkidle" });
    expect(response, `${route.path} must produce a document response`).not.toBeNull();
    expect(response?.status(), `${route.path} HTTP status`).toBe(route.expectedStatus);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");

    await assertPrototypeBannerIsUnobstructed(page);

    const visibleHeadings = page.locator("h1:visible");
    await expect(visibleHeadings, `${route.path} must have exactly one visible h1`).toHaveCount(1);
    const heading = visibleHeadings.first();
    await heading.scrollIntoViewIfNeeded();
    const headingIsUnobstructed = await heading.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const centerX = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
      const centerY = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
      const hit = document.elementFromPoint(centerX, centerY);
      return hit instanceof Node && element.contains(hit);
    });
    expect(headingIsUnobstructed, `${route.path} h1 center must not be covered by an overlay`).toBe(
      true,
    );

    await settleImagesAndReturnToTop(page);

    const layout = await page.evaluate(() => ({
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(
      layout.documentScrollWidth,
      `${route.path} document horizontal overflow: ${JSON.stringify(layout)}`,
    ).toBeLessThanOrEqual(layout.documentClientWidth);
    expect(
      layout.bodyScrollWidth,
      `${route.path} body horizontal overflow: ${JSON.stringify(layout)}`,
    ).toBeLessThanOrEqual(layout.bodyClientWidth);

    const brokenLocalImages = await page.locator("img").evaluateAll((images) =>
      images.flatMap((node) => {
        const image = node as HTMLImageElement;
        const source = image.currentSrc || image.src;
        if (!source) return [];
        const url = new URL(source, window.location.href);
        if (url.origin !== window.location.origin) return [];
        return image.complete && image.naturalWidth > 0
          ? []
          : [{ src: url.pathname, complete: image.complete, naturalWidth: image.naturalWidth }];
      }),
    );
    expect(brokenLocalImages, `${route.path} has broken local images`).toEqual([]);

    await page.waitForTimeout(50);
    expect(browserIssues, `${route.path} emitted browser/runtime errors`).toEqual([]);

    // Framework development chrome is not part of the application and can cover
    // page content in full-page captures. Production has no such portal.
    await page.locator("nextjs-portal").evaluateAll((portals) => {
      for (const portal of portals) (portal as HTMLElement).style.display = "none";
    });
    const skipLink = page.locator(".skip-link");
    expect(await skipLink.evaluate((element) => element.matches(":focus"))).toBe(false);
    await skipLink.evaluate((element) => {
      // Chromium full-page stitching can paint off-canvas fixed elements at y=0.
      // The focus behavior is covered separately; this capture records idle state.
      (element as HTMLElement).style.visibility = "hidden";
    });
    // Chromium full-page stitching can relocate sticky elements into whichever
    // segment was active during capture. `static` preserves their normal-flow
    // position while preventing capture-only repetition or displacement.
    await neutralizeStickyElementsForFullPageCapture(page);

    const outputDirectory = path.join(ARTIFACT_ROOT, testInfo.project.name);
    await mkdir(outputDirectory, { recursive: true });
    const screenshot = await page.screenshot({
      path: path.join(outputDirectory, `${route.id}.png`),
      fullPage: true,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });
    const dimensions = readPngDimensions(screenshot);
    expect(dimensions.width, `${route.path} screenshot width`).toBe(viewport.width);
    expect(dimensions.height, `${route.path} screenshot must cover at least the viewport`).toBeGreaterThanOrEqual(
      viewport.height,
    );
  });
}
