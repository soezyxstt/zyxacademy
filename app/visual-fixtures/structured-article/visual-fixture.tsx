"use client";

import { IdeaBundleReviewDetail, ProductBundleReviewDetail } from "@/components/admin/material-review-detail";
import { StructuredArticleReader } from "@/components/course/structured-article-reader";
import { TutorProvider } from "@/components/course/tutor-drawer";
import type { PublicArticleReadModel, PublicLearningCanvasVisualSpec } from "@/lib/articles/structured-read-model";
import { useEffect, useState } from "react";

const lineShiftVisual: PublicLearningCanvasVisualSpec = {
  id: "visual-line-shift",
  kind: "learning_canvas" as const,
  label: "Grafik garis sebelum dan sesudah digeser",
  description: "Geser nilai k untuk melihat garis hasil berpindah, sementara garis awal tetap menjadi pembanding.",
  interactive: true,
  canvas: {
    version: "zyra-learning-canvas-v1" as const,
    type: "function_plot" as const,
    title: "Pergeseran horizontal garis",
    purpose: "Menghubungkan nilai k dengan perubahan posisi grafik.",
    variables: [{ id: "k", label: "Pergeseran k", min: -2, max: 2, defaultValue: 1 }],
    controls: [{ variableId: "k", label: "Nilai k", min: -2, max: 2, step: 1, presets: [-1, 0, 1] }],
    claimRefs: [],
    altText: "Garis awal putus-putus dan garis hasil penuh.",
    fallback: {
      summary: "Ringkasan nilai grafik sebelum dan sesudah pergeseran.",
      columns: [{ id: "keadaan", label: "Keadaan" }, { id: "rumus", label: "Rumus" }],
      rows: [["awal", "y=x"], ["hasil", "y=(x-k)"]],
    },
    domain: { min: -4, max: 4, sampleCount: 48 },
    series: [
      { id: "source", label: "Awal", expression: "x", lineStyle: "dashed", role: "reference" },
      { id: "shifted", label: "Hasil", expression: "x-k", lineStyle: "solid", role: "primary" },
    ],
  },
};

