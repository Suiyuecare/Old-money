import { CommerceDomainError } from "./errors";
import { DemoRateLimitRepository } from "./rate-limit";

export const DEMO_PUBLIC_COMMANDS_PER_MINUTE = 6;
export const DEMO_PUBLIC_COMMAND_WINDOW_MS = 60_000;
const DEMO_MAXIMUM_CONCURRENT_COMMAND_KEYS = 128;

let limiter = new DemoRateLimitRepository(1);
let clock: () => number = Date.now;
const commandTails = new Map<string, Promise<void>>();

/**
 * Shared process-local abuse bound for anonymous demo session and order
 * commands. Live mode never reaches this implementation.
 */
async function consumeNewDemoPublicCommand(): Promise<void> {
  const now = clock();
  const decision = await limiter.consume({
    scope: "public-demo-commerce-command",
    principalHash: "global",
    limit: DEMO_PUBLIC_COMMANDS_PER_MINUTE,
    windowMs: DEMO_PUBLIC_COMMAND_WINDOW_MS,
    now,
  });
  if (!decision.allowed) {
    throw new CommerceDomainError(
      "DEMO_RATE_LIMITED",
      "The shared public Sandbox command limit has been reached.",
      429,
      {
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((decision.resetAt - now) / 1_000),
        ),
      },
    );
  }
}

async function withCommandKeyLock<Result>(
  key: string,
  command: () => Promise<Result>,
): Promise<Result> {
  const previous = commandTails.get(key);
  if (!previous && commandTails.size >= DEMO_MAXIMUM_CONCURRENT_COMMAND_KEYS) {
    throw new CommerceDomainError(
      "DEMO_CAPACITY_REACHED",
      "The bounded Sandbox command-lock store is full.",
      503,
    );
  }

  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  const priorTurn = previous ?? Promise.resolve();
  const tail = priorTurn.catch(() => undefined).then(() => turn);
  commandTails.set(key, tail);
  await priorTurn.catch(() => undefined);

  try {
    return await command();
  } finally {
    release();
    if (commandTails.get(key) === tail) commandTails.delete(key);
  }
}

/**
 * Serializes only equal logical command keys. This keeps
 * replay-check → rate-admission → create atomic within the demo process:
 * concurrent retries wait for the first result, then replay it without
 * consuming another public-command slot. Conflicting reuse is still rejected
 * by the repository's request fingerprint after the wait.
 */
export function executeDemoPublicCommand<Result>(input: {
  readonly commandName: "create-checkout-draft" | "create-order";
  readonly idempotencyKey: string;
  readonly findReplay: () => Promise<Result | undefined>;
  readonly create: () => Promise<Result>;
}): Promise<Result> {
  return withCommandKeyLock(
    `${input.commandName}:${input.idempotencyKey}`,
    async () => {
      const replay = await input.findReplay();
      if (replay !== undefined) return replay;
      await consumeNewDemoPublicCommand();
      return input.create();
    },
  );
}

export function resetDemoPublicCommandStateForTests(
  input: { readonly now?: () => number } = {},
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Demo public command state may only be reset by tests.");
  }
  limiter = new DemoRateLimitRepository(1);
  clock = input.now ?? Date.now;
  commandTails.clear();
}
