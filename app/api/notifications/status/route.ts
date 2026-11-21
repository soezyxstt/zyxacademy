/**
 * GET /api/notifications/status
 *
 * Returns honest server-side push delivery readiness for the authenticated user,
 * separating device registration from server transport configuration/activity.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { userPushTokens } from "@/db/schema";
import { isApnsConfigured } from "@/lib/notifications/apns";
import { isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { normalizeStoredTransport } from "@/lib/notifications/dispatch";
import type { PushPlatform, PushStatusSummary, PushTransport } from "@/lib/notifications/types";

function normalizePlatform(raw: string | null | undefined): PushPlatform {
  if (raw === "android" || raw === "ios" || raw === "desktop" || raw === "web") {
    return raw;
  }
  return "web";
}

export async function GET() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await db
      .select({
        id: userPushTokens.id,
        device: userPushTokens.device,
        platform: userPushTokens.platform,
        transport: userPushTokens.transport,
        updatedAt: userPushTokens.updatedAt,
      })
      .from(userPushTokens)
      .where(eq(userPushTokens.userId, session.user.id));

    const fcmConfigured = isFirebaseAdminConfigured();
    const apnsConfigured = isApnsConfigured();

    const counts: Record<PushTransport, number> = {
      fcm: 0,
      apns: 0,
      webpush: 0,
      desktop: 0,
    };

    const devices = rows.map((row) => {
      const transport = normalizeStoredTransport(row.transport);
      counts[transport] += 1;
      return {
        id: row.id,
        device: row.device,
        platform: normalizePlatform(row.platform),
        transport,
        updatedAt: row.updatedAt.toISOString(),
      };
    });

    const summary: PushStatusSummary = {
      registered: devices.length > 0,
      devices,
      transports: {
        fcm: {
          configured: fcmConfigured,
          registeredCount: counts.fcm,
          active: fcmConfigured && counts.fcm > 0,
        },
        apns: {
          configured: apnsConfigured,
          registeredCount: counts.apns,
          active: apnsConfigured && counts.apns > 0,
        },
        webpush: {
          configured: fcmConfigured,
          registeredCount: counts.webpush,
          active: fcmConfigured && counts.webpush > 0,
        },
        desktop: {
          configured: true,
          registeredCount: counts.desktop,
          active: counts.desktop > 0,
        },
      },
    };

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    console.error("[notifications/status] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
