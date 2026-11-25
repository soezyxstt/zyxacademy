/**
 * POST /api/notifications/register-token
 * DELETE /api/notifications/register-token
 *
 * Stores or updates a push registration token (FCM, APNs, WebPush, or Desktop
 * inbox bridge) for the authenticated user, preserving platform and transport.
 *
 * Body (POST): { token: string, device?: string, platform?: "web" | "android" | "ios" | "desktop", transport?: "fcm" | "apns" | "webpush" | "desktop" }
 * Body (DELETE): { token: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { userPushTokens } from "@/db/schema";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { z } from "zod";
import { isApnsConfigured } from "@/lib/notifications/apns";
import { isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import {
  inferPlatformAndTransport,
  isValidPushTokenForTransport,
} from "@/lib/notifications/transport";
import type { PushTransport } from "@/lib/notifications/types";
import { isNativeShellUserAgent } from "@/lib/native/runtime";

const registerSchema = z.object({
  token: z.string().min(16).max(4096),
  device: z.string().max(300).default("unknown"),
  platform: z.enum(["web", "android", "ios", "desktop"]).optional(),
  transport: z.enum(["fcm", "apns", "webpush", "desktop"]).optional(),
});

const unregisterSchema = z.object({
  token: z.string().min(16).max(4096),
  browserOnly: z.boolean().default(false),
});

function isTransportActiveOnServer(transport: PushTransport): boolean {
  if (transport === "apns") return isApnsConfigured();
  if (transport === "desktop") return true;
  return isFirebaseAdminConfigured();
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { token, device } = parsed.data;
  const { platform, transport } = inferPlatformAndTransport({
    device,
    platform: parsed.data.platform,
    transport: parsed.data.transport,
  });

  if (transport === "webpush" && isNativeShellUserAgent(req.headers.get("user-agent") ?? "")) {
    return NextResponse.json({ error: "Native shell requires native push" }, { status: 422 });
  }
  if (!isValidPushTokenForTransport(token, transport)) {
    return NextResponse.json(
      { error: `Invalid token format for transport '${transport}'` },
      { status: 422 },
    );
  }

  const userId = session.user.id;
  const transportActive = isTransportActiveOnServer(transport);

  try {
    const now = new Date();
    await db
      .insert(userPushTokens)
      .values({
        id: randomUUID(),
        userId,
        sessionId: session.session.id,
        token,
        device,
        platform,
        transport,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userPushTokens.token,
        set: {
          userId,
          sessionId: session.session.id,
          device,
          platform,
          transport,
          updatedAt: now,
        },
      });

    // Only retire web tokens with a proven shared authenticated session. Different
    // browser profiles/devices must never be inferred from their user agents.
    if (transport === "fcm" || transport === "apns") {
      // A rotated native token replaces the previous token for the same session.
      await db.delete(userPushTokens).where(and(eq(userPushTokens.userId,userId),
        eq(userPushTokens.sessionId,session.session.id),eq(userPushTokens.transport,transport),ne(userPushTokens.token,token)));
      await db.delete(userPushTokens).where(and(
        eq(userPushTokens.userId, userId), eq(userPushTokens.sessionId, session.session.id),
        eq(userPushTokens.transport, "webpush"),
      ));
    }
    return NextResponse.json({
      success: true,
      registered: true,
      platform,
      transport,
      transportActive,
      readiness: transportActive ? "ready" : "transport_inactive",
    });
  } catch (err) {
    console.error("[register-token] DB error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = unregisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  try {
    await db
      .delete(userPushTokens)
      .where(
        and(
          eq(userPushTokens.userId, session.user.id),
          eq(userPushTokens.token, parsed.data.token),
          parsed.data.browserOnly
            ? and(eq(userPushTokens.platform, "web"), inArray(userPushTokens.transport, ["webpush", "fcm"]))
            : or(isNull(userPushTokens.sessionId), eq(userPushTokens.sessionId, session.session.id)),
        ),
      );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[register-token] DELETE DB error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
