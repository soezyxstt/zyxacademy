import { getDemoSummaries } from "@/lib/demo/summary-repository";
import { env } from "@/lib/env";
import type { PublicDemoList } from "@/packages/native-parity/operations/public-contract";

export async function GET() {
  const summaries = await getDemoSummaries();
  const result: PublicDemoList = {
    showLive: env.FEATURE_LIVE === "1",
    courses: summaries.map(({ content: { course, article } }) => ({
      id: course.id,
      title: course.title,
      description: course.description,
      chapterTitle: course.chapterTitle,
      article: article ? { id: article.id, title: article.title } : null,
    })),
  };
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
