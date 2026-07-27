import { Resend } from "resend";

import { CommerceDomainError } from "@/lib/commerce/errors";
import type { EmailProvider } from "./interfaces";

export class ResendEmailProvider implements EmailProvider {
  readonly #client: Resend;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new CommerceDomainError(
        "EMAIL_PROVIDER_UNAVAILABLE",
        "Resend binding is unavailable.",
        503,
      );
    }
    this.#client = new Resend(apiKey);
  }

  async send(input: Parameters<EmailProvider["send"]>[0]) {
    const result = await this.#client.emails.send({
      from: "LIGNÉE Orders <orders@estatelignee.com>",
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

