import { describe, expect, it } from "vitest";

import { products } from "@/lib/catalog";
import {
  estateCollections,
  estateJournalEntries,
  footerNavigationGroups,
  primaryNavigation,
} from "@/lib/editorial";
import {
  getRouteManifestEntry,
  routeManifest,
  routeManifestByPath,
  visualQaRouteManifest,
} from "@/lib/route-manifest";

const staticRoutePaths = [
  "/",
  "/shop",
  "/men",
  "/women",
  "/accessories",
  "/home",
  "/stationery",
  "/search",
  "/collections",
  "/journal",
  "/wishlist",
  "/cart",
  "/checkout",
  "/checkout/complete",
  "/story",
  "/private-appointment",
  "/shipping-returns",
  "/privacy",
  "/terms",
] as const;

describe("reachable route manifest", () => {
  it("contains every static, product, collection, journal, and representative 404 route", () => {
    const expectedPaths = [
      ...staticRoutePaths,
      ...products.map((product) => `/product/${product.slug}`),
      ...estateCollections.map((collection) => collection.href),
      ...estateJournalEntries.map((entry) => entry.href),
      "/__lignee-route-not-found__",
    ];

    expect(routeManifest).toHaveLength(55);
    expect(routeManifest.map((route) => route.path)).toEqual(expectedPaths);
    expect(new Set(expectedPaths).size).toBe(expectedPaths.length);
  });

  it("derives every dynamic route from its canonical content record", () => {
    expect(
      routeManifest
        .filter((route) => route.kind === "product")
        .map((route) => route.sourceId),
    ).toEqual(products.map((product) => product.id));
    expect(
      routeManifest
        .filter((route) => route.kind === "collection")
        .map((route) => route.sourceId),
    ).toEqual(estateCollections.map((collection) => collection.id));
    expect(
      routeManifest
        .filter((route) => route.kind === "journal")
        .map((route) => route.sourceId),
    ).toEqual(estateJournalEntries.map((entry) => entry.id));
  });

  it("covers every internal link exposed by primary and footer navigation", () => {
    const navigationPaths = [
      ...primaryNavigation.map((item) => item.href),
      ...footerNavigationGroups.flatMap((group) => group.links.map((link) => link.href)),
    ];

    for (const path of navigationPaths) {
      expect(getRouteManifestEntry(path), `missing navigation route ${path}`).toBeDefined();
    }
  });

  it("uses stable, concrete, uniquely indexed paths and IDs", () => {
    expect(routeManifestByPath.size).toBe(routeManifest.length);
    expect(new Set(routeManifest.map((route) => route.id)).size).toBe(routeManifest.length);

    for (const route of routeManifest) {
      expect(route.path).toMatch(/^\/(?:[^?[\]#]+)?$/);
      expect(route.path === "/" || !route.path.endsWith("/"), route.path).toBe(true);
      expect(route.label.trim().length, route.path).toBeGreaterThan(0);
      expect(route.expectedStatus, route.path).toBe(
        route.kind === "not-found" ? 404 : 200,
      );
      expect(routeManifestByPath.get(route.path)).toBe(route);
    }
  });

  it("keeps every reachable page in visual QA scope", () => {
    expect(visualQaRouteManifest).toEqual(routeManifest);
  });
});
