"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import {
  getEffectiveSkuPrice,
  getProductById,
  getSkuById,
  type Product,
  type ProductImage,
  type ProductOptionKey,
  type SKU,
} from "@/lib/catalog";

export const CART_STORAGE_KEY = "lignee:cart";
export const WISHLIST_STORAGE_KEY = "lignee:wishlist";
export const FREE_SHIPPING_THRESHOLD_TWD = 12_000;
export const STANDARD_SHIPPING_TWD = 250;
export const MIN_CART_QUANTITY = 1;
export const MAX_CART_QUANTITY = 9;

/** Pure subtotal boundary used by the provider and commerce-state tests. */
export const getShippingTwdForSubtotal = (subtotalTwd: number): number =>
  subtotalTwd === 0 || subtotalTwd >= FREE_SHIPPING_THRESHOLD_TWD
    ? 0
    : STANDARD_SHIPPING_TWD;

export interface PersistedCartLine {
  readonly skuId: string;
  readonly quantity: number;
}

export interface PersistedCartState {
  readonly version: 1;
  readonly lines: readonly PersistedCartLine[];
}

export interface PersistedWishlistState {
  readonly version: 1;
  readonly productIds: readonly string[];
}

export interface CartLineOptionViewModel {
  readonly key: ProductOptionKey;
  readonly label: string;
  readonly value: string;
  readonly valueLabel: string;
}

/**
 * A cart line resolved entirely from the canonical catalog. Nothing except the
 * SKU id and quantity is trusted from browser storage.
 */
export interface CartLineViewModel {
  readonly skuId: string;
  readonly productId: string;
  readonly productSlug: string;
  readonly name: string;
  readonly subtitle: string;
  readonly image: ProductImage;
  readonly imagePath: string;
  readonly imageAlt: string;
  readonly options: readonly CartLineOptionViewModel[];
  readonly quantity: number;
  readonly unitPriceTwd: number;
  /** Alias for consumers that use the shorter price name. */
  readonly priceTwd: number;
  readonly lineTotalTwd: number;
  readonly sku: SKU;
  readonly product: Product;
}

export interface StoreContextValue {
  /** False during SSR and the first client render. */
  readonly hydrated: boolean;
  readonly cartLines: readonly CartLineViewModel[];
  /** Sum of quantities across cart lines. */
  readonly cartItemCount: number;
  /** Alias of cartItemCount. */
  readonly cartCount: number;
  readonly subtotalTwd: number;
  readonly shippingTwd: number;
  readonly totalTwd: number;
  readonly freeShippingThresholdTwd: number;
  readonly amountUntilFreeShippingTwd: number;
  readonly wishlistProductIds: readonly string[];
  readonly wishlistProducts: readonly Product[];
  readonly wishlistCount: number;
  readonly announcement: string;
  readonly announcementId: number;
  readonly cartDrawerOpen: boolean;
  readonly addToCart: (skuId: string, quantity?: number) => boolean;
  readonly updateCartQuantity: (skuId: string, quantity: number) => void;
  readonly removeFromCart: (skuId: string) => void;
  readonly clearCart: () => void;
  readonly isWishlisted: (productId: string) => boolean;
  readonly addToWishlist: (productId: string) => boolean;
  readonly removeFromWishlist: (productId: string) => void;
  readonly toggleWishlist: (productId: string) => boolean;
  readonly openCartDrawer: () => void;
  readonly closeCartDrawer: () => void;
  readonly setCartDrawerOpen: (open: boolean) => void;
}

export interface DecodeResult<T> {
  readonly valid: boolean;
  readonly value: T;
  readonly repairedEntries: number;
}

interface AnnouncementState {
  readonly text: string;
  readonly id: number;
}

const EMPTY_CART: PersistedCartState = { version: 1, lines: [] };
const EMPTY_WISHLIST: PersistedWishlistState = { version: 1, productIds: [] };

const StoreContext = createContext<StoreContextValue | null>(null);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isValidQuantity = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= MIN_CART_QUANTITY &&
  value <= MAX_CART_QUANTITY;

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
};

