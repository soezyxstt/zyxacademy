import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CheckCircle2, Clock3, TriangleAlert } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { paymentOrders } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormattedDate } from "@/components/ui/formatted-date";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { formatRupiah } from "@/lib/payments/catalog";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Status pembayaran"),
  description: "Status pembayaran paket belajar Zyx Academy.",
};

type StatusSearchParams = {
  order?: string | string[];
  merchantOrderId?: string | string[];
};

function firstSearchValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const statusContent = {
  paid: {
    title: "Pembayaran terverifikasi",
    description: "Pembayaran sudah diterima. Admin akan memproses aktivasi paket Anda.",
    icon: CheckCircle2,
    iconClass: "text-status-success",
  },
  pending: {
    title: "Menunggu pembayaran",
    description: "Selesaikan pembayaran pada halaman Duitku. Status diperbarui dari notifikasi server Duitku.",
    icon: Clock3,
    iconClass: "text-status-warning",
  },
  failed: {
    title: "Pembayaran belum berhasil",
    description: "Tagihan tidak berhasil diproses atau dibatalkan. Anda dapat membuat checkout baru dari halaman paket.",
    icon: TriangleAlert,
    iconClass: "text-status-error",
  },
  expired: {
    title: "Tagihan kedaluwarsa",
    description: "Masa berlaku tagihan telah berakhir. Buat checkout baru dari halaman paket.",
    icon: TriangleAlert,
    iconClass: "text-status-error",
  },
} as const;

export default async function CheckoutStatusPage({
  searchParams,
}: {
  searchParams: Promise<StatusSearchParams>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const params = await searchParams;
  const orderId = firstSearchValue(params.order) || firstSearchValue(params.merchantOrderId);
  if (!session?.user) {
    const target = orderId ? `/checkout/status?order=${encodeURIComponent(orderId)}` : "/checkout/status";
    redirect(`/sign-in?next=${encodeURIComponent(target)}`);
  }
  if (!orderId) redirect("/plans");

  const [order] = await db
    .select()
    .from(paymentOrders)
    .where(and(eq(paymentOrders.merchantOrderId, orderId), eq(paymentOrders.userId, session.user.id)))
    .limit(1);
  if (!order) redirect("/plans");

  const displayStatus = order.status === "pending" && order.expiresAt < new Date() ? "expired" : order.status;
  const content = statusContent[displayStatus];
  const Icon = content.icon;

  return (
    <main className="relative overflow-hidden bg-background py-16 md:py-24">
      <PageOrnaments variant="plans" />
      <div className="relative z-10 mx-auto w-full max-w-2xl px-4 sm:px-6">
        <Card className="shadow-sm">
          <CardHeader className="items-start">
            <Icon className={`size-10 ${content.iconClass}`} aria-hidden />
            <CardTitle className="pt-3 text-h4">{content.title}</CardTitle>
            <CardDescription className="text-body-base">{content.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <dl className="divide-y divide-border border-y border-border text-body-sm">
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted-foreground">Pesanan</dt>
                <dd className="break-all text-right font-medium text-foreground">{order.merchantOrderId}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted-foreground">Produk</dt>
                <dd className="text-right font-medium text-foreground">{order.productName}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="text-right font-medium text-foreground">{formatRupiah(order.amount)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted-foreground">Dibuat</dt>
                <dd className="text-right font-medium text-foreground">
                  <FormattedDate date={order.createdAt} options={{ dateStyle: "medium", timeStyle: "short" }} />
                </dd>
              </div>
            </dl>

            <div className="flex flex-col gap-3 sm:flex-row">
              {displayStatus === "pending" && order.paymentUrl ? (
                <Button asChild className="sm:flex-1">
                  <Link href={order.paymentUrl}>Lanjutkan pembayaran</Link>
                </Button>
              ) : null}
              <Button asChild variant="outline" className="sm:flex-1">
                <Link href="/plans">Kembali ke paket</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
