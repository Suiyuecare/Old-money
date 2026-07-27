import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { CommerceDomainError } from "@/lib/commerce/errors";

export interface EnvelopeContext {
  readonly schema: string;
  readonly table: string;
  readonly rowId: string;
  readonly column: string;
  readonly schemaVersion: number;
}

export interface EncryptedEnvelope {
  readonly algorithm: "aes-256-gcm";
  readonly keyVersion: number;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly authTag: string;
}

const aadFor = (context: EnvelopeContext): Buffer =>
  Buffer.from(
    `${context.schema}\u0000${context.table}\u0000${context.rowId}\u0000${context.column}\u0000${context.schemaVersion}`,
    "utf8",
  );

export const encryptEnvelope = (
  plaintext: string,
  context: EnvelopeContext,
  dataEncryptionKey: Buffer,
  keyVersion: number,
): EncryptedEnvelope => {
  if (dataEncryptionKey.length !== 32) {
    throw new CommerceDomainError("INVALID_ENCRYPTION_KEY", "AES-256-GCM requires a 32-byte key.");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataEncryptionKey, nonce);
  cipher.setAAD(aadFor(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Object.freeze({
    algorithm: "aes-256-gcm",
    keyVersion,
    nonce: nonce.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  });
};

export const decryptEnvelope = (
  envelope: EncryptedEnvelope,
  context: EnvelopeContext,
  dataEncryptionKey: Buffer,
): string => {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      dataEncryptionKey,
      Buffer.from(envelope.nonce, "base64url"),
    );
    decipher.setAAD(aadFor(context));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new CommerceDomainError(
      "DECRYPTION_FAILED",
      "Encrypted field failed authentication.",
      409,
    );
  }
};

export const hmacLookup = (
  purpose: string,
  normalizedValue: string,
  key: Buffer,
): string =>
  createHmac("sha256", key)
    .update(`${purpose}\u0000${normalizedValue}`)
    .digest("base64url");

export const verifyHmacValue = (
  supplied: string,
  expected: string,
): boolean => {
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes);
};

