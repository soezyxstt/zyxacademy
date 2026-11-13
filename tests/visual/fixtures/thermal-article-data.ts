import type { InteractiveDocumentSpec } from "@/lib/materials/interactive-document";
import { materializeArticleParts, type ArticlePart } from "@/lib/materials/article-parts";
import type { ProductEntity } from "@/lib/bundle/product-validator";
import type { FormativeCheckPayload } from "@/lib/materials/pedagogy-contract";
import { evaluateChoiceResponse } from "@/lib/materials/formative-evaluation";
import { formativeAnswerForReveal } from "@/lib/materials/formative-check-answer";

export function thermalChoiceResponse(check: FormativeCheckPayload, optionId: string) {
  return { ok: true, result: { ...evaluateChoiceResponse({ kind: "choice", optionId }, check.options ?? []), canRetry: check.feedbackPolicy?.allowRetry ?? true, revealAllowed: true } };
}

export function thermalRevealResponse(check: FormativeCheckPayload) {
  return { answer: formativeAnswerForReveal(check), explanation: check.explanation, visualAccess: {} };
}

// Synthetic provenance identifies this local learning fixture, not a published source.
const hash = "a".repeat(64);
const sourceRefs = [{ sourceId: "thermal-fixture-source", version: 1, checksum: hash, excerptIds: ["brick-parameters"] }];
const ideaIds = ["thermal-diffusion"];

