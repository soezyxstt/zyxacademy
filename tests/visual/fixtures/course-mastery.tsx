import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { ConceptMap } from "@/components/course/concept-map";
import { CourseMasteryContentSkeleton } from "@/components/course/course-skeletons";
import id from "@/messages/id/learning.json";
import en from "@/messages/en/learning.json";

const { lang } = document.documentElement;
const mode = location.pathname.split("/").pop();
const name = lang === "en" ? "Square roots" : "Akar kuadrat";
const chapter = lang === "en" ? "Numbers and operations" : "Bilangan dan operasi";
const topics = Array.from({ length: 12 }, (_, index) => ({
  conceptName: index ? chapter + " " + index : name,
  conceptSlug: index ? null : "roots",
  masteryScore: index || mode === "empty" ? null : mode === "strong" ? 83 : 0,
  confidence: mode === "early" ? 15 : 72,
  trend: null,
  blockedBy: [],
}));
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale={lang} timeZone="UTC" messages={{ learning: lang === "en" ? en : id }}>
    <main className="mx-auto max-w-7xl p-4">
      {mode === "loading" ? <CourseMasteryContentSkeleton /> : <ConceptMap courseId="math" groups={[{
        chapter: { id: "numbers", title: chapter, orderIndex: 1 }, concepts: topics,
      }]} />}
    </main>
  </NextIntlClientProvider>
);
