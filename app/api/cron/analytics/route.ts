import { NextResponse } from "next/server";
import { syncPopularPages } from "@/lib/analytics-sync";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", {
      status: 401,
    });
  }

  const result = await syncPopularPages();
  return NextResponse.json(result);
}
