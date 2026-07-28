import {
  parsePublicCatalogSnapshot,
  type PublicCatalogSnapshot,
  type PublishedProduct,
  type PublishedSKU,
} from "./contracts";
import { createCatalogContentDigest } from "./digest";
import { createEstateNo01Snapshot } from "./estate-no01";

export type CatalogSource = "static" | "compare" | "database";

export interface CatalogRepository {
  readSnapshot(): Promise<PublicCatalogSnapshot>;
  listPublished(): Promise<readonly PublishedProduct[]>;
  findPublishedProductBySlug(
    slug: string,
  ): Promise<PublishedProduct | undefined>;
  findCurrentSku(skuId: string): Promise<PublishedSKU | undefined>;
}

export class CatalogRuntimeError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CatalogRuntimeError";
    this.code = code;
    this.status = 503;
  }
}

abstract class SnapshotBackedCatalogRepository
  implements CatalogRepository
{
  abstract readSnapshot(): Promise<PublicCatalogSnapshot>;

  async listPublished(): Promise<readonly PublishedProduct[]> {
    return (await this.readSnapshot()).products;
  }

  async findPublishedProductBySlug(
    slug: string,
  ): Promise<PublishedProduct | undefined> {
    return (await this.readSnapshot()).products.find(
      (product) => product.slug === slug,
    );
  }

  async findCurrentSku(skuId: string): Promise<PublishedSKU | undefined> {
    return (await this.readSnapshot()).skus.find((sku) => sku.id === skuId);
  }
}

export class StaticCatalogRepository extends SnapshotBackedCatalogRepository {
  readonly #snapshot: PublicCatalogSnapshot;

  constructor(snapshot: PublicCatalogSnapshot = createEstateNo01Snapshot()) {
    super();
    this.#snapshot = parsePublicCatalogSnapshot(snapshot);
  }

  async readSnapshot(): Promise<PublicCatalogSnapshot> {
    return this.#snapshot;
  }
}

export type CatalogSnapshotLoader = () => Promise<unknown>;

export class SupabaseCatalogRepository extends SnapshotBackedCatalogRepository {
  readonly #load: CatalogSnapshotLoader;

  constructor(load: CatalogSnapshotLoader) {
    super();
    this.#load = load;
  }

  async readSnapshot(): Promise<PublicCatalogSnapshot> {
    let candidate: unknown;
    try {
      candidate = await this.#load();
    } catch (error) {
      if (error instanceof CatalogRuntimeError) throw error;
      throw new CatalogRuntimeError(
        "CATALOG_DATABASE_UNAVAILABLE",
        "The published catalog is temporarily unavailable.",
        { cause: error },
      );
    }

    try {
      return parsePublicCatalogSnapshot(candidate);
    } catch (error) {
      throw new CatalogRuntimeError(
        "CATALOG_SNAPSHOT_INVALID",
        "The published catalog failed its versioned contract.",
        { cause: error },
      );
    }
  }
}

export class CompareCatalogRepository extends SnapshotBackedCatalogRepository {
  readonly #staticRepository: CatalogRepository;
  readonly #databaseRepository: CatalogRepository;

  constructor(input: {
    readonly staticRepository: CatalogRepository;
    readonly databaseRepository: CatalogRepository;
  }) {
    super();
    this.#staticRepository = input.staticRepository;
    this.#databaseRepository = input.databaseRepository;
  }

  async readSnapshot(): Promise<PublicCatalogSnapshot> {
    const [staticSnapshot, databaseSnapshot] = await Promise.all([
      this.#staticRepository.readSnapshot(),
      this.#databaseRepository.readSnapshot(),
    ]);
    const staticDigest = createCatalogContentDigest(staticSnapshot);
    const databaseDigest = createCatalogContentDigest(databaseSnapshot);
    if (staticDigest !== databaseDigest) {
      throw new CatalogRuntimeError(
        "CATALOG_PARITY_MISMATCH",
        "The database catalog does not match the locked migration fixture.",
      );
    }

    // Compare mode serves the database result only after exact content parity.
    // It never treats the static fixture as an availability fallback.
    return databaseSnapshot;
  }
}

function isLocalOrPreview(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return (
    env.NODE_ENV !== "production" ||
    env.VERCEL_ENV === "preview" ||
    env.VERCEL_ENV === "development"
  );
}

export function resolveCatalogSource(
  env: Readonly<Record<string, string | undefined>> = process.env,
): CatalogSource {
  const requested = env.LIGNEE_CATALOG_SOURCE;
  if (
    requested !== undefined &&
    requested !== "static" &&
    requested !== "compare" &&
    requested !== "database"
  ) {
    throw new CatalogRuntimeError(
      "CATALOG_SOURCE_INVALID",
      "LIGNEE_CATALOG_SOURCE must be static, compare, or database.",
    );
  }
  const source =
    requested ?? (isLocalOrPreview(env) ? "static" : "database");
  if (source === "static" && !isLocalOrPreview(env)) {
    throw new CatalogRuntimeError(
      "STATIC_CATALOG_FORBIDDEN",
      "The static catalog may only be served locally or in Preview.",
    );
  }
  return source;
}

export function createSupabaseCatalogSnapshotLoader(
  env: Readonly<Record<string, string | undefined>> = process.env,
): CatalogSnapshotLoader {
  let clientPromise:
    | Promise<
        import("@supabase/supabase-js").SupabaseClient<
          Record<string, never>
        >
      >
    | undefined;

  return async () => {
    const url = env.SUPABASE_URL;
    const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey) {
      throw new CatalogRuntimeError(
        "CATALOG_BINDING_UNAVAILABLE",
        "The Supabase catalog binding is unavailable.",
      );
    }

    clientPromise ??= import("@supabase/supabase-js").then(
      ({ createClient }) =>
        createClient<Record<string, never>>(url, publishableKey, {
          auth: {
            autoRefreshToken: false,
            detectSessionInUrl: false,
            persistSession: false,
          },
        }),
    );
    const client = await clientPromise;
    const { data, error } = await client
      .schema("api")
      .rpc("catalog_snapshot_read", undefined, { get: true });
    if (error || data === null) {
      throw new CatalogRuntimeError(
        "CATALOG_RPC_FAILED",
        "The published catalog RPC is unavailable.",
        error ? { cause: error } : undefined,
      );
    }
    return data;
  };
}

export interface CatalogRepositoryDependencies {
  readonly databaseLoader?: CatalogSnapshotLoader;
  readonly staticRepositoryFactory?: () => CatalogRepository;
}

export function createCatalogRepositoryFromEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: CatalogRepositoryDependencies = {},
): CatalogRepository {
  const source = resolveCatalogSource(env);
  const createStatic =
    dependencies.staticRepositoryFactory ??
    (() => new StaticCatalogRepository());
  if (source === "static") return createStatic();

  const database = new SupabaseCatalogRepository(
    dependencies.databaseLoader ??
      createSupabaseCatalogSnapshotLoader(env),
  );
  if (source === "database") return database;

  return new CompareCatalogRepository({
    staticRepository: createStatic(),
    databaseRepository: database,
  });
}
