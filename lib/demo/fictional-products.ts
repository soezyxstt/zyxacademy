import { buildPublicArticleReadModel } from "@/lib/articles/structured-read-model";

/** Authored public demo content, never a copy of an unavailable learning product. */
export function fictionalDemoProducts(course: { id: string; title: string }, chapter: { id: string; title: string; orderIndex: number }) {
  const prefix = `fictional-${course.id}`;
  const examples: Record<string, [string, string, string][]> = {
    "Matematika I": [
      ["Jika x + 2 = 5, berapa x?", "3", "Kurangi kedua ruas dengan 2."],
      ["Berapa nilai mutlak dari -4?", "4", "Nilai mutlak menyatakan jarak dari nol."],
      ["Titik (2, 3) memiliki koordinat x berapa?", "2", "Koordinat pertama menyatakan posisi pada sumbu x."],
    ],
    "Fisika Dasar I": [
      ["Besaran yang memiliki besar dan arah disebut apa?", "Vektor", "Vektor memiliki besar dan arah."],
      ["Dua perpindahan 2 m dan 3 m searah menghasilkan berapa?", "5 m", "Besar vektor searah dijumlahkan."],
      ["Satuan SI untuk panjang adalah apa?", "Meter", "Meter merupakan satuan dasar SI untuk panjang."],
    ],
    "Kimia Dasar I": [
      ["Zat yang tersusun dari satu jenis atom disebut apa?", "Unsur", "Unsur tersusun dari satu jenis atom."],
      ["Air murni, H2O, termasuk apa?", "Senyawa", "Air mengandung hidrogen dan oksigen dengan perbandingan tetap."],
      ["Tabel periodik modern diurutkan berdasarkan apa?", "Nomor atom", "Nomor atom menyatakan jumlah proton."],
    ],
    "Berpikir Komputasional": [
      ["Memecah masalah besar menjadi bagian kecil disebut apa?", "Dekomposisi", "Bagian kecil dapat diselesaikan satu per satu."],
      ["Memilih informasi penting dan mengabaikan detail yang tidak relevan disebut apa?", "Abstraksi", "Abstraksi mempertahankan informasi yang diperlukan untuk menyelesaikan masalah."],
      ["Urutan langkah yang jelas untuk menyelesaikan masalah disebut apa?", "Algoritma", "Algoritma menyusun langkah penyelesaian secara terurut."],
    ],
  };
  const entries = examples[course.title];
  if (!entries) return null;
  const articleId = `${prefix}-article`;
  const title = chapter.title;
  const content = entries.map(([question, answer, explanation]) => `### ${question}\n\n${answer}. ${explanation}`).join("\n\n");
  const article = buildPublicArticleReadModel(
    { id: articleId, courseId: course.id, babId: chapter.id, slug: articleId, title, version: 1 },
    [{ id: `${prefix}-section`, slug: "konsep-dasar", title, learningObjective: "Mengenali konsep dasar dan penerapannya.", sectionKind: "topic", orderIndex: 0, estimatedReadingMinutes: 3 }],
    [{ id: `${prefix}-block`, bagianArtikelId: `${prefix}-section`, blockKey: "konsep", blockType: "text", orderIndex: 0, content }],
    null, { id: chapter.id, title, number: chapter.orderIndex, courseTitle: course.title },
  );
  return {
    article,
    diktat: { id: `${prefix}-diktat`, title, sections: [{ title, content }] },
    flashcardSet: { id: `${prefix}-flashcards`, title },
    flashcards: entries.map(([front, back, explanation]) => ({ front, back, explanation })),
    quiz: entries.map(([prompt, answer, explanation], index) => ({
      id: `${prefix}-question-${index + 1}`, version: 1, prompt,
      options: [answer, entries[(index + 1) % entries.length][1]], multiple: false, correctIndices: [0], explanation,
    })),
  };
}
