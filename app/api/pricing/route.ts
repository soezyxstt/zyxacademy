import { getPricingDiscounts } from "@/lib/pricing-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getPricingDiscounts(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Harga belum tersedia. Coba lagi." }, { status: 503 });
  }
}
