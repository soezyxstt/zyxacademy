import { articlePartsSchema } from "@/lib/materials/article-parts";

export const semanticArticleParts = articlePartsSchema.parse([
  { id: "continuity-intro", kind: "markdown", markdown: "Untuk titik interior domain, kekontinuan di $c$ melibatkan lima hubungan yang saling terkait. Setiap hubungan berikut memiliki arti lokal." },
  { id: "continuity", kind: "math_unit", layout: "comparison", meaningMarkdown: "Kelima hubungan harus konsisten pada titik yang diuji.", symbolDefinitions: [{ id: "c", latex: "c", meaningMarkdown: "Titik domain yang sedang diuji." }, { id: "f", latex: "f", meaningMarkdown: "Fungsi bernilai real." }], symbolRefs: ["c", "f"], relations: [
    { id: "defined", latex: "f(c)\\in\\mathbb{R}", meaningMarkdown: "Nilai fungsi pada titik yang diuji tersedia.", conditionsMarkdown: "$c$ berada dalam domain $f$." },
    { id: "left-limit", latex: "\\lim_{x\\to c^-}f(x)=L", meaningMarkdown: "Keluaran dari sisi kiri mendekati nilai yang dituju.", conditionsMarkdown: "Ada titik domain di sebelah kiri $c$." },
    { id: "right-limit", latex: "\\lim_{x\\to c^+}f(x)=L", meaningMarkdown: "Keluaran dari sisi kanan mendekati nilai yang sama.", conditionsMarkdown: "Ada titik domain di sebelah kanan $c$." },
    { id: "limit-exists", latex: "\\lim_{x\\to c}f(x)=L", meaningMarkdown: "Keluaran mendekati satu nilai yang sama dari kedua sisi.", conditionsMarkdown: "Limit kiri dan kanan harus sama." },
    { id: "matches", latex: "L=f(c)", meaningMarkdown: "Nilai limit harus sama dengan nilai fungsi pada titik tersebut." },
  ] },
  { id: "piecewise", kind: "math_unit", layout: "cases", meaningMarkdown: "Gunakan aturan yang sesuai dengan tanda input.", relations: [
    { id: "negative", latex: "-x", conditionLatex: "x<0", meaningMarkdown: "Input negatif dibalik tandanya.", conditionsMarkdown: "$x<0$." },
    { id: "nonnegative", latex: "x", conditionLatex: "x\\ge0", meaningMarkdown: "Input tak negatif dipertahankan.", conditionsMarkdown: "$x\\ge0$." },
  ] },
  { id: "factor-example", kind: "worked_example", title: "Menghilangkan bentuk tak tentu", problemMarkdown: "Tentukan $\\lim_{x\\to1}\\frac{x^2-1}{x-1}$. Substitusi langsung menghasilkan bentuk $0/0$.", verificationMarkdown: "Untuk $x$ yang mendekati $1$, $x+1$ mendekati $2$. Nilai fungsi asal di $x=1$ tetap tidak terdefinisi.", steps: [
    { id: "factor-step", operationMarkdown: "Faktorkan pembilang", reasonMarkdown: "Identitas selisih kuadrat $a^2-b^2=(a-b)(a+b)$ berlaku untuk semua bilangan real.", sourceElementRefs: ["continuity"], parts: [{ id: "factor-relation", kind: "math_unit", latex: "\\frac{x^2-1}{x-1}=\\frac{(x-1)(x+1)}{x-1}", meaningMarkdown: "Pembilang ditulis sebagai hasil kali tanpa mengubah nilainya.", conditionsMarkdown: "$x\\ne1$." }] },
    { id: "cancel-step", operationMarkdown: "Sederhanakan faktor yang sama", reasonMarkdown: "Faktor $x-1$ dapat dicoret karena bernilai bukan nol dalam lingkungan berlubang.", conditionsMarkdown: "Pembagian oleh nol tetap dilarang.", sourceElementRefs: ["factor-step"], parts: [{ id: "cancel-relation", kind: "math_unit", latex: "\\frac{(x-1)(x+1)}{x-1}=x+1", meaningMarkdown: "Di sekitar titik limit, fungsi asal sama dengan fungsi linear ini.", conditionsMarkdown: "$x\\ne1$." }] },
  ] },
]);
