import { z } from "zod";

const mobileBarcode = z.string().regex(/^\/[0-9A-Z.+-]{7}$/);
const companyIdentifier = z.string().regex(/^\d{8}$/);

export const invoiceOptionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("ecpay_email"),
    email: z.string().email(),
  }),
  z.strictObject({
    kind: z.literal("mobile_barcode"),
    mobileBarcode,
  }),
  z.strictObject({
    kind: z.literal("donation"),
    loveCode: z.string().regex(/^\d{3,7}$/),
  }),
  z.strictObject({
    kind: z.literal("company"),
    companyIdentifier,
    companyName: z.string().trim().min(1).max(60),
    carrier: z.union([
      z.strictObject({ type: z.literal("email"), email: z.string().email() }),
      z.strictObject({ type: z.literal("mobile"), mobileBarcode }),
    ]),
  }),
]);

export type InvoiceOption = z.infer<typeof invoiceOptionSchema>;

export const toEcpayInvoiceFields = (
  option: InvoiceOption,
): Readonly<Record<string, string>> => {
  switch (option.kind) {
    case "ecpay_email":
      return Object.freeze({
        Donation: "0",
        CarrierType: "1",
        CarrierNum: option.email,
        Print: "0",
        CustomerIdentifier: "",
      });
    case "mobile_barcode":
      return Object.freeze({
        Donation: "0",
        CarrierType: "3",
        CarrierNum: option.mobileBarcode,
        Print: "0",
        CustomerIdentifier: "",
      });
    case "donation":
      return Object.freeze({
        Donation: "1",
        LoveCode: option.loveCode,
        CarrierType: "",
        CarrierNum: "",
        Print: "0",
        CustomerIdentifier: "",
      });
    case "company":
      return Object.freeze({
        Donation: "0",
        CustomerIdentifier: option.companyIdentifier,
        CustomerName: option.companyName,
        CarrierType: option.carrier.type === "email" ? "1" : "3",
        CarrierNum:
          option.carrier.type === "email"
            ? option.carrier.email
            : option.carrier.mobileBarcode,
        Print: "0",
      });
  }
};

