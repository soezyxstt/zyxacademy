import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { paymentOrders } from "@/db/schema";
import {
  getDuitkuConfig,
  isDuitkuPaymentEnabled,
  verifyDuitkuCallbackSignature,
} from "@/lib/payments/duitku";

function callbackError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (!isDuitkuPaymentEnabled()) return callbackError("Not found", 404);

  const formData = await request.formData().catch(() => null);
  if (!formData) return callbackError("Invalid callback", 400);

  const merchantCode = String(formData.get("merchantCode") || "");
  const amount = String(formData.get("amount") || "");
  const merchantOrderId = String(formData.get("merchantOrderId") || "");
  const signature = String(formData.get("signature") || "");
  const resultCode = String(formData.get("resultCode") || "");
  const reference = String(formData.get("reference") || "");
  const paymentMethod = String(formData.get("paymentCode") || "");
  const config = getDuitkuConfig();

  if (!merchantCode || !amount || !merchantOrderId || !signature || merchantCode !== config.merchantCode) {
    return callbackError("Invalid callback", 400);
  }
  if (!verifyDuitkuCallbackSignature({ merchantCode, amount, merchantOrderId, signature, apiKey: config.apiKey })) {
    return callbackError("Invalid signature", 401);
  }

  const [order] = await db
    .select({ id: paymentOrders.id, amount: paymentOrders.amount, status: paymentOrders.status })
    .from(paymentOrders)
    .where(eq(paymentOrders.merchantOrderId, merchantOrderId))
    .limit(1);

  if (!order || order.amount !== Number(amount)) return callbackError("Order mismatch", 400);
  if (order.status === "paid") return new NextResponse("OK", { status: 200 });

  if (resultCode === "00") {
    await db
      .update(paymentOrders)
      .set({
        status: "paid",
        duitkuReference: reference || undefined,
        paymentMethod: paymentMethod || undefined,
        resultCode,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(paymentOrders.id, order.id), ne(paymentOrders.status, "paid")));
  } else {
    await db
      .update(paymentOrders)
      .set({
        status: "failed",
        duitkuReference: reference || undefined,
        paymentMethod: paymentMethod || undefined,
        resultCode,
        updatedAt: new Date(),
      })
      .where(and(eq(paymentOrders.id, order.id), ne(paymentOrders.status, "paid")));
  }

  return new NextResponse("OK", { status: 200 });
}
