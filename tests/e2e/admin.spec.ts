import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("LIGNÉE Local Demo backoffice", () => {
  test("creates LIG-000051 and reaches the approved-media publication gate", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "The mutation story runs once.");
    test.setTimeout(180_000);

    const slug = "e2e-estate-weekend-coat";
    await page.goto("/admin/products/new");
    await expect(page.getByRole("heading", { name: "新增商品" })).toBeVisible();

    await page.getByLabel("英文名稱").fill("Estate Weekend Coat");
    await page.getByLabel("中文名稱").fill("莊園週末外套");
    await page.getByLabel("網址代稱").fill(slug);
    await page.getByLabel("商品種類").fill("outerwear");
    await page.getByLabel("分類").selectOption("apparel");
    await page.getByLabel("適用對象").selectOption("unisex");
    await page.getByLabel("Estate 篇章").selectOption("first-light-in-the-field");
    await page.getByLabel("商品描述").fill("用於驗證後台草稿、SKU、價格、庫存與發布隔離的商品。");
    await page.getByLabel("品牌故事").fill("一件為英國莊園週末散步設計的當代外套。");
    await page.getByLabel("尺寸說明").fill("One Size；正式尺寸需由實體樣品核准。");
    await page.getByLabel("照護方式").fill("專業乾洗；正式照護標示需由供應商核准。");
    await page.getByLabel("材質概念代碼").fill("wool-direction");
    await page.getByLabel("規格軸 JSON").fill(
      JSON.stringify([{
        key: "size",
        label: "尺寸",
        values: [{ value: "one-size", label: "One Size" }],
      }]),
    );
    await page.getByLabel("SEO 標題").fill("Estate Weekend Coat｜LIGNÉE");
    await page.getByLabel("SEO 描述").fill("LIGNÉE 莊園週末外套商品草稿。");
    await page.getByRole("button", { name: "建立商品草稿" }).click();

    await expect(page).toHaveURL(new RegExp(`/admin/products/${slug}\\?created=1$`));
    await expect(page.getByText("LIG-000051", { exact: true })).toBeVisible();
    await expect(page.getByText(/此商品尚未公開/)).toBeVisible();

    await page.goto(`/search?q=${slug}`);
    await expect(page.getByText("Estate Weekend Coat", { exact: true })).toHaveCount(0);
    await page.goto(`/admin/products/${slug}`);

    await page
      .getByRole("region", { name: "SKU 規格矩陣" })
      .locator("summary")
      .filter({ hasText: "新增 SKU" })
      .click();
    const newSku = page.locator("form").filter({
      has: page.getByRole("button", { name: "新增 SKU" }),
    });
    await newSku.getByLabel("Public ID").fill(`${slug}-one-size`);
    await newSku.getByLabel("SKU Code").fill("LIG-000051-01");
    await newSku.getByLabel("規格 JSON").fill('{"size":"One Size"}');
    await newSku.getByLabel("重量（g）").fill("850");
    await newSku.getByLabel("包裝長（mm）").fill("500");
    await newSku.getByLabel("包裝寬（mm）").fill("360");
    await newSku.getByLabel("包裝高（mm）").fill("120");
    await newSku.getByLabel("商品事實").selectOption("approved");
    await newSku.getByLabel("啟用此 SKU").check();
    await newSku.getByRole("button", { name: "新增 SKU" }).click();
    await expect(page.getByRole("rowheader", { name: /LIG-000051-01/ })).toBeVisible();

    await page.getByText("編輯 LIG-000051-01", { exact: true }).click();
    const priceForm = page.locator("form.admin-price-form");
    await priceForm.getByLabel("新含稅售價（TWD）").fill("26800");
    await priceForm.getByLabel("價格狀態").selectOption("approved");
    await priceForm.getByLabel("生效時間").fill("2026-01-01T00:00");
    await priceForm.getByRole("button", { name: "新增價格版本" }).click();
    await expect(priceForm.getByText(/新的價格版本已加入/)).toBeVisible();

    await page.goto("/admin/inventory?q=LIG-000051-01");
    const inventoryRow = page.getByRole("row").filter({ hasText: "LIG-000051-01" });
    await inventoryRow.getByLabel("LIG-000051-01 異動原因").selectOption("receiving");
    await inventoryRow.getByLabel("LIG-000051-01 異動數量").fill("5");
    await inventoryRow.getByRole("button", { name: "記錄" }).click();
    await expect(inventoryRow.getByText("庫存 movement 已記錄。")).toBeVisible();

    await page.goto(`/admin/products/${slug}`);
    const readinessRows = page.locator(".admin-readiness-row");
    await expect(readinessRows).toHaveCount(14);
    for (let index = 0; index < 14; index += 1) {
      const row = readinessRows.nth(index);
      await row.locator("select[name=state]").selectOption("passed");
      await row.locator("input[name=evidenceReference]").fill(`e2e://gate-${index + 1}`);
      await row.getByRole("button", { name: "更新" }).click();
      await expect(row.getByText("發布檢查已更新。")).toBeVisible();
    }
    await expect(page.getByText("14 / 14", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "發布商品" }).click();
    await expect(page.getByText("商品需要完成核准的主圖。")).toBeVisible();
    await expect(page.getByText("APPROVED_MAIN_MEDIA_REQUIRED")).toBeVisible();
    await expect(page.getByText(/此商品尚未公開/)).toBeVisible();

    await page.goto(`/search?q=${slug}`);
    await expect(page.getByText("Estate Weekend Coat", { exact: true })).toHaveCount(0);
  });

  test("owner completes media review, approval and safe revocation restore", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "The mutation story runs once.");
    test.setTimeout(90_000);

    await page.goto("/admin/products/moorland-wax-jacket");
    const mediaDisclosure = page.locator("details.admin-disclosure").filter({
      has: page.locator("summary").filter({ hasText: "主圖" }),
    });
    await mediaDisclosure.locator("summary").click();
    await expect(mediaDisclosure.getByText("待審核 · v1", { exact: true })).toBeVisible();

    const returnForm = mediaDisclosure.locator("form.admin-media-transition").filter({
      has: page.getByRole("button", { name: "退回草稿" }),
    });
    await returnForm.getByLabel("操作原因").fill("重新檢查商品裁切與焦點");
    await returnForm.getByRole("button", { name: "退回草稿" }).click();
    await expect(mediaDisclosure.getByText("草稿 · v2", { exact: true })).toBeVisible();

    await mediaDisclosure.getByRole("button", { name: "送交審核" }).click();
    await expect(mediaDisclosure.getByText("待審核 · v3", { exact: true })).toBeVisible();

    const approvalForm = mediaDisclosure.locator("form.admin-media-transition").filter({
      has: page.getByRole("button", { name: "核准上線" }),
    });
    await approvalForm.getByLabel("已確認私有原圖與所有衍生圖完成備份").check();
    await approvalForm.getByRole("button", { name: "核准上線" }).click();
    await expect(mediaDisclosure.getByText("已核准上線 · v4", { exact: true })).toBeVisible();

    const pendingForm = mediaDisclosure.locator("form.admin-media-transition").filter({
      has: page.getByRole("button", { name: "提出撤銷" }),
    });
    await pendingForm.getByLabel("操作原因").fill("暫停公開以重新確認圖片授權");
    await pendingForm.getByRole("button", { name: "提出撤銷" }).click();
    await expect(mediaDisclosure.getByText("撤銷確認中 · v5", { exact: true })).toBeVisible();

    const restoreForm = mediaDisclosure.locator("form.admin-media-transition").filter({
      has: page.getByRole("button", { name: "恢復上線" }),
    });
    await restoreForm.getByLabel("操作原因").fill("授權文件已完成重新確認");
    await restoreForm.getByRole("button", { name: "恢復上線" }).click();
    await expect(mediaDisclosure.getByText("已核准上線 · v6", { exact: true })).toBeVisible();
  });

  test("Owner recovery entry is self-bound and clearly disabled in Demo", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Recovery entry coverage runs once.");
    await page.goto("/admin/recovery");

    await expect(
      page.getByRole("heading", { name: "Owner 安全復原" }),
    ).toBeVisible();
    await expect(page.getByText("demo@estatelignee.com")).toBeVisible();
    await expect(page.locator('input[name="targetUserId"]')).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "提出本人復原申請" }),
    ).toBeDisabled();
    await expect(
      page.getByText("本機 Demo 不會建立真實 Auth 復原申請。"),
    ).toBeVisible();
  });

  test("390px admin drawer is keyboard-operable and axe-clean", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile admin coverage.");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin");

    const trigger = page.locator(".admin-menu-button");
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("navigation", { name: "後台主要導覽" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
