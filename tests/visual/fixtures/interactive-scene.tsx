import React from "react";
import { createRoot } from "react-dom/client";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { ArticleParts } from "@/components/course/article-parts";
import { NextIntlClientProvider } from "next-intl";
import learning from "@/messages/id/learning.json";
import studentCourse from "@/messages/id/studentCourse.json";
import ui from "@/messages/id/ui.json";
import { ProductFormativeCheck } from "@/components/course/product-learning-blocks";
import { QuizPlayer } from "@/components/course/quiz-player";
import { visualSpecSchema } from "@/lib/materials/visual-contract";
import { drag, embed, machine, motion, singular } from "./interactive-scene-data";

const parsed = visualSpecSchema.parse(machine("structured", "Diagram artikel terstruktur"));
const bad = { ...machine("unsafe", "Ditolak"), html: "<script>window.fixtureExecuted=true</script>" };
const badShape = { ...machine("unsafe_shape", "Ditolak juga"), shapes: [{ type: "circle", cx: 0, cy: 0, r: 2, onClick: "alert(1)" }] };
const transport = { submit: async () => {} };
function App() {
  return <main className="mx-auto max-w-4xl min-w-0 space-y-8 p-4 text-foreground">
    <section data-fixture="article"><h1>Artikel</h1><MarkdownRenderer content={`Hubungan $n^2$ terlihat pada diagram.\n\n${embed(machine("article", "Diagram artikel"))}`} /></section>
    <section data-fixture="structured"><h2>Artikel terstruktur</h2><ArticleParts parts={[{ id: "structured-part", kind: "visual_ref", visualId: "structured" }]} visuals={[parsed]} /></section>
    <section data-fixture="quiz"><h2>Latihan</h2><QuizPlayer courseId="fixture" attemptId="fixture" transport={transport} exam={{ id: "fixture", title: "Latihan", settings: { timeLimitSeconds: 3600, shuffleOptions: false, shuffleQuestions: false }, questions: [{ id: "q1", order: 1, type: "multiple_choice", prompt: `Amati diagram.\n\n${embed(machine("prompt", "Diagram soal"))}`, options: [`Amati pilihan.\n\n${embed(machine("option", "Diagram pilihan"))}`, "Pilihan lain"] }] }} /></section>
    <section data-fixture="formative"><ProductFormativeCheck title="Cek pemahaman" content={`Amati cabang.\n\n${embed(machine("formative", "Diagram formatif"))}`} locator={{ articleId: "a", articleVersion: 1, sectionId: "s", blockId: "b" }} formativeCheck={{ checkKind: "multiple_choice", evaluationMode: null, options: [{ id: "a", text: `Pertama.\n\n${embed(machine("formative_option", "Diagram pilihan formatif"))}` }, { id: "b", text: "Kedua" }] }} /></section>
    <section data-fixture="explanation"><h2>Pembahasan</h2><MarkdownRenderer content={`Jumlah mengikuti $n^2$.\n\n${embed(motion("motion", "Batang berputar"))}`} /></section>
    <section data-fixture="drag" className="max-w-[380px]"><h2>Manipulasi titik</h2><MarkdownRenderer content={embed(drag)} /></section>
    <section data-fixture="singular"><h2>Pembagi</h2><MarkdownRenderer content={embed(singular)} /></section>
    <section data-fixture="invalid"><h2>Data tidak sah</h2><MarkdownRenderer content={`Teks sebelum visual.\n\n${embed(bad)}\n\n${embed(badShape)}\n\nTeks setelah visual.`} /></section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<NextIntlClientProvider locale="id" timeZone="UTC" messages={{ learning, studentCourse, ui }}><App /></NextIntlClientProvider>);
