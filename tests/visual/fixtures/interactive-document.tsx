import React from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import learning from "@/messages/id/learning.json";
import studentCourse from "@/messages/id/studentCourse.json";
import ui from "@/messages/id/ui.json";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { ArticleParts } from "@/components/course/article-parts";
import { ProductFormativeCheck } from "@/components/course/product-learning-blocks";
import { QuizPlayer } from "@/components/course/quiz-player";
import { InteractiveDocumentArticle, InteractiveDocumentArticleLocation } from "@/components/course/interactive-document-context";
import { interactiveDocumentSchema, type InteractiveDocumentSpec } from "@/lib/materials/interactive-document";

declare global { interface Window { fixtureSpecs: Record<string, InteractiveDocumentSpec> } }
const specs = Object.fromEntries(Object.entries(window.fixtureSpecs).map(([key, value]) => [key, interactiveDocumentSchema.parse(value)]));
const embed = (spec: InteractiveDocumentSpec) => `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``;
const article = { courseId: "fixture-course", articleId: "fixture-article", articleVersion: 1 };

function App() {
  return <main className="mx-auto max-w-4xl min-w-0 space-y-8 p-4 text-foreground">
    <InteractiveDocumentArticle value={article}>
      <section data-fixture="article"><h1>Jalur museum</h1><InteractiveDocumentArticleLocation sectionId="museum" blockId="museum"><ArticleParts parts={[{ id: "museum-part", kind: "visual_ref", visualId: "museum" }]} visuals={[specs.museum]} /></InteractiveDocumentArticleLocation></section>
      <section data-fixture="mechanics"><h2>Getaran dan perpindahan panas</h2>{["mechanics", "brick", "annulus"].map(id => <InteractiveDocumentArticleLocation key={id} sectionId="physics" blockId={id}><ArticleParts parts={[{ id: `${id}-part`, kind: "visual_ref", visualId: id }]} visuals={[specs[id]]} /></InteractiveDocumentArticleLocation>)}</section>
      <section data-fixture="formative"><InteractiveDocumentArticleLocation sectionId="exercise" blockId="formative"><ProductFormativeCheck title="Cek pemahaman" content="Perhatikan pilihan berikut." locator={{ articleId: article.articleId, articleVersion: 1, sectionId: "exercise", blockId: "formative" }} formativeCheck={{ checkKind: "multiple_choice", evaluationMode: null, options: [{ id: "a", text: embed(specs.museum_copy) }, { id: "b", text: "Pilihan lain" }] }} /></InteractiveDocumentArticleLocation></section>
    </InteractiveDocumentArticle>
    <section data-fixture="quiz"><h2>Latihan</h2><QuizPlayer courseId="fixture-course" attemptId="fixture-attempt" exam={{ id: "fixture-quiz", title: "Latihan", settings: { timeLimitSeconds: 3600, shuffleOptions: false, shuffleQuestions: false }, questions: [{ id: "q1", order: 1, type: "multiple_choice", prompt: `Amati mesin.\n\n${embed(specs.milk)}`, options: [embed(specs.sampling), "Pilihan lain"] }] }} /></section>
    <section data-fixture="markdown"><h2>Notasi</h2><MarkdownRenderer content="Untuk $n=64$, perhatikan perubahan simpangan baku." /></section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<NextIntlClientProvider locale="id" timeZone="UTC" messages={{ learning, studentCourse, ui }}><App /></NextIntlClientProvider>);
