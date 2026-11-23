import { env } from "@/lib/env";
import { isFeatureFlagActive } from "@/lib/feature-flags";

export function isStructuredArticleReaderEnabled(): boolean {
  const value = process.env.FEATURE_STRUCTURED_ARTICLE_READER_V1 ?? env.FEATURE_STRUCTURED_ARTICLE_READER_V1;
  return isFeatureFlagActive(value);
}
