import "server-only";
import { getDemoExperiences } from "@/app/(marketing)/demo/demo-data";

export async function getDemoSummaries() {
  return (await getDemoExperiences()).map(({ snapshot, content }) => ({
    snapshot,
    content: { course: content.course, article: { id: content.article.id, title: content.article.title } },
  }));
}
