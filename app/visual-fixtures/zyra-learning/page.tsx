import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { LearningCanvasRenderer } from "@/components/course/learning-canvas/learning-canvas-renderer";
import { RecentActivityCard } from "@/components/course/recent-activity-card";
import { learningActivityDescription } from "@/lib/learning-activity";
import { CanvasSpecSchema } from "@/lib/zyra/canvas/contracts";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HydratedFixture } from "./hydrated-fixture";

export default function ZyraLearningFixture() {
  if (process.env.NODE_ENV !== "development") notFound();
  const title = "Bab 1: Sistem bilangan, pertaksamaan, dan koordinat Kartesius";
  const titles = new Map([["article-ma101-bab1-foundations-v1:v3", title]]);
  const canvas = CanvasSpecSchema.parse({
    version: "zyra-learning-canvas-v1", type: "function_plot",
    title: "Kemiringan garis", purpose: "Amati perubahan kemiringan saat koefisien berubah.",
    altText: "Grafik garis dengan koefisien kemiringan yang dapat diubah.", claimRefs: [],
    variables: [{ id: "a", label: "Kemiringan", min: -3, max: 3, defaultValue: 1 }],
    controls: [{ variableId: "a", label: "Kemiringan", min: -3, max: 3, step: 0.5, presets: [-1, 0, 1, 2] }],
    domain: { min: -3, max: 3 }, series: [{ id: "line", label: "Garis", expression: "a*x+1" }],
    fallback: { summary: "Saat a = 1, y bertambah satu untuk setiap kenaikan x satu satuan.", columns: [{ id: "x", label: "x" }, { id: "y", label: "y" }], rows: [["-1", "0"], ["0", "1"], ["1", "2"]] },
  });
  return (
    <HydratedFixture><TooltipProvider><main className="mx-auto grid max-w-5xl items-start gap-6 p-4 lg:grid-cols-2">
      <RecentActivityCard data={[
        { id: "article", type: "material_completion", title: "Membaca materi", description: learningActivityDescription("article-article-ma101-bab1-foundations-v1:v3", titles), timestamp: "2026-10-15T00:00:00Z" },
        { id: "selection", type: "flashcard_review", title: "Aktivitas belajar", description: learningActivityDescription("selection-1792010868503", titles), timestamp: "2026-10-15T00:00:00Z" },
      ]} />
      <section className="min-w-0 space-y-3" aria-label="Jawaban Zyra">
        <p className="font-heading text-body-sm font-semibold text-brand-primary">Zyra</p>
        <MarkdownRenderer density="compact" content={'Bayangkan jalan menanjak. Koefisien $a$ mengatur kemiringan, sedangkan $b$ menentukan titik awal.\n\n$$\ny = ax + b\n$$\n\n1. Ubah kemiringan pada grafik.\n2. Bandingkan garis naik, datar, dan turun.\n\n**Cek pemahaman:** Apa yang berubah ketika $a$ menjadi negatif?'} />
        <LearningCanvasRenderer spec={canvas} />
      </section>
    </main></TooltipProvider></HydratedFixture>
  );
}
