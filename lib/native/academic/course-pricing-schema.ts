import { z } from "zod";
import { parseCoursePricingInput } from "../../../packages/academic/course-pricing";

export const coursePricingSchema = z.object({
  category: z.enum(["premium", "free", "limited_time_free"]),
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
}).strict().refine(value => {
  try { return Boolean(parseCoursePricingInput(value)); }
  catch { return false; }
});
