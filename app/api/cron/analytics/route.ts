import { NextResponse } from "next/server";
import { syncPopularPages } from "@/lib/analytics-sync";
import { timingSafeEqual } from "node:crypto";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secrets = [process.env.CRON_SECRET, process.env.QUEUE_PROVIDER === "cloud-tasks" ? process.env.COMPUTE_SERVICE_SECRET : undefined];
  const received = Buffer.from(authHeader ?? "");
  if (!secrets.some(secret => {
    const expected = Buffer.from(`Bearer ${secret ?? ""}`);
    return Boolean(secret) && expected.length === received.length && timingSafeEqual(expected, received);
  })) {
    return new NextResponse("Unauthorized", {
      status: 401,
    });
  }

  const result = await syncPopularPages();
  return NextResponse.json(result);
}
