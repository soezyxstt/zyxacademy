import { NextResponse } from "next/server";
import { syncPopularPages } from "@/lib/analytics-sync";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function POST() {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    
    if (!session || session.user.role !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const result = await syncPopularPages();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in manual analytics sync:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
