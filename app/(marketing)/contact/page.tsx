import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarketingPageHero } from "@/components/marketing-page-hero";
import { env } from "@/lib/env";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Kontak"),
  description: "Kontak dukungan dan alamat usaha Zyx Academy.",
};

export default function ContactPage() {
  const email = env.NEXT_PUBLIC_BRAND_EMAIL;
  const phone = env.NEXT_PUBLIC_BUSINESS_PHONE || env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  const address = env.NEXT_PUBLIC_BUSINESS_ADDRESS;

  return (
    <div className="flex min-h-screen flex-col">
      <MarketingPageHero
        sectionId="contact"
        title="Kontak dukungan"
        description="Hubungi Zyx Academy untuk pertanyaan produk, checkout, pembayaran, atau aktivasi paket."
      />
      <section className="bg-muted/70 py-12 md:py-16">
        <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          <Card className="shadow-sm">
            <CardHeader>
              <Mail className="size-5 text-primary" aria-hidden />
              <CardTitle className="pt-2">Email</CardTitle>
            </CardHeader>
            <CardContent>
              <Link className="break-all text-body-sm text-primary hover:underline" href={`mailto:${email}`}>
                {email}
              </Link>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader>
              <Phone className="size-5 text-primary" aria-hidden />
              <CardTitle className="pt-2">Telepon</CardTitle>
            </CardHeader>
            <CardContent>
              {phone ? (
                <Link className="text-body-sm text-primary hover:underline" href={`tel:${phone.replace(/[^+\d]/g, "")}`}>
                  {phone}
                </Link>
              ) : (
                <p className="text-body-sm text-muted-foreground">Belum dikonfigurasi</p>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader>
              <MapPin className="size-5 text-primary" aria-hidden />
              <CardTitle className="pt-2">Alamat usaha</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-body-sm text-muted-foreground">
                {address || "Belum dikonfigurasi"}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
