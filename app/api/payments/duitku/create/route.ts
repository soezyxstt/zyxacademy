import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { paymentOrders } from "@/db/schema";
import { minutesFrom } from "@/lib/date-utils";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { createPlanQuote, isPurchasablePlanKey } from "@/lib/payments/catalog";
import {
  createDuitkuInvoice,
  DuitkuRequestError,
  getDuitkuConfig,
  isDuitkuPaymentEnabled,
} from "@/lib/payments/duitku";
import { eq } from "drizzle-orm";

const checkoutSchema = z.object({
  planKey: z.string(),
  persons: z.number().int(),
  standardCourses: z.array(z.string()).max(5),
  otherCoursesCount: z.number().int(),
  customerPhone: z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,19}$/),
});

function createMerchantOrderId(): string {
  return `Zyx-${Date.now()}-${randomUUID().replaceAll("-", "").slice(0, 10)}`;
}

export async function POST(request: Request) {
  if (!isDuitkuPaymentEnabled()) {
    return NextResponse.json({ error: "Checkout pembayaran belum tersedia." }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Silakan masuk untuk melanjutkan pembayaran." }, { status: 401 });
  }

  const body = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!body.success || !isPurchasablePlanKey(body.data.planKey)) {
    return NextResponse.json({ error: "Pilihan checkout tidak valid." }, { status: 400 });
  }
  const customerPhone = body.data.customerPhone.replace(/\D/g, "");
  if (customerPhone.length < 9 || customerPhone.length > 15) {
    return NextResponse.json({ error: "Nomor telepon tidak valid." }, { status: 400 });
  }

  let quote;
  try {
    quote = createPlanQuote({
      planKey: body.data.planKey,
      persons: body.data.persons,
      standardCourses: body.data.standardCourses,
      otherCoursesCount: body.data.otherCoursesCount,
    });
    getDuitkuConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Konfigurasi pembayaran tidak valid.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const id = randomUUID();
  const merchantOrderId = createMerchantOrderId();
  const expiresAt = minutesFrom(60);
  const appUrl = getPublicAppUrl();

  await db.insert(paymentOrders).values({
    id,
    merchantOrderId,
    userId: session.user.id,
    productCode: quote.planKey,
    productName: `Paket ${quote.planName}`,
    productDescription: quote.productDescription,
    amount: quote.amount,
    currency: "IDR",
    persons: quote.persons,
    coursesCount: quote.coursesCount,
    selectedCourses: quote.selectedCourses,
    customerName: session.user.name,
    customerEmail: session.user.email,
    customerPhone,
    status: "pending",
    expiresAt,
  });

  try {
    const invoice = await createDuitkuInvoice({
      merchantOrderId,
      paymentAmount: quote.amount,
      productDetails: quote.productDescription,
      customerName: session.user.name,
      customerEmail: session.user.email,
      customerPhone,
      callbackUrl: new URL("/api/payments/duitku/callback", appUrl).toString(),
      returnUrl: new URL("/checkout/status", appUrl).toString(),
      expiryPeriod: 60,
    });

    await db
      .update(paymentOrders)
      .set({
        duitkuReference: invoice.reference,
        paymentUrl: invoice.paymentUrl,
        resultCode: invoice.statusCode,
        updatedAt: new Date(),
      })
      .where(eq(paymentOrders.id, id));

    return NextResponse.json({ paymentUrl: invoice.paymentUrl });
  } catch (error) {
    await db
      .update(paymentOrders)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(paymentOrders.id, id));

    const message = error instanceof DuitkuRequestError
      ? error.message
      : "Tidak dapat menghubungi Duitku. Coba lagi beberapa saat.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
