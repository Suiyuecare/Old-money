import { cache } from "react";

import { getCommerceEnvironment } from "./config";
import {
  MockCommerceRepository,
  MockOperationsRepository,
} from "./mock-repositories";
import type {
  CatalogRepository,
  CommerceRepository,
  OperationsRepository,
} from "./repositories";
import {
  createCatalogRepositoryFromEnvironment,
  type CatalogRepository as RuntimeCatalogRepository,
} from "@/lib/catalog-runtime";
import type {
  EmailProvider,
  InvoiceProvider,
  LogisticsProvider,
  PaymentGateway,
} from "@/lib/providers/interfaces";
import {
  MockEmailProvider,
  MockInvoiceProvider,
  MockLogisticsProvider,
  MockPaymentGateway,
} from "@/lib/providers/mock";

export interface CommerceContainer {
  readonly catalog: CatalogRepository;
  readonly commerce: CommerceRepository;
  readonly operations: OperationsRepository;
  readonly payment: PaymentGateway;
  readonly invoice: InvoiceProvider;
  readonly logistics: LogisticsProvider;
  readonly email: EmailProvider;
}

let demoContainer: CommerceContainer | undefined;
let catalogRepository: RuntimeCatalogRepository | undefined;

/**
 * Catalog selection is independent from transactional commerce so a
 * production-disabled deployment can read published content while checkout
 * remains fail closed.
 */
export function getCatalogRepository(): RuntimeCatalogRepository {
  catalogRepository ??= createCatalogRepositoryFromEnvironment();
  return catalogRepository;
}

/**
 * One immutable publication snapshot per React server render. Layouts and
 * pages therefore cannot accidentally mix catalog revisions.
 */
export const getCatalogSnapshot = cache(
  async () => getCatalogRepository().readSnapshot(),
);

/**
 * Clients are initialized lazily at request time. A configured production mode
 * never silently falls back to mocks: until production adapters and verified
 * bindings are present, the request fails closed.
 */
export function getCommerceContainer(): CommerceContainer {
  const environment = getCommerceEnvironment();
  if (environment.mode !== "demo") {
    throw new Error(
      "PRODUCTION_ADAPTERS_UNAVAILABLE: commerce remains fail closed until validated bindings exist.",
    );
  }
  demoContainer ??= Object.freeze({
    catalog: getCatalogRepository(),
    commerce: new MockCommerceRepository(),
    operations: new MockOperationsRepository(),
    payment: new MockPaymentGateway(),
    invoice: new MockInvoiceProvider(),
    logistics: new MockLogisticsProvider(),
    email: new MockEmailProvider(),
  });
  return demoContainer;
}

export function resetCommerceContainerForTests(input?: {
  readonly now?: () => number;
  readonly stateTtlMs?: number;
  readonly maximumCommands?: number;
  readonly maximumOrders?: number;
}): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("The commerce container may only be reset by tests.");
  }
  catalogRepository = undefined;
  demoContainer = input
    ? Object.freeze({
        catalog: getCatalogRepository(),
        commerce: new MockCommerceRepository(input),
        operations: new MockOperationsRepository(),
        payment: new MockPaymentGateway(),
        invoice: new MockInvoiceProvider(),
        logistics: new MockLogisticsProvider(),
        email: new MockEmailProvider(),
      })
    : undefined;
}