export const decodeCart = (raw: string | null): DecodeResult<PersistedCartState> => {
  if (raw === null) return { valid: true, value: EMPTY_CART, repairedEntries: 0 };

  const candidate = parseJson(raw);
  if (!isRecord(candidate) || candidate.version !== 1 || !Array.isArray(candidate.lines)) {
    return { valid: false, value: EMPTY_CART, repairedEntries: 0 };
  }

  const quantitiesBySku = new Map<string, number>();
  let repairedEntries = 0;

  for (const candidateLine of candidate.lines) {
    if (
      !isRecord(candidateLine) ||
      typeof candidateLine.skuId !== "string" ||
      !isValidQuantity(candidateLine.quantity) ||
      getSkuById(candidateLine.skuId) === undefined
    ) {
      repairedEntries += 1;
      continue;
    }

    const currentQuantity = quantitiesBySku.get(candidateLine.skuId);
    if (currentQuantity !== undefined) {
      repairedEntries += 1;
      quantitiesBySku.set(
        candidateLine.skuId,
        Math.min(MAX_CART_QUANTITY, currentQuantity + candidateLine.quantity),
      );
      continue;
    }

    quantitiesBySku.set(candidateLine.skuId, candidateLine.quantity);
  }

  return {
    valid: true,
    value: {
      version: 1,
      lines: Array.from(quantitiesBySku, ([skuId, quantity]) => ({ skuId, quantity })),
    },
    repairedEntries,
  };
};

export const decodeWishlist = (raw: string | null): DecodeResult<PersistedWishlistState> => {
  if (raw === null) return { valid: true, value: EMPTY_WISHLIST, repairedEntries: 0 };

  const candidate = parseJson(raw);
  if (!isRecord(candidate) || candidate.version !== 1 || !Array.isArray(candidate.productIds)) {
    return { valid: false, value: EMPTY_WISHLIST, repairedEntries: 0 };
  }

  const productIds = new Set<string>();
  let repairedEntries = 0;

  for (const productId of candidate.productIds) {
    if (typeof productId !== "string" || getProductById(productId) === undefined) {
      repairedEntries += 1;
      continue;
    }
    if (productIds.has(productId)) {
      repairedEntries += 1;
      continue;
    }
    productIds.add(productId);
  }

  return {
    valid: true,
    value: { version: 1, productIds: Array.from(productIds) },
    repairedEntries,
  };
};

const readStorage = (key: string): { readonly available: boolean; readonly raw: string | null } => {
  if (typeof window === "undefined") return { available: false, raw: null };

  try {
    return { available: true, raw: window.localStorage.getItem(key) };
  } catch {
    return { available: false, raw: null };
  }
};

const writeStorage = (key: string, value: unknown): boolean => {
  if (typeof window === "undefined") return false;

  try {
    const serialized = JSON.stringify(value);
    // Avoid redundant cross-tab events and feedback after a synchronized write.
    if (window.localStorage.getItem(key) !== serialized) {
      window.localStorage.setItem(key, serialized);
    }
    return true;
  } catch {
    // React state remains authoritative for this tab when storage is blocked.
    return false;
  }
};

export const resolveCartLine = (
  line: PersistedCartLine,
): CartLineViewModel | undefined => {
  const sku = getSkuById(line.skuId);
  if (!sku) return undefined;

  const product = getProductById(sku.productId);
  const unitPriceTwd = getEffectiveSkuPrice(sku);
  if (!product || unitPriceTwd === undefined) return undefined;

  const options = product.optionAxes.flatMap<CartLineOptionViewModel>((axis) => {
    const value = sku.options[axis.key];
    if (value === undefined) return [];

    const valueLabel = axis.values.find((option) => option.value === value)?.label ?? value;
    return [{ key: axis.key, label: axis.label, value, valueLabel }];
  });

  return {
    skuId: sku.id,
    productId: product.id,
    productSlug: product.slug,
    name: product.name,
    subtitle: product.subtitle,
    image: product.image,
    imagePath: product.image.path,
    imageAlt: product.image.alt,
    options,
    quantity: line.quantity,
    unitPriceTwd,
    priceTwd: unitPriceTwd,
    lineTotalTwd: unitPriceTwd * line.quantity,
    sku,
    product,
  };
};

