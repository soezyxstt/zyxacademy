import { personalAccountSessionHeader } from "../../packages/student-community/account-access";
import { z } from "zod";

export const nativeArticleCodingHeader = "x-native-article-coding";
export const nativeArticleCodingScope = z.object({
  materialId: z.string().min(1).max(160),
  sectionId: z.string().min(1).max(240),
  partId: z.string().min(1).max(160),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type NativeArticleCodingScope = z.infer<typeof nativeArticleCodingScope>;
export function nativeArticleCodingHeaders(scope: NativeArticleCodingScope, sessionId: string) {
  return {
    [nativeArticleCodingHeader]: encodeURIComponent(JSON.stringify(scope)),
    [personalAccountSessionHeader]: sessionId,
  };
}
