export interface ContentSecurityPolicyContext {
  readonly pathname?: string;
  readonly commerceMode?: "demo" | "production-disabled" | "live";
}

export const buildContentSecurityPolicy = (
  nonce: string,
  development: boolean,
  context: ContentSecurityPolicyContext = {},
) => {
  const scriptDevelopment = development ? " 'unsafe-eval'" : "";
  const connectDevelopment = development
    ? " ws://localhost:* ws://127.0.0.1:*"
    : "";

  const formAction =
    context.pathname?.startsWith("/checkout") && context.commerceMode === "demo"
      ? "form-action 'self' https://payment-stage.ecpay.com.tw"
      : context.pathname?.startsWith("/checkout") && context.commerceMode === "live"
        ? "form-action 'self' https://payment.ecpay.com.tw"
        : "form-action 'self'";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${scriptDevelopment}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${connectDevelopment}`,
    "media-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    formAction,
    "upgrade-insecure-requests",
  ].join("; ");
};
