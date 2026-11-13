import type { RichDocumentPair } from "./rich-document-packages";
import { createThermalArticle } from "./thermal-article-data";
import { productEntitySchema } from "@/lib/bundle/product-validator";

export const questionCases = ["museum", "milk", "mechanics", "sampling", "brick", "annulus", "affine", "thermal-article"] as const;
export type QuestionCase = typeof questionCases[number];
export type Placement = "prompt" | "option" | "explanation";

const content: Record<Exclude<QuestionCase, "thermal-article">, [string, string[], string]> = {
  museum: ["Dari ruang 2, manakah urutan yang mencapai ruang 5 tanpa mengunjungi ruang yang sama dua kali?", ["2, 1, 3, 5", "2, 4, 5", "2, 7, 5"], "Rute 2, 1, 3, 5 mengikuti pintu yang tersedia. Dua rute lain memerlukan perpindahan tanpa pintu."],
  milk: ["Jika masukan kiri diubah menjadi putih dan kanan tetap cokelat, apa warna keluaran akhir?", ["Cokelat", "Putih"], "Mesin kiri menghasilkan cokelat, mesin kanan putih. Karena tidak keduanya cokelat, mesin akhir menghasilkan cokelat."],
  mechanics: ["Jika rasio frekuensi mendekati satu, mengapa amplitudo respons dapat meningkat?", ["Frekuensi pemaksa mendekati frekuensi alami", "Massa sistem menjadi nol", "Pegas berhenti bekerja"], "Di dekat frekuensi alami terjadi resonansi; redaman membatasi amplitudo respons tunak."],
  sampling: ["Jika ukuran sampel dinaikkan dari 16 menjadi 64, bagaimana standard error berubah?", ["Menjadi setengahnya", "Menjadi dua kali lipat", "Tetap sama"], "Standard error berbanding terbalik dengan akar ukuran sampel. Akar 64 dua kali akar 16, jadi standard error menjadi setengah."],
  brick: ["Mengapa sudut bata lebih dahulu mendekati suhu tungku daripada pusatnya?", ["Sudut menerima panas dari beberapa permukaan yang berdekatan", "Pusat bersentuhan langsung dengan tungku", "Konduksi hanya terjadi di sudut"], "Sudut dekat tiga permukaan yang dipanaskan, sedangkan panas harus merambat lebih jauh untuk mencapai pusat."],
  annulus: ["Laju massa dinaikkan dari 0,05 menjadi 0,10 kg/s. Dengan diameter, suhu masuk, suhu dinding, target suhu keluar, dan koefisien perpindahan panas tetap, bagaimana panjang pipa yang diperlukan berubah?", ["Menjadi dua kali panjang awal", "Menjadi setengah panjang awal", "Tetap sama"], "Dalam model berkoefisien tetap, panjang untuk mencapai target suhu yang sama berbanding lurus dengan laju massa. Panjang meningkat dari sekitar 49,98 m menjadi 99,95 m saat laju massa menjadi dua kali."],
  affine: ["Apa yang terjadi pada luas poligon jika parameter skala horizontal diubah dari 1 menjadi 2 dan parameter lain tetap?", ["Luas menjadi dua kali", "Luas tetap", "Luas menjadi empat kali"], "Determinan transformasi menjadi 2, sehingga luas dikalikan dua."],
};

export function makeQuestion(id: QuestionCase, pair: RichDocumentPair, placement: Placement) {
  let entry = id === "thermal-article" ? undefined : content[id];
  if (!entry) {
    const article = productEntitySchema.parse(createThermalArticle(pair.spec));
    if (article.productType !== "article") throw new Error("THERMAL_ARTICLE_REQUIRED");
    const block = article.sections.flatMap(section => section.blocks).find(item => item.id === "check")!;
    const check = block.formativeCheckPayload!;
    entry = [block.contentMarkdown, [check.options![1].text, check.options![0].text, check.options![2].text], check.explanation!];
  }
  const [prompt, options, explanation] = entry;
  const correctIndex = questionCases.indexOf(id) % options.length;
  const choices = options.map((_, index) => options[(index - correctIndex + options.length) % options.length]);
  const visual = `\`\`\`zyx-visual\n${JSON.stringify(pair.spec)}\n\`\`\``;
  return {
    id: `question-${id}-${placement}`, questionType: "multiple_choice", difficulty: "medium", cognitiveLevel: "apply",
    reasoningPattern: "interpret_model", tags: [id],
    prompt: placement === "prompt" ? `${prompt}\n\n${visual}` : prompt,
    options: placement === "option" ? choices.map((choice, index) => index === 1 ? `${choice}\n\n${visual}` : choice) : choices,
    correctIndices: [correctIndex], acceptableAnswers: [],
    explanation: placement === "explanation" ? `${explanation}\n\n${visual}` : explanation,
    ideaLinks: [{ ideaId: "published-idea", weight: 1, role: "primary" }],
  };
}
