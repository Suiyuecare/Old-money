import { expect, test, type Page } from "@playwright/test";

async function openFilters(page: Page) {
  const apparelFilter = page.getByRole("checkbox", { name: "服飾" });
  if (!(await apparelFilter.isVisible())) {
    if ((page.viewportSize()?.width ?? 0) <= 900) {
      await page.getByRole("button", { name: /^篩選商品/ }).click();
    } else {
      await page
        .getByRole("complementary", { name: "商品篩選" })
        .locator("summary")
        .click();
    }
  }
  await expect(apparelFilter).toBeVisible();
}

async function closeFiltersIfModal(page: Page) {
  const dialog = page.getByRole("dialog", { name: "篩選商品" });
  if (await dialog.isVisible()) {
    await dialog.getByRole("button", { name: /查看 \d+ 件選品/ }).click();
    await expect(dialog).toBeHidden();
  }
}

function catalogResults(page: Page) {
  return page.getByRole("region", { name: "找到 1 件選品" });
}

test("search query, filters, refresh, and browser history reproduce the same state", async ({
  page,
}) => {
  await page.goto("/shop");
  await page.goto("/search?ignored=yes&q=polo&category=apparel");

  await expect(page.getByRole("searchbox", { name: "搜尋 LIGNÉE 選品" })).toHaveValue(
    "polo",
  );
  await openFilters(page);
  await expect(page.getByRole("checkbox", { name: "服飾" })).toBeChecked();
  await expect(page.getByRole("region", { name: "找到 1 件選品" })).toBeVisible();

  await page
    .getByRole("complementary", { name: "商品篩選" })
    .getByText("男士", { exact: true })
    .click();
  await expect(page.getByRole("checkbox", { name: "男士" })).toBeChecked();
  await closeFiltersIfModal(page);
  await catalogResults(page).getByLabel("排序").selectOption("price-desc");

  await expect.poll(() => new URL(page.url()).searchParams.toString()).toBe(
    "q=polo&category=apparel&audience=men&sort=price-desc",
  );
  expect(new URL(page.url()).searchParams.has("ignored")).toBe(false);

  await page.reload();
  await openFilters(page);
  await expect(page.getByRole("searchbox", { name: "搜尋 LIGNÉE 選品" })).toHaveValue(
    "polo",
  );
  await expect(page.getByRole("checkbox", { name: "服飾" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "男士" })).toBeChecked();
  await expect(catalogResults(page).getByLabel("排序")).toHaveValue("price-desc");
  await expect(catalogResults(page)).toBeVisible();
  await closeFiltersIfModal(page);

  await page.goBack();
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.getByRole("heading", { name: "全部選品" })).toBeVisible();

  await page.goForward();
  await expect.poll(() => new URL(page.url()).searchParams.toString()).toBe(
    "q=polo&category=apparel&audience=men&sort=price-desc",
  );
  await openFilters(page);
  await expect(page.getByRole("checkbox", { name: "男士" })).toBeChecked();
  await expect(catalogResults(page).getByLabel("排序")).toHaveValue("price-desc");
});

test("desktop rapid search then facets and sort commit one current canonical query", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop query ordering");
  await page.goto("/search");
  await openFilters(page);

  const search = page.getByRole("searchbox", { name: "搜尋 LIGNÉE 選品" }).first();
  const filters = page.getByRole("complementary", { name: "商品篩選" }).first();
  const apparel = page.getByRole("checkbox", { name: "服飾" }).first();
  const men = page.getByRole("checkbox", { name: "男士" }).first();
  const sort = page.getByLabel("排序").first();

  await search.pressSequentially("polo", { delay: 25 });
  await filters.getByText("服飾", { exact: true }).click();
  await expect(apparel).toBeChecked();
  await filters.getByText("男士", { exact: true }).click();
  await expect(men).toBeChecked();
  await sort.focus();
  await sort.selectOption("price-desc");

  await expect.poll(() => new URL(page.url()).searchParams.toString()).toBe(
    "q=polo&category=apparel&audience=men&sort=price-desc",
  );
  await expect(page.getByRole("region", { name: "找到 1 件選品" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Field House Polo", exact: true })).toBeVisible();
  await expect(sort).toBeFocused();
});

test("desktop facets and sort survive rapid search followed by more facets", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop query ordering");
  await page.goto("/search");
  await openFilters(page);

  const filters = page.getByRole("complementary", { name: "商品篩選" }).first();
  const men = page.getByRole("checkbox", { name: "男士" }).first();
  const sort = page.getByLabel("排序").first();
  const search = page.getByRole("searchbox", { name: "搜尋 LIGNÉE 選品" }).first();
  const apparel = page.getByRole("checkbox", { name: "服飾" }).first();
  const firstLight = page
    .getByRole("checkbox", { name: "晨光落在田野" })
    .first();

  await filters.getByText("男士", { exact: true }).click();
  await expect(men).toBeChecked();
  await sort.selectOption("name-asc");
  await search.pressSequentially("polo", { delay: 25 });
  await filters.getByText("服飾", { exact: true }).click();
  await expect(apparel).toBeChecked();
  await filters.getByText("晨光落在田野", { exact: true }).click();
  await expect(firstLight).toBeChecked();

  await expect.poll(() => new URL(page.url()).searchParams.toString()).toBe(
    "q=polo&category=apparel&audience=men" +
      "&collection=first-light-in-the-field&sort=name-asc",
  );
  await expect(page.getByRole("region", { name: "找到 1 件選品" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Field House Polo", exact: true })).toBeVisible();
  await expect(firstLight).toBeFocused();
});

test("mobile filter sheet traps focus, closes with Escape, and restores focus", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile dialog behavior");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shop");

  const trigger = page.getByRole("button", { name: /篩選商品/ });
  await expect(trigger).toBeVisible();
  await expect(trigger).toContainText("全部");

  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "篩選商品" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "關閉篩選" })).toBeFocused();

  const filterControlIds = await dialog
    .locator('input[type="checkbox"][id]')
    .evaluateAll((controls) => controls.map((control) => control.id));
  expect(new Set(filterControlIds).size).toBe(filterControlIds.length);

  const focusable = dialog.locator(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  );
  const focusableCount = await focusable.count();
  expect(focusableCount).toBeGreaterThan(2);

  for (let index = 0; index < focusableCount + 2; index += 1) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() =>
        dialog.evaluate(
          (element) =>
            element === document.activeElement || element.contains(document.activeElement),
        ),
      )
      .toBe(true);
  }

  await dialog.getByText("服飾", { exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: "服飾" })).toBeChecked();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe("apparel");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText("1 個條件");
});
