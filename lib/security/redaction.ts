const sensitiveKey =
  /(?:authorization|cookie|token|secret|password|hashkey|hashiv|email|phone|mobile|address|name|card|cvv)/i;

export const redactForLog = (
  value: unknown,
): unknown => {
  if (Array.isArray(value)) return value.map(redactForLog);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        sensitiveKey.test(key) ? "[REDACTED]" : redactForLog(entry),
      ]),
    );
  }
  return value;
};

