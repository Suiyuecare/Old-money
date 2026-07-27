interface SafeJsonLdProps {
  readonly value: Readonly<Record<string, unknown>>;
  readonly nonce: string;
}

export const serializeSafeJsonLd = (
  value: Readonly<Record<string, unknown>>,
): string =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

export function SafeJsonLd({ value, nonce }: SafeJsonLdProps) {
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: serializeSafeJsonLd(value) }}
    />
  );
}

