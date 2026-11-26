import { z } from "zod";
import { getNativeOperationsAdmin } from "@/lib/auth/native-operations-admin";
import { getAdminHomeDashboard } from "@/features/admin-home/model/dashboard";
import { getDashboardMetrics } from "@/lib/analytics-dashboard";
import { getFeatureUsageMetrics, resolveFeatureUsageRange } from "@/lib/feature-usage-metrics";
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

export async function GET(request: Request) {
  try {
    const auth = await getNativeOperationsAdmin();
    if (!auth.ok) return json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, auth.status);

    const params = new URL(request.url).searchParams;
    switch (params.get("view")) {
      case "home":
        return json(await getAdminHomeDashboard());
      case "web":
        return json(await getDashboardMetrics(30));
      case "features":
        return json(await getFeatureUsageMetrics(resolveFeatureUsageRange(params.get("range") ?? undefined)));
      case "models":
        return json(await listModelSettingViews());
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
