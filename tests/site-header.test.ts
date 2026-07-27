// @vitest-environment jsdom

import { createElement } from "react";
import {
  cleanup,
  render,
  screen,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

const { categories, openCartDrawer } = vi.hoisted(() => ({
  categories: Array.from({ length: 10 }, (_, index) => ({
    code: `category-${index + 1}`,
    nameEn: `Category ${index + 1}`,
    nameZh: `分類 ${index + 1}`,
    description: `Category ${index + 1}`,
    routeSegment: `category-${index + 1}`,
    sortOrder: index + 1,
  })),
  openCartDrawer: vi.fn(),
}));

vi.mock("@/components/store/StoreProvider", () => ({
  useStore: () => ({
    cartItemCount: 0,
    categories,
    hydrated: true,
    openCartDrawer,
    wishlistCount: 0,
  }),
}));

import { SiteHeader } from "@/components/site/SiteHeader";

afterEach(() => {
  cleanup();
  openCartDrawer.mockReset();
});

describe("storefront site header", () => {
  it("renders every publication category in the desktop navigation", () => {
    render(createElement(SiteHeader));

    const desktopNavigation = screen.getByRole("navigation", {
      name: "主要導覽",
    });
    for (const category of categories) {
      expect(
        within(desktopNavigation).getByRole("link", {
          name: category.nameZh,
        }),
      ).toHaveAttribute(
        "href",
        `/category/${category.routeSegment}`,
      );
    }
    expect(within(desktopNavigation).getAllByRole("link")).toHaveLength(
      categories.length + 4,
    );
  });
});
