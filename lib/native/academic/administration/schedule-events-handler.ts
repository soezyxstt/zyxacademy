import { z } from "zod";
import { academicEventTypes } from "@/packages/academic/admin-schedule-events";
import { nativeAdminIdSchema } from "./request-validation";

const instant = z.iso.datetime({ offset: true });
const fields = z.strictObject({ title: z.string().trim().min(1).max(500), type: z.enum(academicEventTypes),
  courseId: nativeAdminIdSchema.nullable(), description: z.string().max(20000).nullable(),
  startDate: instant, endDate: instant.nullable(), location: z.string().max(1000).nullable(),
}).refine(value => !value.endDate || Date.parse(value.endDate) > Date.parse(value.startDate));
const target = { id: nativeAdminIdSchema, expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) };
export const academicEventCommand = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), fields }),
  z.strictObject({ action: z.literal("edit"), ...target, fields }),
  z.strictObject({ action: z.literal("delete"), ...target, confirmed: z.literal(true) }),
]);
