import { DEFAULT_PRICING_DISCOUNTS } from "@/lib/pricing-discounts";

export async function GET() { return Response.json(DEFAULT_PRICING_DISCOUNTS); }
