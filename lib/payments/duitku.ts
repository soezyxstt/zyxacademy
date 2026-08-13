import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";

const duitkuPaymentUrlSchema = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && (url.hostname === "duitku.com" || url.hostname.endsWith(".duitku.com"));
}, "Duitku payment URL is invalid");

const duitkuResponseSchema = z.object({
  merchantCode: z.string(),
  reference: z.string().min(1),
  paymentUrl: duitkuPaymentUrlSchema,
  statusCode: z.string(),
  statusMessage: z.string(),
});

export type DuitkuEnvironment = "sandbox" | "production";

type DuitkuConfig = {
  merchantCode: string;
  apiKey: string;
  environment: DuitkuEnvironment;
};

export type DuitkuInvoiceInput = {
  merchantOrderId: string;
  paymentAmount: number;
  productDetails: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  callbackUrl: string;
  returnUrl: string;
  expiryPeriod: 5 | 10 | 60;
};

export class DuitkuRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "DuitkuRequestError";
  }
}

export function isDuitkuPaymentEnabled(): boolean {
  return env.FEATURE_DUITKU_PAYMENT === "1";
}

export function getDuitkuConfig(): DuitkuConfig {
  const merchantCode = env.DUITKU_MERCHANT_CODE?.trim();
  const apiKey = env.DUITKU_API_KEY?.trim();
  if (!merchantCode || !apiKey) {
    throw new Error("Konfigurasi Duitku belum lengkap.");
  }
  return {
    merchantCode,
    apiKey,
    environment: env.DUITKU_ENVIRONMENT,
  };
}

export function createDuitkuSignature(value: string, apiKey: string): string {
  return createHmac("sha256", apiKey).update(value, "utf8").digest("hex");
}

export function verifyDuitkuCallbackSignature(input: {
  merchantCode: string;
  amount: string;
  merchantOrderId: string;
  signature: string;
  apiKey: string;
}): boolean {
  const expected = createDuitkuSignature(
    `${input.merchantCode}${input.amount}${input.merchantOrderId}`,
    input.apiKey,
  );
  if (!/^[a-f0-9]{64}$/i.test(input.signature)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(input.signature, "hex"));
}

function createInvoiceEndpoint(environment: DuitkuEnvironment): string {
  return environment === "production"
    ? "https://api-prod.duitku.com/api/merchant/createInvoice"
    : "https://api-sandbox.duitku.com/api/merchant/createInvoice";
}

export async function createDuitkuInvoice(
  input: DuitkuInvoiceInput,
  config: DuitkuConfig = getDuitkuConfig(),
) {
  const timestamp = Date.now().toString();
  const signature = createDuitkuSignature(`${config.merchantCode}${timestamp}`, config.apiKey);
  const displayName = input.customerName.trim().slice(0, 20) || "Pelanggan Zyx";

  const response = await fetch(createInvoiceEndpoint(config.environment), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-duitku-merchantcode": config.merchantCode,
      "x-duitku-signature": signature,
      "x-duitku-timestamp": timestamp,
    },
    body: JSON.stringify({
      paymentAmount: input.paymentAmount,
      merchantOrderId: input.merchantOrderId,
      productDetails: input.productDetails.slice(0, 255),
      additionalParam: "",
      merchantUserInfo: input.customerEmail,
      paymentMethod: "",
      customerVaName: displayName,
      email: input.customerEmail,
      phoneNumber: input.customerPhone,
      itemDetails: [
        {
          name: input.productDetails.slice(0, 50),
          price: input.paymentAmount,
          quantity: 1,
        },
      ],
      customerDetail: {
        firstName: input.customerName.trim().slice(0, 50),
        lastName: "",
        email: input.customerEmail,
        phoneNumber: input.customerPhone,
      },
      callbackUrl: input.callbackUrl,
      returnUrl: input.returnUrl,
      expiryPeriod: input.expiryPeriod,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = raw && typeof raw === "object" && "Message" in raw
      ? String(raw.Message)
      : "Duitku tidak dapat membuat tagihan.";
    throw new DuitkuRequestError(response.status, message);
  }

  const parsed = duitkuResponseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.statusCode !== "00") {
    throw new DuitkuRequestError(502, "Respons pembuatan tagihan Duitku tidak valid.");
  }
  return parsed.data;
}
