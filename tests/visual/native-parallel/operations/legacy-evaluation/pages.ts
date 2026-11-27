import assessments from "@/app/(admin)/admin/(content)/assessments/page";
import assessment from "@/app/(admin)/admin/(content)/assessments/[id]/page";
import diktats from "@/app/(admin)/admin/(content)/diktats/page";
import leaderboard from "@/app/(admin)/admin/(eval)/leaderboard/page";
import quizInsights from "@/app/(admin)/admin/(eval)/quiz-insights/page";
import quizInsight from "@/app/(admin)/admin/(eval)/quiz-insights/[id]/page";
import quizzes from "@/app/(admin)/admin/(eval)/quizzes/page";
import quizNew from "@/app/(admin)/admin/(eval)/quizzes/new/page";
import quizEdit from "@/app/(admin)/admin/(eval)/quizzes/[id]/edit/page";

type Search = { courseId?: string; courseSlug?: string; tags?: string; returnUrl?: string };
export function runLegacyEvaluationPage(segments: string[], search: Search) {
  const [category, id, action] = segments;
  const query = { searchParams: Promise.resolve(search) };
  const params = { params: Promise.resolve({ id }) };
  if (segments.length === 1) {
    switch (category) {
      case "assessments": return assessments();
      case "diktats": return diktats();
      case "leaderboard": return leaderboard(query);
      case "quiz-insights": return quizInsights(query);
      case "quizzes": return quizzes(query);
    }
  }
  if (segments.length === 2) {
    if (category === "assessments") return assessment();
    if (category === "quiz-insights") return quizInsight(params);
    if (category === "quizzes" && id === "new") return quizNew(query);
  }
  if (segments.length === 3 && category === "quizzes" && action === "edit") return quizEdit({ ...params, ...query });
}
