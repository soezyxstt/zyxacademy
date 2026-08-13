"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard, LockKeyhole, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { formatRupiah, type PlanQuote } from "@/lib/payments/catalog";

type CheckoutClientProps = {
  quote: PlanQuote;
  standardCourses: string[];
  otherCoursesCount: number;
  customer: { name: string; email: string };
};

export default function CheckoutClient({
  quote,
  standardCourses,
  otherCoursesCount,
  customer,
}: CheckoutClientProps) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/payments/duitku/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey: quote.planKey,
          persons: quote.persons,
          standardCourses,
          otherCoursesCount,
          customerPhone: phone,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object" || !("paymentUrl" in result)) {
        const message = result && typeof result === "object" && "error" in result
          ? String(result.error)
          : "Checkout tidak dapat dibuat.";
        throw new Error(message);
      }
      window.location.assign(String(result.paymentUrl));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout tidak dapat dibuat.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative overflow-hidden bg-background py-12 md:py-16">
      <PageOrnaments variant="plans" />
      <div className="relative z-10 mx-auto grid w-full max-w-5xl gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <section>
          <p className="text-body-sm font-semibold text-primary">Checkout aman</p>
          <h1 className="mt-2 font-heading text-h3 text-foreground">Selesaikan pembelian</h1>
          <p className="mt-3 max-w-2xl text-body-base text-muted-foreground">
            Periksa detail paket, lalu lanjutkan ke halaman pembayaran Duitku. Semua nominal menggunakan Rupiah.
          </p>

          <Card className="mt-8 shadow-sm">
            <CardHeader>
              <CardTitle>Data pelanggan</CardTitle>
              <CardDescription>Data ini digunakan untuk identifikasi tagihan dan bantuan pembayaran.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="customer-name" className="font-semibold">Nama</Label>
                  <Input id="customer-name" value={customer.name} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-email" className="font-semibold">Email</Label>
                  <Input id="customer-email" type="email" value={customer.email} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-phone" className="font-semibold">Nomor telepon</Label>
                  <Input
                    id="customer-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="Contoh: 081234567890"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                  />
                  <p className="text-body-xs text-muted-foreground">Masukkan nomor aktif yang dapat dihubungi terkait pesanan.</p>
                </div>

                {error ? (
                  <div className="flex gap-2 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-body-sm text-status-error" role="alert">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>{error}</span>
                  </div>
                ) : null}

                <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
                  <CreditCard className="size-4" aria-hidden />
                  Bayar melalui Duitku
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>

        <aside>
          <Card className="shadow-sm lg:sticky lg:top-24">
            <CardHeader>
              <CardTitle>Ringkasan pesanan</CardTitle>
              <CardDescription>Satu semester</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="font-heading text-h5 text-foreground">Paket {quote.planName}</p>
                <p className="mt-2 text-body-sm text-muted-foreground">{quote.productDescription}</p>
              </div>
              <dl className="divide-y divide-border border-y border-border text-body-sm">
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-muted-foreground">Anggota</dt>
                  <dd className="font-semibold text-foreground">{quote.persons} orang</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-muted-foreground">Mata kuliah</dt>
                  <dd className="font-semibold text-foreground">{quote.coursesCount}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="font-semibold text-foreground">{formatRupiah(quote.amount)}</dd>
                </div>
              </dl>
              <div className="flex gap-2 text-body-sm text-muted-foreground">
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden />
                <p>Pembayaran diproses oleh Duitku. Zyx tidak menyimpan data kartu atau kredensial bank Anda.</p>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href="/plans">Ubah pilihan paket</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
