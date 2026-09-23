import { z } from "zod";
import { CanvasSpecSchema, type CanvasSpec } from "@/lib/zyra/canvas";

export const constantFunctionSchema = z.object({
  kind: z.literal("constant"),
  c: z.number().finite(),
}).strict();
export type ConstantFunction = z.infer<typeof constantFunctionSchema>;

export const linearFunctionSchema = z.object({
  kind: z.literal("linear"),
  m: z.number().finite(),
  b: z.number().finite(),
}).strict();
export type LinearFunction = z.infer<typeof linearFunctionSchema>;

export const quadraticFunctionSchema = z.object({
  kind: z.literal("quadratic"),
  a: z.number().finite(),
  b: z.number().finite(),
  c: z.number().finite(),
}).strict();
export type QuadraticFunction = z.infer<typeof quadraticFunctionSchema>;

export const visualFunctionModelSchema = z.discriminatedUnion("kind", [
  constantFunctionSchema,
  linearFunctionSchema,
  quadraticFunctionSchema,
]);
export type VisualFunctionModel = z.infer<typeof visualFunctionModelSchema>;

export const visualTableFallbackSchema = z
  .object({
    type: z.literal("table"),
    summary: z.string().trim().min(1),
    headers: z.array(z.string().trim().min(1)).min(1),
    rows: z.array(z.array(z.union([z.string(), z.number().finite()]))).min(1),
  })
  .strict()
  .refine((table) => table.rows.every((row) => row.length === table.headers.length), {
    message: "All table fallback rows must have exactly the same number of columns as headers",
    path: ["rows"],
  });
export type VisualTableFallback = z.infer<typeof visualTableFallbackSchema>;

export const visualTextFallbackSchema = z.object({
  type: z.literal("text"),
  summary: z.string().trim().min(1),
  content: z.string().trim().min(1),
}).strict();
export type VisualTextFallback = z.infer<typeof visualTextFallbackSchema>;

export const visualStaticFallbackSchema = z.discriminatedUnion("type", [
  visualTableFallbackSchema,
  visualTextFallbackSchema,
]);
export type VisualStaticFallback = z.infer<typeof visualStaticFallbackSchema>;

export const visualNumericBoundsSchema = z
  .object({
    xMin: z.number().finite(),
    xMax: z.number().finite(),
    yMin: z.number().finite(),
    yMax: z.number().finite(),
  })
  .strict()
  .refine((b) => b.xMin < b.xMax, {
    message: "xMin must be strictly less than xMax",
    path: ["xMin"],
  })
  .refine((b) => b.yMin < b.yMax, {
    message: "yMin must be strictly less than yMax",
    path: ["yMin"],
  });
export type VisualNumericBounds = z.infer<typeof visualNumericBoundsSchema>;

