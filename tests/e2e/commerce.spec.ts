import { expect, test, type Page } from "@playwright/test";

async function seedCart(
  page: Page,
  lines: readonly { readonly skuId: string; readonly quantity: number }[],
) {
  // Use a same-origin non-React document so StoreProvider cannot race the seed
  // with its canonical empty-state persistence effect.
  await page.goto("/robots.txt");
  await page.evaluate((seedLines) => {
    window.localStorage.setItem(
      "lignee:cart",
      JSON.stringify({ version: 1, lines: seedLines }),
    );
  }, lines);
}

test.describe("prototype commerce story", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("home to guarded PDP, cart drawer, checkout completion, then invalid refresh", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Made to\s*Be Inherited\./i }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Field House Polo", exact: true }).click();
    await expect(page).toHaveURL(/\/product\/field-house-polo$/);
    await expect(page.getByRole("heading", { name: "Field House Polo" })).toBeVisible();

    const addButton = page.getByRole("button", { name: "加入購物車" });
    await expect(addButton).toBeEnabled();
    await addButton.click();

    const missingOptions = page
      .getByRole("alert")
      .filter({ hasText: "請先完成規格選擇" });
    await expect(missingOptions).toContainText("請先完成規格選擇");
    await expect(missingOptions).toBeFocused();

    // Every invalid attempt must refocus the summary, not only the first one.
    await addButton.click();
    await expect(missingOptions).toBeFocused();

    await page.getByRole("radio", { name: "M", exact: true }).check();
    await page.getByRole("radio", { name: "深橄欖", exact: true }).check();
    await expect(page.getByText(/已選定：M · 深橄欖/)).toBeVisible();
    await addButton.click();

    const drawer = page.getByRole("dialog", { name: "購物袋" });
    await expect(drawer).toBeVisible();
    const closeDrawer = page.getByRole("button", { name: "關閉購物袋" });
    await expect(closeDrawer).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(addButton).toBeFocused();

    await page.getByRole("link", { name: "前往查看" }).click();
    await expect(page.getByRole("heading", { name: "購物袋", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "前往模擬結帳" }).click();

    await expect(page.getByRole("heading", { name: "配送資料示意" })).toBeFocused();
    await page.getByRole("button", { name: "繼續付款規劃" }).click();
    await expect(page.getByRole("heading", { name: "付款方式規劃" })).toBeFocused();
    await page.getByRole("radio", { name: /信用卡（正式版規劃）/ }).check();
    await page.getByRole("button", { name: "檢視概念摘要" }).click();
    await expect(page.getByRole("heading", { name: "確認概念摘要" })).toBeFocused();
    await page.getByRole("button", { name: "完成模擬結帳" }).click();

    await expect(page).toHaveURL(/\/checkout\/complete$/);
    await expect(page.getByRole("heading", { name: "模擬結帳已完成" })).toBeVisible();
    await expect(page.getByText(/沒有傳送個資、沒有扣款/)).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem("lignee:cart")),
      )
      .toBe('{"version":1,"lines":[]}');

    await page.reload();
    await expect(page.getByRole("heading", { name: "沒有真實訂單" })).toBeVisible();
  });

  test("invalid persisted cart and wishlist entries are discarded safely", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "lignee:cart",
        JSON.stringify({
          version: 1,
          lines: [
            { skuId: "not-a-real-sku", quantity: 1 },
            { skuId: "field-house-polo-m-deep-olive", quantity: 99 },
          ],
        }),
      );
      window.localStorage.setItem(
        "lignee:wishlist",
        JSON.stringify({ version: 1, productIds: ["not-a-real-product"] }),
      );
    });

    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "購物袋仍是空的" })).toBeVisible();
    await expect(page.getByText(/部分購物車與收藏資料無效/)).toContainText("安全重設");

    await expect
      .poll(() =>
        page.evaluate(() => ({
          cart: window.localStorage.getItem("lignee:cart"),
          wishlist: window.localStorage.getItem("lignee:wishlist"),
        })),
      )
      .toEqual({
        cart: '{"version":1,"lines":[]}',
        wishlist: '{"version":1,"productIds":[]}',
      });
  });

  test("empty and direct checkout routes remain guarded", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "目前沒有可結帳的商品" })).toBeVisible();

    await page.goto("/checkout/complete");
    await expect(page.getByRole("heading", { name: "沒有真實訂單" })).toBeVisible();
    await expect(page.getByText(/不能建立或找回訂單/)).toBeVisible();
  });

  test("shipping presentation changes from charged below threshold to free at NT$12,000", async ({
    page,
  }) => {
    await seedCart(page, [
      { skuId: "field-house-polo-m-deep-olive", quantity: 1 },
      { skuId: "correspondence-pen-satin-black", quantity: 1 },
    ]);
    await page.goto("/cart");

    const belowThreshold = page.getByRole("complementary", {
      name: "本次概念選品",
    });
    await expect(belowThreshold.getByText("再選購 NT$400 即享免運")).toBeVisible();
    await expect(belowThreshold.getByText("NT$250", { exact: true })).toBeVisible();

    await seedCart(page, [
      { skuId: "long-table-tie-claret", quantity: 1 },
      { skuId: "evening-sheer-tights-s-m-smoke", quantity: 1 },
    ]);
    await page.goto("/cart");

    const atThreshold = page.getByRole("complementary", {
      name: "本次概念選品",
    });
    await expect(atThreshold.getByText("已享台灣地區免運")).toBeVisible();
    await expect(atThreshold.getByText("免運", { exact: true })).toBeVisible();
  });

  test("valid cart changes synchronize across open tabs", async ({ context, page }) => {
    const otherPage = await context.newPage();
    await Promise.all([
      page.goto("/product/field-house-polo"),
      otherPage.goto("/"),
    ]);

    await page.getByRole("radio", { name: "M", exact: true }).check();
    await page.getByRole("radio", { name: "深橄欖", exact: true }).check();
    await page.getByRole("button", { name: "加入購物車" }).click();

    const syncedBag = otherPage.getByRole("button", {
      name: /開啟購物袋，共 1 件/,
    });
    await expect(syncedBag).toBeVisible();
    await syncedBag.click();
    await otherPage.getByRole("button", { name: /移除 Field House Polo/ }).click();
    await expect(
      page.getByRole("button", { name: /開啟購物袋，共 0 件/ }),
    ).toBeVisible();

    await otherPage.close();
  });

  test("the full guarded checkout can be completed with the keyboard", async ({ page }) => {
    await seedCart(page, [
      { skuId: "field-house-polo-m-deep-olive", quantity: 1 },
    ]);
    await page.goto("/checkout");

    const detailsSubmit = page.getByRole("button", { name: "繼續付款規劃" });
    await detailsSubmit.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "付款方式規劃" })).toBeFocused();

    const cardChoice = page.getByRole("radio", { name: /信用卡（正式版規劃）/ });
    await cardChoice.focus();
    await page.keyboard.press("Space");
    const reviewSubmit = page.getByRole("button", { name: "檢視概念摘要" });
    await reviewSubmit.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "確認概念摘要" })).toBeFocused();

    const complete = page.getByRole("button", { name: "完成模擬結帳" });
    await complete.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "模擬結帳已完成" })).toBeVisible();
  });
});
