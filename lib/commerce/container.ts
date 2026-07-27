import { getCommerceEnvironment } from "./config";
import {
  MockCatalogRepository,
  MockCommerceRepository,
  MockOperationsRepository,
} from "./mock-repositories";
import type {
  CatalogRepository,
  CommerceRepository,
  OperationsRepository,
} from "./repositories";
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
    catalog: new MockCatalogRepository(),
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
  demoContainer = input
    ? Object.freeze({
        catalog: new MockCatalogRepository(),
        commerce: new MockCommerceRepository(input),
        operations: new MockOperationsRepository(),
        payment: new MockPaymentGateway(),
        invoice: new MockInvoiceProvider(),
        logistics: new MockLogisticsProvider(),
        email: new MockEmailProvider(),
      })
    : undefined;
}