export function StoreProvider({ children }: PropsWithChildren) {
  const [cartState, setCartState] = useState<PersistedCartState>(EMPTY_CART);
  const [wishlistState, setWishlistState] =
    useState<PersistedWishlistState>(EMPTY_WISHLIST);
  const [hydrated, setHydrated] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpenState] = useState(false);
  const [announcementState, setAnnouncementState] = useState<AnnouncementState>({
    text: "",
    id: 0,
  });

  const cartStateRef = useRef(cartState);
  const wishlistStateRef = useRef(wishlistState);
  const externalCartSnapshotRef = useRef<string | null>(null);
  const externalWishlistSnapshotRef = useRef<string | null>(null);

  const commitCart = useCallback((next: PersistedCartState) => {
    cartStateRef.current = next;
    setCartState(next);
  }, []);

  const commitWishlist = useCallback((next: PersistedWishlistState) => {
    wishlistStateRef.current = next;
    setWishlistState(next);
  }, []);

  const announce = useCallback((text: string) => {
    setAnnouncementState((current) => ({ text, id: current.id + 1 }));
  }, []);

  useEffect(() => {
    let active = true;

    const handleStorage = (event: StorageEvent) => {
      try {
        if (event.storageArea !== null && event.storageArea !== window.localStorage) return;
      } catch {
        return;
      }

      if (event.key === null) {
        externalCartSnapshotRef.current = JSON.stringify(EMPTY_CART);
        externalWishlistSnapshotRef.current = JSON.stringify(EMPTY_WISHLIST);
        commitCart(EMPTY_CART);
        commitWishlist(EMPTY_WISHLIST);
        announce("購物車與收藏已在另一個分頁清空。");
        return;
      }

      if (event.key === CART_STORAGE_KEY) {
        const decoded = decodeCart(event.newValue);
        if (!decoded.valid) {
          announce("另一個分頁送出的購物車資料無效，已保留目前內容。");
          return;
        }
        if (decoded.repairedEntries === 0) {
          // A storage event is already the persisted write. Suppressing the
          // matching effect prevents an older queued event being written back
          // as if it were a newer local edit.
          externalCartSnapshotRef.current = JSON.stringify(decoded.value);
        }
        commitCart(decoded.value);
        if (decoded.repairedEntries > 0) {
          announce("部分購物車資料已失效，已安全移除。");
        }
      }

      if (event.key === WISHLIST_STORAGE_KEY) {
        const decoded = decodeWishlist(event.newValue);
        if (!decoded.valid) {
          announce("另一個分頁送出的收藏資料無效，已保留目前內容。");
          return;
        }
        if (decoded.repairedEntries === 0) {
          externalWishlistSnapshotRef.current = JSON.stringify(decoded.value);
        }
        commitWishlist(decoded.value);
        if (decoded.repairedEntries > 0) {
          announce("部分收藏資料已失效，已安全移除。");
        }
      }
    };

    window.addEventListener("storage", handleStorage);

    // Defer state updates out of the effect body while preserving an empty SSR
    // snapshot and an identical first client render.
    queueMicrotask(() => {
      if (!active) return;

      const storedCart = readStorage(CART_STORAGE_KEY);
      const storedWishlist = readStorage(WISHLIST_STORAGE_KEY);
      const decodedCart = decodeCart(storedCart.raw);
      const decodedWishlist = decodeWishlist(storedWishlist.raw);

      commitCart(decodedCart.valid ? decodedCart.value : EMPTY_CART);
      commitWishlist(decodedWishlist.valid ? decodedWishlist.value : EMPTY_WISHLIST);
      setHydrated(true);

      const cartWasRepaired = !decodedCart.valid || decodedCart.repairedEntries > 0;
      const wishlistWasRepaired =
        !decodedWishlist.valid || decodedWishlist.repairedEntries > 0;

      if (cartWasRepaired && wishlistWasRepaired) {
        announce("部分購物車與收藏資料無效，已安全重設。");
      } else if (cartWasRepaired) {
        announce("部分購物車資料已失效，已安全移除。");
      } else if (wishlistWasRepaired) {
        announce("部分收藏資料已失效，已安全移除。");
      }
    });

    return () => {
      active = false;
      window.removeEventListener("storage", handleStorage);
    };
  }, [announce, commitCart, commitWishlist]);

  useEffect(() => {
    if (!hydrated) return;
    const serialized = JSON.stringify(cartState);
    if (externalCartSnapshotRef.current === serialized) {
      externalCartSnapshotRef.current = null;
      return;
    }
    externalCartSnapshotRef.current = null;
    writeStorage(CART_STORAGE_KEY, cartState);
  }, [cartState, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const serialized = JSON.stringify(wishlistState);
    if (externalWishlistSnapshotRef.current === serialized) {
      externalWishlistSnapshotRef.current = null;
      return;
    }
    externalWishlistSnapshotRef.current = null;
    writeStorage(WISHLIST_STORAGE_KEY, wishlistState);
  }, [hydrated, wishlistState]);

  const addToCart = useCallback(
    (skuId: string, quantity = 1): boolean => {
      if (!hydrated) {
        announce("購物資料仍在載入，請稍候再試。");
        return false;
      }
      if (!isValidQuantity(quantity)) {
        announce(`商品數量須介於 ${MIN_CART_QUANTITY} 至 ${MAX_CART_QUANTITY} 件。`);
        return false;
      }

      const sku = getSkuById(skuId);
      const product = sku ? getProductById(sku.productId) : undefined;
      if (!sku || !product) {
        announce("此商品規格已不存在，未加入購物車。");
        return false;
      }

      const current = cartStateRef.current;
      const existing = current.lines.find((line) => line.skuId === skuId);
      const nextQuantity = Math.min(
        MAX_CART_QUANTITY,
        (existing?.quantity ?? 0) + quantity,
      );
      const nextLines = existing
        ? current.lines.map((line) =>
            line.skuId === skuId ? { skuId, quantity: nextQuantity } : line,
          )
        : [...current.lines, { skuId, quantity: nextQuantity }];

      commitCart({ version: 1, lines: nextLines });
      setCartDrawerOpenState(true);
      announce(`${product.name} 已加入購物車，共 ${nextQuantity} 件。`);
      return true;
    },
    [announce, commitCart, hydrated],
  );

  const updateCartQuantity = useCallback(
    (skuId: string, quantity: number) => {
      if (!isValidQuantity(quantity)) {
        announce(`商品數量須介於 ${MIN_CART_QUANTITY} 至 ${MAX_CART_QUANTITY} 件。`);
        return;
      }

      const current = cartStateRef.current;
      if (!current.lines.some((line) => line.skuId === skuId)) return;

      commitCart({
        version: 1,
        lines: current.lines.map((line) =>
          line.skuId === skuId ? { skuId, quantity } : line,
        ),
      });
      const productName = getProductById(getSkuById(skuId)?.productId ?? "")?.name ?? "商品";
      announce(`${productName} 的數量已更新為 ${quantity} 件。`);
    },
    [announce, commitCart],
  );

  const removeFromCart = useCallback(
    (skuId: string) => {
      const current = cartStateRef.current;
      if (!current.lines.some((line) => line.skuId === skuId)) return;

      const productName = getProductById(getSkuById(skuId)?.productId ?? "")?.name ?? "商品";
      commitCart({
        version: 1,
        lines: current.lines.filter((line) => line.skuId !== skuId),
      });
      announce(`${productName} 已從購物車移除。`);
    },
    [announce, commitCart],
  );

  const clearCart = useCallback(() => {
    if (cartStateRef.current.lines.length === 0) return;
    commitCart(EMPTY_CART);
    setCartDrawerOpenState(false);
    announce("購物車已清空。");
  }, [announce, commitCart]);

  const isWishlisted = useCallback(
    (productId: string): boolean => wishlistState.productIds.includes(productId),
    [wishlistState.productIds],
  );

  const addToWishlist = useCallback(
    (productId: string): boolean => {
      if (!hydrated) {
        announce("收藏資料仍在載入，請稍候再試。");
        return false;
      }

      const product = getProductById(productId);
      if (!product) {
        announce("此商品已不存在，未加入收藏。");
        return false;
      }

      const current = wishlistStateRef.current;
      if (current.productIds.includes(productId)) return true;

      commitWishlist({ version: 1, productIds: [...current.productIds, productId] });
      announce(`${product.name} 已加入收藏。`);
      return true;
    },
    [announce, commitWishlist, hydrated],
  );

  const removeFromWishlist = useCallback(
    (productId: string) => {
      const current = wishlistStateRef.current;
      if (!current.productIds.includes(productId)) return;

      commitWishlist({
        version: 1,
        productIds: current.productIds.filter((id) => id !== productId),
      });
      announce(`${getProductById(productId)?.name ?? "商品"} 已從收藏移除。`);
    },
    [announce, commitWishlist],
  );

  const toggleWishlist = useCallback(
    (productId: string): boolean => {
      const current = wishlistStateRef.current;
      if (current.productIds.includes(productId)) {
        removeFromWishlist(productId);
        return false;
      }
      return addToWishlist(productId);
    },
    [addToWishlist, removeFromWishlist],
  );

  const openCartDrawer = useCallback(() => setCartDrawerOpenState(true), []);
  const closeCartDrawer = useCallback(() => setCartDrawerOpenState(false), []);
  const setCartDrawerOpen = useCallback(
    (open: boolean) => setCartDrawerOpenState(open),
    [],
  );

  const cartLines = useMemo(
    () =>
      cartState.lines.flatMap<CartLineViewModel>((line) => {
        const resolved = resolveCartLine(line);
        return resolved ? [resolved] : [];
      }),
    [cartState.lines],
  );

  const wishlistProducts = useMemo(
    () =>
      wishlistState.productIds.flatMap<Product>((productId) => {
        const product = getProductById(productId);
        return product ? [product] : [];
      }),
    [wishlistState.productIds],
  );

  const cartItemCount = useMemo(
    () => cartLines.reduce((total, line) => total + line.quantity, 0),
    [cartLines],
  );
  const subtotalTwd = useMemo(
    () => cartLines.reduce((total, line) => total + line.lineTotalTwd, 0),
    [cartLines],
  );
  const shippingTwd = getShippingTwdForSubtotal(subtotalTwd);
  const amountUntilFreeShippingTwd = Math.max(
    0,
    FREE_SHIPPING_THRESHOLD_TWD - subtotalTwd,
  );

  const value = useMemo<StoreContextValue>(
    () => ({
      hydrated,
      cartLines,
      cartItemCount,
      cartCount: cartItemCount,
      subtotalTwd,
      shippingTwd,
      totalTwd: subtotalTwd + shippingTwd,
      freeShippingThresholdTwd: FREE_SHIPPING_THRESHOLD_TWD,
      amountUntilFreeShippingTwd,
      wishlistProductIds: wishlistState.productIds,
      wishlistProducts,
      wishlistCount: wishlistProducts.length,
      announcement: announcementState.text,
      announcementId: announcementState.id,
      cartDrawerOpen,
      addToCart,
      updateCartQuantity,
      removeFromCart,
      clearCart,
      isWishlisted,
      addToWishlist,
      removeFromWishlist,
      toggleWishlist,
      openCartDrawer,
      closeCartDrawer,
      setCartDrawerOpen,
    }),
    [
      addToCart,
      addToWishlist,
      amountUntilFreeShippingTwd,
      announcementState,
      cartDrawerOpen,
      cartItemCount,
      cartLines,
      clearCart,
      closeCartDrawer,
      hydrated,
      isWishlisted,
      openCartDrawer,
      removeFromCart,
      removeFromWishlist,
      setCartDrawerOpen,
      shippingTwd,
      subtotalTwd,
      toggleWishlist,
      updateCartQuantity,
      wishlistProducts,
      wishlistState.productIds,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used within StoreProvider.");
  return store;
}

/** Convenience hook for components that only need the hydration gate. */
export function useStoreHydrated(): boolean {
  return useStore().hydrated;
}