const sourceArticle: PublicArticleReadModel = {
  id: "visual-article",
  courseId: "matematika-1",
  chapterId: "bab-1",
  slug: "pertaksamaan-dan-fungsi",
  title: "Pertaksamaan dan Fungsi",
  courseTitle: "Matematika I",
  chapterTitle: "Pertaksamaan dan Fungsi",
  chapterNumber: 1,
  version: 3,
  totalEstimatedReadingMinutes: 17,
  progress: {
    completed: false,
    overallPercent: 25,
    lastSectionSlug: "bilangan-real-dan-representasi",
    sectionProgress: {
      "sec-overview": { maxReadPercent: 100, completed: true, timeSpentSeconds: 180 },
    },
  },
  sections: [
    {
      id: "sec-overview",
      slug: "gambaran-bab",
      title: "Gambaran bab",
      sectionNumber: "Ikhtisar",
      sectionKind: "overview",
      learningObjective: "Mengenali hubungan bilangan real, pertaksamaan, dan fungsi sebelum mempelajari teknik penyelesaiannya.",
      estimatedReadingMinutes: 3,
      orderIndex: 0,
      parentSectionId: null,
      blocks: [
        { id: "ov-1", blockKey: "ov-1", blockType: "prior_knowledge_activation", title: "Sebelum mulai", orderIndex: 0, content: "Ingat kembali operasi dasar aljabar dan posisi bilangan pada garis bilangan. Keduanya akan digunakan untuk membaca himpunan solusi dan domain fungsi." },
        { id: "ov-2", blockKey: "ov-2", blockType: "problem_introduction", title: "Pertanyaan pemantik", orderIndex: 1, content: "Mengapa mengalikan pertaksamaan dengan bilangan negatif membalik tanda, sedangkan menambahkan bilangan yang sama tidak mengubah arahnya?" },
      ],
    },
    {
      id: "sec-real",
      slug: "bilangan-real-dan-representasi",
      title: "Bilangan real dan representasi desimal",
      sectionNumber: "1.1",
      sectionKind: "topic",
      learningObjective: "Menjelaskan representasi bilangan real dan menghubungkannya dengan posisi pada garis bilangan.",
      estimatedReadingMinutes: 5,
      orderIndex: 1,
      parentSectionId: null,
      blocks: [
        { id: "real-1", blockKey: "real-1", blockType: "explanation", title: "Ide inti", orderIndex: 0, content: "Bilangan real mencakup bilangan rasional dan irasional. Setiap bilangan real dapat ditempatkan pada tepat satu titik di garis bilangan. [[emphasis:remember]]Ingat: representasi desimal dapat berhenti, berulang, atau berlanjut tanpa pola berulang.[[/emphasis]]" },
        { id: "real-2", blockKey: "real-2", blockType: "mathematical_representation", title: "Representasi matematis", orderIndex: 1, content: "$$\\mathbb{R}=\\mathbb{Q}\\cup(\\mathbb{R}\\setminus\\mathbb{Q})$$\n\n| Bilangan | Representasi | Jenis |\n|---|---|---|\n| $\\frac{1}{4}$ | $0{,}25$ | Rasional berhenti |\n| $\\frac{1}{3}$ | $0{,}333\\ldots$ | Rasional berulang |\n| $\\sqrt{2}$ | $1{,}414213\\ldots$ | Irasional |" },
        { id: "real-3", blockKey: "real-3", blockType: "misconception", title: "Jangan terjebak", orderIndex: 2, content: "Bilangan $0{,}999\\ldots$ bukan bilangan yang sedikit lebih kecil dari 1. Keduanya menyatakan titik yang sama: $0{,}999\\ldots=1$." },
        {
          id: "real-4", blockKey: "real-4", blockType: "retrieval_prompt", title: "Cek pemahaman", orderIndex: 3,
          content: "Kelompokkan $-3$, $\\frac{7}{8}$, dan $\\sqrt{5}$ sebagai bilangan rasional atau irasional. Jelaskan alasanmu.",
          formativeCheck: {
            checkKind: "short_answer",
            evaluationMode: "text_exact",
            feedbackPolicy: { hints: ["Periksa apakah desimalnya berhenti, berulang, atau tidak berpola."], allowRetry: true },
          },
        },
      ],
    },
    {
      id: "sec-ineq",
      slug: "aturan-pertaksamaan",
      title: "Aturan operasi pertaksamaan",
      sectionNumber: "1.2",
      sectionKind: "topic",
      learningObjective: "Menerapkan operasi ekuivalen pada pertaksamaan dan mengenali kapan arah tanda harus dibalik.",
      estimatedReadingMinutes: 6,
      learningTimeEstimate: { readingMinutes: 6, examplesMinutes: 5, practiceMinutes: 4, totalMinutes: 15 },
      orderIndex: 2,
      parentSectionId: null,
        visuals: [
        {
          id: "visual-epsilon-delta",
          kind: "epsilon_delta_graph",
          label: "Grafik epsilon delta untuk fungsi linear",
          description: "Ubah epsilon untuk melihat pita keluaran dan delta yang menjamin nilai fungsi tetap di dalam pita.",
          bounds: { xMin: -1, xMax: 5, yMin: -1, yMax: 7 },
          limitPoint: 2,
          limitValue: 3,
          defaultEpsilon: 1,
          defaultDelta: 1,
          functionModel: { kind: "linear", m: 1, b: 1 },
          staticFallback: {
            type: "table",
            summary: "Contoh pasangan jarak x dan nilai fungsi di sekitar titik limit.",
            headers: ["x", "|x - 2|", "f(x)", "|f(x) - 3|"],
            rows: [[1.5, 0.5, 2.5, 0.5], [1.9, 0.1, 2.9, 0.1], [2.1, 0.1, 3.1, 0.1], [2.5, 0.5, 3.5, 0.5]],
          },
        },
        lineShiftVisual,
        ],
      blocks: [
        { id: "ineq-1", blockKey: "ineq-1", blockType: "explanation", title: "Menjaga himpunan solusi", orderIndex: 0, content: "Operasi pada kedua ruas harus mempertahankan semua nilai yang memenuhi pertaksamaan semula. Penjumlahan dengan nilai yang sama mempertahankan urutan, sedangkan perkalian dengan bilangan negatif membalik urutan pada garis bilangan." },
        {
          id: "ineq-2", blockKey: "ineq-2", blockType: "worked_example", title: "Contoh bertahap", orderIndex: 1,
          content: "Selesaikan $-2x+3>7$ dan verifikasi hasilnya.",
          workedExample: {
            steps: [
              { stepIndex: 0, label: "Pisahkan suku konstanta", explanation: "Kurangi kedua ruas dengan 3 sehingga diperoleh $-2x>4$.", reason: "Operasi yang sama pada kedua ruas mempertahankan himpunan solusi." },
              { stepIndex: 1, label: "Bagi dengan koefisien", explanation: "Bagi kedua ruas dengan $-2$ dan balik arah tanda sehingga $x<-2$.", reason: "Pembagian dengan bilangan negatif membalik urutan pada garis bilangan." },
              { stepIndex: 2, label: "Uji titik batas", explanation: "Nilai $x=-2$ menghasilkan $7>7$ yang salah, maka batas tidak ikut.", reason: "Tanda lebih besar ketat menghasilkan interval terbuka pada titik batas." },
              { stepIndex: 3, label: "Uji anggota solusi", explanation: "Nilai $x=-3$ menghasilkan $9>7$ yang benar.", reason: "Satu titik uji di sisi $x<-2$ mengonfirmasi arah interval solusi." },
            ],
            verification: "Substitusi $x=-3$ memenuhi pertaksamaan, sedangkan $x=0$ tidak. Jadi solusi $x<-2$ konsisten.",
          },
        },
        {
          id: "ineq-3", blockKey: "ineq-3", blockType: "retrieval_prompt", title: "Cek pemahaman", orderIndex: 2,
          content: "Apa hasil penyelesaian $5-3x\\leq14$?",
          formativeCheck: {
            checkKind: "multiple_choice",
            evaluationMode: "choice",
            feedbackPolicy: { hints: ["Perhatikan tanda koefisien x saat membagi."], allowRetry: true },
            options: [
              { id: "a", text: "$x\\leq-3$" },
              { id: "b", text: "$x\\geq-3$" },
              { id: "c", text: "$x\\leq3$" },
            ],
          },
        },
        {
          id: "ineq-4", blockKey: "ineq-4", blockType: "retrieval_close", title: "Cek angka", orderIndex: 3,
          content: "Jika jarak awal dari titik batas adalah $0{,}05$, tuliskan nilainya dalam meter.",
          formativeCheck: {
            checkKind: "numeric_answer",
            evaluationMode: "numeric",
            unit: "m",
            feedbackPolicy: { hints: ["Pertahankan nilai desimalnya saat mengubah satuan."], allowRetry: true },
          },
        },
      ],
    },
    {
      id: "sec-summary",
      slug: "ringkasan-dan-refleksi",
      title: "Ringkasan dan refleksi",
      sectionNumber: "Ringkasan",
      sectionKind: "summary",
      learningObjective: "Menghubungkan representasi bilangan real dengan aturan pertaksamaan dan domain fungsi.",
      estimatedReadingMinutes: 3,
      orderIndex: 3,
      parentSectionId: null,
      blocks: [
        { id: "sum-1", blockKey: "sum-1", blockType: "summary", title: "Inti bab", orderIndex: 0, content: "Bilangan real membentuk garis bilangan tanpa celah. Pertaksamaan menyatakan urutan dan himpunan solusi. Fungsi memakai himpunan tersebut untuk menjelaskan domain serta hubungan input dan output." },
        {
          id: "sum-2", blockKey: "sum-2", blockType: "retrieval_close", title: "Pemeriksaan akhir", orderIndex: 1,
          content: "Jelaskan dengan bahasamu sendiri mengapa pembagian oleh bilangan negatif membalik tanda pertaksamaan. Berikan satu contoh.",
          formativeCheck: {
            checkKind: "conceptual_explanation",
            evaluationMode: "ai_rubric",
            feedbackPolicy: { hints: ["Hubungkan operasi dengan perubahan urutan pada garis bilangan."], allowRetry: true },
          },
        },
      ],
    },
  ],
};

export function StructuredArticleVisualFixture({ mode }: { mode: "student" | "idea" | "product" }) {
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  if (mode === "student") return <TutorProvider><StructuredArticleReader article={sourceArticle} course={{ id: "matematika-1", title: "Matematika I" }} /></TutorProvider>;
  return (
    <TutorProvider>
      <main
        id="main-content"
        data-fixture-ready={ready ? "true" : "false"}
        className="min-h-screen bg-background p-4 text-foreground sm:p-6"
      >
        <div className="mx-auto max-w-[1536px] space-y-4">
          <h1 className="font-heading text-h5 font-bold">{mode === "idea" ? "Review Source Pack + Idea" : "Review Product"}</h1>
          {mode === "idea" ? <IdeaBundleReviewDetail detailId="visual-idea" courseLabels={{ "matematika-1": "Matematika I" }} /> : <ProductBundleReviewDetail detailId="visual-product" courseLabels={{ "matematika-1": "Matematika I" }} />}
        </div>
      </main>
    </TutorProvider>
  );
}
