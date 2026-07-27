export class CommerceDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number = 400,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "CommerceDomainError";
  }
}

export class IdempotencyConflictError extends CommerceDomainError {
  constructor() {
    super(
      "IDEMPOTENCY_CONFLICT",
      "The Idempotency-Key was already used with a different request.",
      409,
    );
  }
}
