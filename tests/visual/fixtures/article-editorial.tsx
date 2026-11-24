import React from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { StructuredArticleReader } from "@/components/course/structured-article-reader";
import type { PublicArticleReadModel, PublicLearningCanvasVisualSpec } from "@/lib/articles/structured-read-model";
import studentCourse from "@/messages/id/studentCourse.json";
import learning from "@/messages/id/learning.json";
import ui from "@/messages/id/ui.json";
import common from "@/messages/id/common.json";
import core from "@/messages/id/core.json";
import "katex/dist/katex.min.css";

const visual: PublicLearningCanvasVisualSpec = {
 id: "domain-plot", kind: "learning_canvas", label: "Grafik kuadrat", description: "Bandingkan nilai input dan keluaran.", interactive: true,
 canvas: { version: "zyra-learning-canvas-v1", type: "function_plot", title: "Grafik kuadrat", purpose: "Hubungan input dan kuadratnya.", variables: [], controls: [], claimRefs: [], altText: "Parabola melalui titik asal", domain: { min: -2, max: 2, sampleCount: 48 }, series: [{ id: "square", label: "Kuadrat", expression: "x^2", lineStyle: "solid", role: "primary" }], fallback: { summary: "Kuadrat bernilai nonnegatif.", columns: [{ id: "x", label: "Input" }, { id: "y", label: "Keluaran" }], rows: [["0", "0"], ["1", "1"]] } },
};
const article: PublicArticleReadModel = {
 courseTitle: "Matematika", chapterTitle: null,
 id: "editorial", courseId: "math", chapterId: "chapter", chapterNumber: 1, slug: "numbers", title: "Bilangan dan fungsi", version: 1, totalEstimatedReadingMinutes: 5,
 sections: [{ id: "numbers", slug: "numbers", sectionNumber: "01", sectionKind: "topic", orderIndex: 0, parentSectionId: null, title: "Bilangan real", learningObjective: "Membedakan bilangan rasional dan irasional.", estimatedReadingMinutes: 3, blocks: [
  { id: "theory", blockKey: "theory", blockType: "explanation", title: "Penjelasan inti", orderIndex: 0, content: "", visuals: [visual], parts: [
   { id: "prose", kind: "markdown", markdown: "Bilangan real dapat ditunjukkan sebagai titik pada garis bilangan. Bilangan rasional dapat ditulis sebagai perbandingan dua bilangan bulat dengan penyebut bukan nol.\n\n> Periksa syarat domain sebelum menyederhanakan rumus." },
   { id: "relations", kind: "math_unit", layout: "comparison", relations: [{ id: "square", latex: "f(x)=x^2", meaningMarkdown: "Kuadrat bilangan real.", conditionsMarkdown: "Domain: $x\\in\\mathbb{R}$." }, { id: "root", latex: "g(x)=\\sqrt{x}", meaningMarkdown: "Akar utama bernilai nonnegatif.", conditionsMarkdown: "Domain: $x\\geq0$." }], meaningMarkdown: "Syarat domain menentukan input yang dapat dipakai." },
   { id: "plot", kind: "visual_ref", visualId: visual.id },
  ] },
  { id: "trap", blockKey: "trap", blockType: "misconception", title: "Jangan hilangkan syarat", orderIndex: 1, content: "Pembagian oleh nol tidak terdefinisi. Syarat $x\\ne0$ tetap diperlukan setelah faktor yang sama dicoret." },
  ...[0, 1].map(index => ({ id: `example-${index}`, blockKey: `example-${index}`, blockType: "worked_example" as const, title: index ? "Contoh tambahan" : "Menyederhanakan pecahan", orderIndex: index + 2, content: "Sederhanakan $2x/x$.", workedExample: { steps: [{ stepIndex: 0, label: "Tetapkan domain", explanation: "$x\\ne0$ agar pembagian terdefinisi.", reason: "Penyebut tidak boleh nol." }, { stepIndex: 1, label: "Coret faktor yang sama", explanation: "$$\\frac{2x}{x}=2$$", reason: "Gunakan syarat domain pada langkah pertama." }], verification: "Hasilnya $2$, dengan syarat $x\\ne0$." } })),
  { id: "real-4", blockKey: "real-4", blockType: "retrieval_prompt", title: "Cek pemahaman: Klasifikasi bilangan", orderIndex: 4, content: "Klasifikasikan $1/2$ dan $\\sqrt{2}$.", formativeCheck: { checkKind: "short_answer", evaluationMode: "text_exact", feedbackPolicy: { hints: [], allowRetry: true } } },
 ] }, { id: "functions", slug: "functions", sectionNumber: "02", sectionKind: "topic", orderIndex: 1, parentSectionId: "numbers", title: "Fungsi dan domain", learningObjective: "Menghubungkan fungsi dengan himpunan inputnya.", estimatedReadingMinutes: 2, blocks: [{ id: "function-theory", blockKey: "function-theory", blockType: "explanation", title: null, orderIndex: 0, content: "Domain memuat semua input yang diizinkan. Definisi ini tetap terbuka ketika latihan disembunyikan." }] }],
};
function Fixture() {
 const [completed,setCompleted]=React.useState(false);
 return <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={{ studentCourse, learning, ui, core, common }}><StructuredArticleReader article={article} course={{ id: "math", title: "Matematika" }} adapter={{ ready: true, completed, onComplete(){setCompleted(true);} }} /></NextIntlClientProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
