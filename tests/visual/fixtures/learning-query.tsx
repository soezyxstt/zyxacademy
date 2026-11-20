import React, { useEffect, useState } from "react";
import "katex/dist/katex.min.css";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { createQueryClient, syncQueryAccount } from "@/lib/query/client";
import learning from "@/messages/id/learning.json";
import studentCourse from "@/messages/id/studentCourse.json";
import ui from "@/messages/id/ui.json";
import search from "@/messages/id/search.json";
import { StructuredArticleReader } from "@/components/course/structured-article-reader";
import { FlashcardClient } from "@/app/(student)/courses/[id]/flashcard/flashcard-client";
import { MaterialViewer } from "@/components/course/material-viewer";
import { Toaster } from "@/components/ui/toast";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import type { FlashcardQueueItem } from "@/lib/flashcards/review-contract";

declare global {
  interface Window {
    learningFixture: { mode: "article" | "flashcards" | "material" | "canonical-material"; demo?: boolean };
    changeLearningAccount: (userId: string | null) => void;
    closeLearningFixture: () => void;
  }
}

const client = createQueryClient();
syncQueryAccount(client, "fixture-student");
window.changeLearningAccount = (userId) => syncQueryAccount(client, userId);

const article: PublicArticleReadModel = {
  id: "fixture-article", version: 3, courseId: "fixture-course", chapterId: "chapter", slug: "perubahan", title: "Fungsi dan limit", courseTitle: "Matematika", chapterTitle: "Fungsi dan limit", chapterNumber: 1, totalEstimatedReadingMinutes: 3,
  progress: { completed: false, overallPercent: 0, lastSectionSlug: null, sectionProgress: {} },
  sections: [{
    id: "section", slug: "perubahan", title: "Mengukur perubahan", sectionNumber: "1.1", sectionKind: "topic", learningObjective: "Menghitung perubahan nilai fungsi.", estimatedReadingMinutes: 3, orderIndex: 0, parentSectionId: null,
    blocks: [{ id: "block", blockKey: "block", blockType: "explanation", title: "Dari nilai awal ke nilai akhir", orderIndex: 0,
      content: Array.from({ length: 12 }, (_, index) => `Langkah ${index + 1}. Kita tentukan nilai awal dan nilai akhir suatu fungsi. Selisih kedua nilai menunjukkan besar perubahan. Periksa satuan pada setiap langkah agar hasil tetap sesuai dengan soal.`).join("\n\n"),
    }],
  }],
};
const queue: FlashcardQueueItem[] = ["Apa turunan fungsi kuadrat?", "Apa arti limit fungsi?"].map((front, index) => ({
  card: { id: `card-${index}`, setId: "set", koId: null, front, back: index ? "Nilai yang didekati fungsi." : "Turunan x kuadrat adalah dua x.", explanation: "Periksa arti tiap simbol sebelum memakai rumus.", status: "active", metadata: { recallDifficulty: 2 }, createdAt: new Date("2026-11-18T00:00:00Z") },
  progress: null, dueStatus: "new", nextReviewDue: new Date(0), ideaId: null, masteryScore: null, confidence: null, seenBefore: false, priorityReason: "Kartu baru",
}));

function App() {
  const [open, setOpen] = useState(true);
  const [demoReviews, setDemoReviews] = useState(0);
  useEffect(() => {
    window.closeLearningFixture = () => setOpen(false);
  }, []);
  const config = window.learningFixture;
  if (!open) return <p role="status">Pembaca ditutup</p>;
  return <main className="mx-auto max-w-6xl p-4 text-foreground">
    {config.mode === "article" ? <StructuredArticleReader article={article} studentId="fixture-student" course={{ id: "fixture-course", title: "Matematika" }} />
      : config.mode === "flashcards" ? <FlashcardClient studentId="fixture-student" courseId="fixture-course" initialQueue={queue} adapter={config.demo ? { onReview: () => { setDemoReviews((count) => count + 1); }, backHref: "/" } : undefined} />
      : <MaterialViewer studentId="fixture-student" course={{ title: "Matematika" }} chapterId="chapter" ragEnabled accessTier="standard" material={{
        id: "fixture-material", courseId: "fixture-course", title: "Ringkasan fungsi", kind: "article", docCategory: "diktat", completed: false,
        source: config.mode === "material" ? "website_material" : undefined,
        body: "# Ringkasan fungsi\n\n## Makna fungsi\n\nFungsi memetakan setiap masukan ke tepat satu keluaran.\n\n## Perubahan nilai\n\nBandingkan nilai awal dan nilai akhir untuk menghitung perubahan.",
      }} />}
    {config.demo && <p role="status">{demoReviews} ulasan demo</p>}
    <Toaster />
  </main>;
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <NextIntlClientProvider locale="id" timeZone="UTC" messages={{ learning, studentCourse, ui, search }}><App /></NextIntlClientProvider>
  </QueryClientProvider>,
);
