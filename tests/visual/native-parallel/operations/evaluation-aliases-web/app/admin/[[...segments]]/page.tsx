import { legacyEvaluationBrowserCases } from "../../../../legacy-evaluation/cases";
import { runLegacyEvaluationPage } from "../../../../legacy-evaluation/pages";

type Search = { courseId?: string; courseSlug?: string; tags?: string; returnUrl?: string };

export default async function LegacyEvaluationReference({ params, searchParams }: {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<Search>;
}) {
  const { segments = [] } = await params;
  if (segments.join("/") === "evaluation-alias-origin") {
    return <main>
      <h1>Legacy evaluation route origins</h1>
      <ul>{legacyEvaluationBrowserCases.map((entry) => <li key={entry.id}>
        <a href={entry.href}>{entry.id}</a>
      </li>)}</ul>
    </main>;
  }
  const branch = runLegacyEvaluationPage(segments, await searchParams);
  if (branch) return await branch;
  return <main><h1>Alias destination</h1><p data-testid="destination">/admin/{segments.join("/")}</p></main>;
}