export function createThermalArticle(spec: InteractiveDocumentSpec): Extract<ProductEntity, { productType: "article" }> {
  const block = (id: string, blockType: string, orderIndex: number, parts: ArticlePart[], extra: Record<string, unknown> = {}) => ({
    id, blockType, orderIndex, contentMarkdown: materializeArticleParts(parts), parts, ideaIds, sourceRefs, ...extra,
  });
  const prose = (id: string, markdown: string): ArticlePart => ({ id, kind: "markdown", markdown });
  const retrieval = (id: string, blockType: string, prompt: string, answer: string, distractor: string, explanation: string) =>
    block(id, blockType, 1, [prose(`${id}-text`, prompt)], { formativeCheckPayload: {
      checkKind: "multiple_choice", answer, explanation,
      options: [{ id: "correct", text: answer, isCorrect: true }, { id: "incorrect", text: distractor, isCorrect: false }],
      evaluation: { mode: "choice" }, feedbackPolicy: { hints: [], allowRetry: true },
    } });
  const pedagogy = (id: string, description: string, explanation: string, retrievalId: string, visual: boolean) => ({
    objectives: [{ id: `${id}-objective`, description, explanationBlockIds: [explanation], formativeCheckBlockIds: [retrievalId] }],
    prerequisites: [], symbols: [], timeEstimate: { readingMinutes: 1, examplesMinutes: 0, practiceMinutes: 1 },
    visualRequirement: visual ? { status: "required" as const, visualIds: [spec.id] } : { status: "not_required" as const, reason: "Bagian ini tidak memerlukan visual." },
  });
  const question = "Bandingkan selisih suhu pusat dan sudut pada menit ke-5 dan ke-30. Bagaimana perubahan selisihnya?";
  const explanation = String.raw`Berdasarkan nilai tampilan yang dibulatkan, selisih pada menit ke-5 adalah $991{,}4 - 132{,}5 = 858{,}9\,^{\circ}\mathrm{C}$ dan pada menit ke-30 adalah $1177{,}5 - 956{,}6 = 220{,}9\,^{\circ}\mathrm{C}$. Selama interval tersebut, suhu pusat naik $824{,}1\,^{\circ}\mathrm{C}$, sedangkan sudut naik $186{,}1\,^{\circ}\mathrm{C}$, sehingga selisih mengecil. Kesimpulan ini hanya untuk interval tersebut.`;
  return {
    id: "thermal-article", productType: "article", courseId: "thermal-course", chapterId: "thermal-chapter", version: 1, status: "draft",
    schemaVersion: "article.v4", slug: "pemanasan-bata", title: "Mengapa permukaan lebih cepat panas?",
    ideaLinks: [{ id: ideaIds[0], version: 1, semanticHash: hash, weight: 1, role: "primary" }],
    sourceRefs, sourceHash: hash, generationHash: hash, creatorId: "local-fixture", blocks: [], visuals: [spec],
    sections: [
      { id: "overview", kind: "overview", title: "Sebelum mengamati", slug: "overview", orderIndex: 0,
        learningObjective: "Mengenali jalur panas dari tungku ke dalam bata.", ideaIds, sourceRefs,
        pedagogy: pedagogy("overview", "Mengenali jalur panas dari tungku ke dalam bata.", "overview-explanation", "overview-check", false),
        blocks: [
          block("overview-explanation", "explanation", 0, [prose("overview-text", "Udara tungku memanaskan permukaan bata, lalu panas merambat ke bagian dalam.")]),
          retrieval("overview-check", "retrieval_prompt", "Proses apa yang membawa panas dari permukaan ke bagian dalam bata?", "Konduksi di dalam bata.", "Konveksi udara di dalam bata padat.", "Konduksi memindahkan energi melalui bahan bata, sedangkan konveksi terjadi antara udara dan permukaan."),
        ] },
      { id: "explore", kind: "topic", title: "Panas masuk dari luar", slug: "panas-masuk", orderIndex: 1, learningSectionId: "thermal-learning",
        learningObjective: "Menjelaskan perubahan perbedaan suhu di dalam bata.", ideaIds, sourceRefs,
        pedagogy: pedagogy("explore", "Menjelaskan perubahan perbedaan suhu di dalam bata.", "interpret", "check", true),
        blocks: [
          block("intro", "explanation", 0, [prose("intro-text", String.raw`Bata bersuhu awal $30\,^{\circ}\mathrm{C}$ dimasukkan ke tungku bersuhu $1200\,^{\circ}\mathrm{C}$. Udara memanaskan permukaan melalui konveksi, lalu energi merambat ke dalam melalui konduksi.`)]),
          block("visual", "explanation", 1, [prose("visual-prompt", "Bandingkan pusat dan sudut pada menit ke-5 dan ke-30."), { id: "brick-part", kind: "visual_ref", visualId: spec.id }], { visualIds: [spec.id] }),
          block("check", "retrieval_prompt", 2, [prose("check-prompt", question)], { title: "Cek pemahaman", formativeCheckPayload: {
            checkKind: "multiple_choice", answer: "B. Selisih mengecil.", explanation,
            options: [
              { id: "a", text: "Selisih membesar.", isCorrect: false },
              { id: "b", text: "Selisih mengecil.", isCorrect: true },
              { id: "c", text: "Selisih tetap.", isCorrect: false },
            ], evaluation: { mode: "choice" }, feedbackPolicy: { hints: [], allowRetry: true },
          } }),
          block("interpret", "explanation", 3, [prose("interpret-text", String.raw`Pada menit ke-5, pusat sekitar $132{,}5\,^{\circ}\mathrm{C}$ dan sudut sekitar $991{,}4\,^{\circ}\mathrm{C}$. Sudut dipengaruhi tiga permukaan yang berdekatan, sedangkan pusat lebih jauh dari permukaan.

Pada menit ke-30, pusat mencapai sekitar $956{,}6\,^{\circ}\mathrm{C}$ dan sudut sekitar $1177{,}5\,^{\circ}\mathrm{C}$. Selama interval ini, suhu pusat meningkat lebih besar daripada suhu sudut, sehingga selisihnya mengecil. Suhu bata belum sama dengan suhu udara tungku.`)]),
          block("model-math", "mathematical_representation", 4, [prose("model-text", String.raw`Bata berukuran $0{,}06\times0{,}10\times0{,}20\,\mathrm{m}$. Model memakai $k=1{,}9\,\mathrm{W/(m\,K)}$, $\rho=2400\,\mathrm{kg/m^3}$, $c_p=1130\,\mathrm{J/(kg\,K)}$, dan $h=80\,\mathrm{W/(m^2\,K)}$ pada keenam sisi.

Difusivitas termal menyatakan seberapa cepat perbedaan suhu merata:

$$\begin{aligned}
\alpha &= \frac{k}{\rho c_p} \\
&= \frac{1{,}9}{2400(1130)} \\
&\approx \boxed{7{,}01\times10^{-7}\,\mathrm{m^2/s}}
\end{aligned}$$

Perubahan suhu mengikuti persamaan konduksi tiga dimensi:

$$\begin{aligned}
\frac{\partial T}{\partial t} &= \alpha\bigg(\frac{\partial^2T}{\partial x^2} \\
&\quad+\frac{\partial^2T}{\partial y^2}+\frac{\partial^2T}{\partial z^2}\bigg).
\end{aligned}$$

Solusi memakai deret eigenfungsi dengan batas konveksi. Model ini mengabaikan radiasi dan perubahan fase serta memakai sifat bahan tetap.`)]),
        ] },
      { id: "summary", kind: "summary", title: "Rangkuman", slug: "summary", orderIndex: 2,
        learningObjective: "Menentukan batas penggunaan model pemanasan bata.", ideaIds, sourceRefs,
        pedagogy: pedagogy("summary", "Menentukan batas penggunaan model pemanasan bata.", "summary-explanation", "summary-check", false),
        blocks: [
          block("summary-explanation", "explanation", 0, [prose("summary-text", "Pusat memanas lebih lambat daripada sudut. Hasil model bergantung pada sifat bahan tetap dan tidak mencakup radiasi atau perubahan fase.")]),
          retrieval("summary-check", "retrieval_close", "Apa yang perlu dipertimbangkan ketika radiasi tungku signifikan?", "Model ini perlu dikembangkan karena belum memasukkan radiasi.", "Hasil model pasti tetap akurat tanpa perubahan.", "Radiasi diabaikan dalam model, sehingga pengaruhnya perlu dinilai sebelum memakai hasilnya."),
        ] },
    ],
  };
}