const FORBIDDEN_SECURITY_PATTERNS = [
  /<script[\s>]/i,
  /<\/script>/i,
  /<svg[\s>]/i,
  /<\/svg>/i,
  /<html[\s>]/i,
  /<\/html>/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /<path[\s>]/i,
  /<circle[\s>]/i,
  /<rect[\s>]/i,
  /javascript:/i,
  /vbscript:/i,
  /data:text\/html/i,
  /onload[\s=]/i,
  /onerror[\s=]/i,
  /onclick[\s=]/i,
  /onmouseover[\s=]/i,
  /eval\s*\(/i,
  /Function\s*\(/i,
  /setTimeout\s*\(/i,
  /setInterval\s*\(/i,
  /=>/,
];

export function inspectPayloadSecurity(value: unknown): { safe: boolean; reason?: string } {
  if (typeof value === "string") {
    for (const pattern of FORBIDDEN_SECURITY_PATTERNS) {
      if (pattern.test(value)) {
        return {
          safe: false,
          reason: `Forbidden executable or markup pattern detected: ${pattern.source}`,
        };
      }
    }
    return { safe: true };
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = inspectPayloadSecurity(item);
      if (!result.safe) return result;
    }
    return { safe: true };
  }

  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      const keyResult = inspectPayloadSecurity(key);
      if (!keyResult.safe) return keyResult;
      const valResult = inspectPayloadSecurity(nested);
      if (!valResult.safe) return valResult;
    }
    return { safe: true };
  }

  return { safe: true };
}

export const EPSILON_DELTA_TOLERANCE = 1e-6;

export const epsilonDeltaGraphSpecSchema = z
  .object({
    id: z.string().trim().min(1),
    kind: z.literal("epsilon_delta_graph"),
    label: z.string().trim().min(1),
    description: z.string().trim().min(1),
    bounds: visualNumericBoundsSchema,
    staticFallback: visualStaticFallbackSchema,
    limitPoint: z.number().finite(),
    limitValue: z.number().finite(),
    defaultEpsilon: z.number().finite().positive(),
    defaultDelta: z.number().finite().positive(),
    functionModel: visualFunctionModelSchema,
  })
  .strict()
  .superRefine((spec, ctx) => {
    const secCheck = inspectPayloadSecurity(spec);
    if (!secCheck.safe) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: secCheck.reason ?? "Security check failed for visual payload",
      });
    }

    if (spec.limitPoint <= spec.bounds.xMin || spec.limitPoint >= spec.bounds.xMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `limitPoint (${spec.limitPoint}) must be strictly within x bounds [${spec.bounds.xMin}, ${spec.bounds.xMax}]`,
        path: ["limitPoint"],
      });
    }

    if (spec.limitValue <= spec.bounds.yMin || spec.limitValue >= spec.bounds.yMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `limitValue (${spec.limitValue}) must be strictly within y bounds [${spec.bounds.yMin}, ${spec.bounds.yMax}]`,
        path: ["limitValue"],
      });
    }

    if (
      spec.limitPoint - spec.defaultDelta < spec.bounds.xMin ||
      spec.limitPoint + spec.defaultDelta > spec.bounds.xMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Default delta neighborhood [${spec.limitPoint - spec.defaultDelta}, ${spec.limitPoint + spec.defaultDelta}] must remain within plotted x bounds [${spec.bounds.xMin}, ${spec.bounds.xMax}]`,
        path: ["defaultDelta"],
      });
    }

    if (
      spec.limitValue - spec.defaultEpsilon < spec.bounds.yMin ||
      spec.limitValue + spec.defaultEpsilon > spec.bounds.yMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Default epsilon neighborhood [${spec.limitValue - spec.defaultEpsilon}, ${spec.limitValue + spec.defaultEpsilon}] must remain within plotted y bounds [${spec.bounds.yMin}, ${spec.bounds.yMax}]`,
        path: ["defaultEpsilon"],
      });
    }

    const evaluated = evaluateVisualFunction(spec.functionModel, spec.limitPoint);
    const diff = Math.abs(evaluated - spec.limitValue);
    if (diff > EPSILON_DELTA_TOLERANCE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Function evaluated at limitPoint ${spec.limitPoint} yields ${evaluated}, which deviates from declared limitValue ${spec.limitValue} by ${diff} exceeding tolerance ${EPSILON_DELTA_TOLERANCE}`,
        path: ["limitValue"],
      });
    }
  });
export type EpsilonDeltaGraphSpec = z.infer<typeof epsilonDeltaGraphSpecSchema>;

/**
 * Product Bundle adapter for the application-owned Learning Canvas contract.
 * The adapter keeps product identity and learner-facing copy separate from the
 * bounded canvas payload so Article and PDF consumers can choose their own
 * renderer without accepting model-authored HTML, SVG, or JavaScript.
 */
export const learningCanvasVisualSpecSchema = z
  .object({
    id: z.string().trim().min(1),
    kind: z.literal("learning_canvas"),
    label: z.string().trim().min(1),
    description: z.string().trim().min(1),
    interactive: z.boolean().default(true),
    canvas: CanvasSpecSchema,
  })
  .strict()
  .superRefine((spec, ctx) => {
    const secCheck = inspectPayloadSecurity(spec);
    if (!secCheck.safe) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: secCheck.reason ?? "Security check failed for visual payload",
      });
    }

    if (spec.interactive && spec.canvas.type !== "function_plot" && spec.canvas.type !== "derivation") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Interactive Product Canvas is not supported for ${spec.canvas.type}`,
        path: ["interactive"],
      });
    }
  });
export type LearningCanvasVisualSpec = z.infer<typeof learningCanvasVisualSpecSchema>;

export const visualSpecSchema = z.discriminatedUnion("kind", [
  epsilonDeltaGraphSpecSchema,
  learningCanvasVisualSpecSchema,
]);
export type VisualSpec = z.infer<typeof visualSpecSchema>;

export type ProductCanvasSpec = CanvasSpec;

export function evaluateVisualFunction(model: VisualFunctionModel, x: number): number {
  switch (model.kind) {
    case "constant":
      return model.c;
    case "linear":
      return model.m * x + model.b;
    case "quadratic":
      return model.a * x * x + model.b * x + model.c;
  }
}
