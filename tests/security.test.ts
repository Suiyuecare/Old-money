import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "@/lib/security";

function directives(policy: string) {
  return new Map(
    policy.split("; ").map((directive) => {
      const [name, ...values] = directive.split(" ");
      return [name, values];
    }),
  );
}

describe("request CSP", () => {
  it("matches the fail-closed production directive contract", () => {
    const policy = buildContentSecurityPolicy("testNonce", false);
    const parsed = directives(policy);

    expect(parsed.get("default-src")).toEqual(["'self'"]);
    expect(parsed.get("script-src")).toEqual([
      "'self'",
      "'nonce-testNonce'",
      "'strict-dynamic'",
    ]);
    expect(parsed.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(parsed.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(parsed.get("font-src")).toEqual(["'self'"]);
    expect(parsed.get("connect-src")).toEqual(["'self'"]);
    expect(parsed.get("media-src")).toEqual(["'self'"]);
    expect(parsed.get("worker-src")).toEqual(["'self'", "blob:"]);
    expect(parsed.get("manifest-src")).toEqual(["'self'"]);
    expect(parsed.get("object-src")).toEqual(["'none'"]);
    expect(parsed.get("frame-src")).toEqual(["'none'"]);
    expect(parsed.get("frame-ancestors")).toEqual(["'none'"]);
    expect(parsed.get("base-uri")).toEqual(["'self'"]);
    expect(parsed.get("form-action")).toEqual(["'none'"]);
    expect(parsed.get("upgrade-insecure-requests")).toEqual([]);
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("*");
    expect(policy).not.toMatch(/https?:\/\//);
  });

  it("adds only documented local development allowances", () => {
    const production = buildContentSecurityPolicy("same", false);
    const development = buildContentSecurityPolicy("same", true);

    expect(development).toContain("'unsafe-eval'");
    expect(development).toContain("ws://localhost:*");
    expect(development).toContain("ws://127.0.0.1:*");
    expect(production).not.toContain("'unsafe-eval'");
    expect(production).not.toContain("ws://");
  });
});
