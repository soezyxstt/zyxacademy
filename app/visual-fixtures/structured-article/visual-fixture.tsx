"use client";

import { IdeaBundleReviewDetail, ProductBundleReviewDetail } from "@/components/admin/material-review-detail";
import { StructuredArticleReader } from "@/components/course/structured-article-reader";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";

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
        { id: "real-1", blockKey: "real-1", blockType: "explanation", title: "Ide inti", orderIndex: 0, content: "Bilangan real mencakup bilangan rasional dan irasional. Setiap bilangan real dapat ditempatkan pada tepat satu titik di garis bilangan. Representasi desimalnya dapat berhenti, berulang, atau berlanjut tanpa pola berulang." },
        { id: "real-2", blockKey: "real-2", blockType: "mathematical_representation", title: "Representasi matematis", orderIndex: 1, content: "$$\\mathbb{R}=\\mathbb{Q}\\cup(\\mathbb{R}\\setminus\\mathbb{Q})$$\n\n| Bilangan | Representasi | Jenis |\n|---|---|---|\n| $\\frac{1}{4}$ | $0{,}25$ | Rasional berhenti |\n| $\\frac{1}{3}$ | $0{,}333\\ldots$ | Rasional berulang |\n| $\\sqrt{2}$ | $1{,}414213\\ldots$ | Irasional |" },
        { id: "real-3", blockKey: "real-3", blockType: "misconception", title: "Jangan terjebak", orderIndex: 2, content: "Bilangan $0{,}999\\ldots$ bukan bilangan yang sedikit lebih kecil dari 1. Keduanya menyatakan titik yang sama: $0{,}999\\ldots=1$." },
        { id: "real-4", blockKey: "real-4", blockType: "retrieval_prompt", title: "Cek pemahaman", orderIndex: 3, content: "Kelompokkan $-3$, $\\frac{7}{8}$, dan $\\sqrt{5}$ sebagai bilangan rasional atau irasional. Jelaskan alasanmu." },
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
      orderIndex: 2,
      parentSectionId: null,
      blocks: [
        { id: "ineq-1", blockKey: "ineq-1", blockType: "explanation", title: "Menjaga himpunan solusi", orderIndex: 0, content: "Operasi pada kedua ruas harus mempertahankan semua nilai yang memenuhi pertaksamaan semula. Penjumlahan dengan nilai yang sama mempertahankan urutan, sedangkan perkalian dengan bilangan negatif membalik urutan pada garis bilangan." },
        { id: "ineq-2", blockKey: "ineq-2", blockType: "worked_example", title: "Contoh bertahap", orderIndex: 1, content: "Selesaikan $-2x+3>7$.\n\n$$-2x>4$$\n\nBagi kedua ruas dengan $-2$ dan balik tanda:\n\n$$x<-2$$" },
        { id: "ineq-3", blockKey: "ineq-3", blockType: "retrieval_prompt", title: "Cek pemahaman", orderIndex: 2, content: "Selesaikan $5-3x\\leq14$, lalu periksa satu nilai yang berada di dalam himpunan solusi." },
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
        { id: "sum-2", blockKey: "sum-2", blockType: "retrieval_close", title: "Pemeriksaan akhir", orderIndex: 1, content: "Jelaskan dengan bahasamu sendiri mengapa pembagian oleh bilangan negatif membalik tanda pertaksamaan. Berikan satu contoh." },
      ],
    },
  ],
};

export function StructuredArticleVisualFixture({ mode }: { mode: "student" | "idea" | "product" }) {
  if (mode === "student") return <StructuredArticleReader article={sourceArticle} course={{ id: "matematika-1", title: "Matematika I" }} />;
  return (
    <main id="main-content" className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto max-w-[1536px] space-y-4">
        <h1 className="font-heading text-h5 font-bold">{mode === "idea" ? "Review Source Pack + Idea" : "Review Product"}</h1>
        {mode === "idea" ? <IdeaBundleReviewDetail detailId="visual-idea" courseLabels={{ "matematika-1": "Matematika I" }} /> : <ProductBundleReviewDetail detailId="visual-product" courseLabels={{ "matematika-1": "Matematika I" }} />}
      </div>
    </main>
  );
}
