import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { readAdminQuizInsight } from "@/lib/admin/quiz-insight-read-model";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await readAdminQuizInsight(id, session.user.id);
  if (!result) return NextResponse.json({ error: "Quiz template not found" }, { status: 404 });
  return NextResponse.json(result);
}
