import type { ProductDraftInput } from "@/lib/authoring/product-draft-builder";

export function solutionCollectionDraft(): ProductDraftInput {
  const prose = (markdown: string) => [{ kind: "markdown" as const, markdown }];
  return { products: [{ productType: "solution_collection", title: "Penjumlahan", ideaIds: ["idea"],
    sourceRefs: [{ sourceId: "source", excerptIds: ["excerpt"] }],
    items: [{ title: "Jumlah dua bilangan", questionType: "numeric", discipline: "mathematics", template: "calculation",
      prompt: prose("Hitung 1 + 1."), options: [], answer: { parts: prose("2"), optionIds: [] }, strategy: prose("Jumlahkan kedua bilangan."),
      steps: [{ operationMarkdown: "1 + 1 = 2", reasonMarkdown: "Tambahkan satu pada satu." }],
      verification: prose("2 - 1 = 1."), visuals: [], provenance: {
        problem: { kind: "original", attribution: "Penulis", sources: [] },
        solution: { kind: "original", attribution: "Penulis", sources: [] },
      },
    }],
  }] };
}
