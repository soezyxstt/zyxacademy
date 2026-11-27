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
import { getExpoIosApnsConfig, isApnsConfigured } from "@/lib/notifications/apns";
import { expoIosApnsEnvironment, isExpoIosPushLabel } from "@/packages/notifications/expo-ios-push";
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
    const capacitorApnsConfigured = isApnsConfigured();
    const expoApnsConfigured = {
      development: getExpoIosApnsConfig("development") !== null,
      production: getExpoIosApnsConfig("production") !== null,
    };
    const apnsConfigured = capacitorApnsConfigured || expoApnsConfigured.development || expoApnsConfigured.production;

    const counts: Record<PushTransport, number> = {
      fcm: 0,
      apns: 0,
      webpush: 0,
      desktop: 0,
    };

    const devices = rows.map((row) => {
      const transport = normalizeStoredTransport(row.transport);
      counts[transport] += 1;
      const expo = expoIosApnsEnvironment(row.device);
      const transportActive = isExpoIosPushLabel(row.device) ? transport === "apns" && expo !== null && expoApnsConfigured[expo]
        : transport === "apns" ? capacitorApnsConfigured : transport === "desktop" || fcmConfigured;
      return {
        id: row.id,
        device: row.device,
        platform: normalizePlatform(row.platform),
        transport,
        transportActive,
        updatedAt: row.updatedAt.toISOString(),
      };
    });

    const apnsProfile = (configured: boolean, matches: (device: string) => boolean) => {
      const registeredCount = devices.filter(device => device.transport === "apns" && matches(device.device)).length;
      return { configured, registeredCount, active: configured && registeredCount > 0 };
    };
    const summary: PushStatusSummary = {
      registered: devices.length > 0,
      devices,
      apnsProfiles: {
        capacitor: apnsProfile(capacitorApnsConfigured, device => !isExpoIosPushLabel(device)),
        expoDevelopment: apnsProfile(expoApnsConfigured.development, device => expoIosApnsEnvironment(device) === "development"),
        expoProduction: apnsProfile(expoApnsConfigured.production, device => expoIosApnsEnvironment(device) === "production"),
      },
      transports: {
        fcm: {
          configured: fcmConfigured,
          registeredCount: counts.fcm,
          active: fcmConfigured && counts.fcm > 0,
        },
        apns: {
          configured: apnsConfigured,
          registeredCount: counts.apns,
          active: devices.some(device => device.transport === "apns" && device.transportActive),
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
