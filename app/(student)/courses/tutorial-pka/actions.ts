"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { pkaAnnouncementReads } from "@/db/schema";

export async function markPkaAnnouncementReadAction(announcementId: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    await db.insert(pkaAnnouncementReads).values({
      announcementId,
      userId: session.user.id,
    }).onConflictDoNothing();

    return { success: true };
  } catch (err) {
    console.error("[markPkaAnnouncementReadAction]", err);
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan." };
  }
}
