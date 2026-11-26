import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getQuietHours, saveQuietHours } from "@/lib/notifications/quiet-delivery";
import { quietHoursSchema } from "@/lib/notifications/quiet-hours";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
 const session = await auth.api.getSession({ headers: req.headers });
 if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
 return NextResponse.json(await getQuietHours(session.user.id), { headers });
}
export async function PUT(req: NextRequest) {
 const session = await auth.api.getSession({ headers: req.headers });
 if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
 const parsed = quietHoursSchema.safeParse(await req.json().catch(() => null));
 if (!parsed.success) return NextResponse.json({ error: "Invalid quiet hours" }, { status: 422, headers });
 return NextResponse.json(await saveQuietHours(session.user.id, parsed.data), { headers });
}
