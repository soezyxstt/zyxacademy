import { z } from "zod";
import { isSameOriginAdminRequest } from "@/lib/admin-ops-ai/request-origin";
import { getNativeOperationsAdmin } from "@/lib/auth/native-operations-admin";
import { getAdminHomeDashboard } from "@/features/admin-home/model/dashboard";
import { getDashboardMetrics } from "@/lib/analytics-dashboard";
import { getFeatureUsageMetrics, resolveFeatureUsageRange } from "@/lib/feature-usage-metrics";
import { EMBEDDING_PROFILES } from "@/lib/ai/provider/model-registry";
import { listModelSettingViews } from "@/lib/ai/model-settings-store";
import {
  queryTutorActivityDetail,
  queryTutorActivityFilterOptions,
  queryTutorActivityLogs,
  queryTutorActivityStats,
} from "@/app/(admin)/admin/ops/tutor-activity/dal";
import { activityOutcomes } from "@/packages/native-parity/operations/monitoring-contract";

const key = z.string().trim().min(1).max(256);
const cursorFields = { cursorId: key, cursorAt: z.iso.datetime({ offset: true }) };
const tutorFilters = z.object({
  actorId: key.optional(),
  courseId: key.optional(),
  entityType: key.optional(),
  action: key.optional(),
  outcome: z.enum(activityOutcomes).optional(),
  correlationId: key.optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursorId: cursorFields.cursorId.optional(),
  cursorAt: cursorFields.cursorAt.optional(),
}).refine(value => Boolean(value.cursorAt) === Boolean(value.cursorId))
  .refine(value => !value.startDate || !value.endDate || value.startDate <= value.endDate);
const responseHeaders = { "Cache-Control": "private, no-store" };

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: responseHeaders });
}

function privateResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", responseHeaders["Cache-Control"]);
  return new Response(response.body, { status: response.status, headers });
}

export async function GET(request: Request) {
  try {
    const auth = await getNativeOperationsAdmin();
    if (!auth.ok) return json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, auth.status);

    const params = new URL(request.url).searchParams;
    switch (params.get("view")) {
      case "ops":
        return privateResponse(await (await import("@/app/api/admin/ops/route")).GET());
      case "keys":
        return privateResponse(await (await import("@/app/api/admin/key-diagnostics/route")).GET());
      case "zyra":
        return privateResponse(await (await import("@/app/api/admin/zyra/ops/route")).GET());
      case "proposals":
        return privateResponse(await (await import("@/app/api/zyra/proposals/route")).GET(request));
      case "ai":
        return privateResponse(await (await import("@/app/api/admin/ai-analytics/route")).GET());
      case "usage": {
        const startDate = params.get("startDate");
        const endDate = params.get("endDate");
        if (startDate && endDate) {
          const start = new Date(startDate).valueOf();
          const end = new Date(endDate).valueOf();
          if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 91 * 86_400_000) {
            return json({ error: "Invalid analytics range" }, 400);
          }
        } else if (startDate || endDate) {
          return json({ error: "Incomplete analytics range" }, 400);
        }
        return privateResponse(await (await import("@/app/api/admin/ai-analytics/usage/route")).GET(request));
      }
      case "home":
        return json(await getAdminHomeDashboard());
      case "web":
        return json(await getDashboardMetrics(30));
      case "features":
        return json(await getFeatureUsageMetrics(resolveFeatureUsageRange(params.get("range") ?? undefined)));
      case "models":
        return json(await listModelSettingViews());
      case "embedding":
        return json(Object.values(EMBEDDING_PROFILES).map(({ id, model, dimensions }) => ({ id, model, dimensions })));
      case "tutorDetail": {
        const id = key.safeParse(params.get("id"));
        if (!id.success) return json({ error: "Invalid activity ID" }, 400);
        return json(await queryTutorActivityDetail(id.data));
      }
      case "tutor": {
        const parsed = tutorFilters.safeParse(Object.fromEntries(params.entries()));
        if (!parsed.success) return json({ error: "Invalid activity filters" }, 400);
        const { cursorAt, cursorId, ...filters } = parsed.data;
        const cursor = cursorAt && cursorId ? { createdAt: cursorAt, id: cursorId } : null;
        const [stats, options, page] = await Promise.all([
          queryTutorActivityStats(),
          queryTutorActivityFilterOptions(),
          queryTutorActivityLogs({ ...filters, cursor }),
        ]);
        return json({ stats, options, page });
      }
      default:
        return json({ error: "Unknown monitoring view" }, 400);
    }
  } catch (error) {
    console.error("Failed to load native admin monitoring", error);
    return json({ error: "Unable to load monitoring" }, 500);
  }
}

const createLinkInput = z.object({
  slug: z.union([z.literal(""), z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/)]),
  url: z.url().max(2048).refine(value => {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
  }),
  title: z.string().trim().min(1).max(500).nullable(),
}).strict();

export async function POST(request: Request) {
  try {
    const auth = await getNativeOperationsAdmin();
    if (!auth.ok) return json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, auth.status);
    if (!request.headers.has("origin") || !isSameOriginAdminRequest(request)) return json({ error: "Forbidden origin" }, 403);
    if (new URL(request.url).searchParams.get("view") !== "links") return json({ error: "Unknown monitoring action" }, 400);
    const parsed = createLinkInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: "Invalid short link" }, 400);
    const handler = await import("@/app/api/admin/short-links/route");
    return privateResponse(await handler.POST(new Request(request.url, {
      method: "POST", headers: request.headers, body: JSON.stringify(parsed.data),
    })));
  } catch (error) {
    console.error("Failed to create native admin short link", error);
    return json({ error: "Unable to create short link" }, 500);
  }
}
