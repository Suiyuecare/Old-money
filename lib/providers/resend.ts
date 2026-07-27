import { Resend } from "resend";
import { z } from "zod";

import { CommerceDomainError } from "@/lib/commerce/errors";
import type { EmailProvider } from "./interfaces";

const resendBindingsSchema = z.strictObject({
  apiKey: z.string().min(20),
  fromEmail: z.string().email(),
});

export class ResendEmailProvider implements EmailProvider {
  readonly #client: Resend;
  readonly #fromEmail: string;

  constructor() {
    const bindings = resendBindingsSchema.safeParse({
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: process.env.RESEND_FROM_EMAIL,
    });
    if (!bindings.success) {
      throw new CommerceDomainError(
        "EMAIL_PROVIDER_UNAVAILABLE",
        "Resend binding is unavailable.",
        503,
      );
    }
    this.#client = new Resend(bindings.data.apiKey);
    this.#fromEmail = bindings.data.fromEmail;
  }

  async send(input: Parameters<EmailProvider["send"]>[0]) {
    const result = await this.#client.emails.send({
      from: this.#fromEmail,
      to: input.to,
      subject: input.subject,
      text: input.text,
      headers: {
        "X-Lignee-Operation-Key": input.operationKey,
        "X-Lignee-Template-Version": input.templateVersion,
      },
    });
    if (result.error) return { state: "unknown" as const };
    return { state: "queued" as const, messageId: result.data?.id };
  }
}
