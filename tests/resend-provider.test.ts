import { afterEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    readonly emails = { send: sendMock };
  },
}));

import { ResendEmailProvider } from "@/lib/providers/resend";

const previous = {
  apiKey: process.env.RESEND_API_KEY,
  fromEmail: process.env.RESEND_FROM_EMAIL,
};

afterEach(() => {
  sendMock.mockReset();
  if (previous.apiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = previous.apiKey;
  if (previous.fromEmail === undefined) delete process.env.RESEND_FROM_EMAIL;
  else process.env.RESEND_FROM_EMAIL = previous.fromEmail;
});

describe("Resend email provider", () => {
  it("sends from the validated RESEND_FROM_EMAIL binding", async () => {
    process.env.RESEND_API_KEY = "re_abcdefghijklmnopqrstuvwxyz";
    process.env.RESEND_FROM_EMAIL = "estate@estatelignee.com";
    sendMock.mockResolvedValue({
      data: { id: "email-message-1" },
      error: null,
    });
    const provider = new ResendEmailProvider();

    await expect(
      provider.send({
        operationKey: "email-operation-0001",
        templateVersion: "order-v1",
        to: "buyer@example.com",
        subject: "Order received",
        text: "Thank you.",
      }),
    ).resolves.toEqual({
      state: "queued",
      messageId: "email-message-1",
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "estate@estatelignee.com",
        to: "buyer@example.com",
      }),
    );
  });

  it("fails closed when RESEND_FROM_EMAIL is not a valid email address", () => {
    process.env.RESEND_API_KEY = "re_abcdefghijklmnopqrstuvwxyz";
    process.env.RESEND_FROM_EMAIL = "not-an-email";

    expect(() => new ResendEmailProvider()).toThrowError(
      "Resend binding is unavailable.",
    );
    expect(sendMock).not.toHaveBeenCalled();
  });
});
