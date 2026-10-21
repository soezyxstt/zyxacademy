import { notFound } from "next/navigation";
import { ProductLearningVisual } from "@/components/course/product-learning-visual";
import { epsilonDeltaGraphSpecSchema } from "@/lib/materials/visual-contract";

export default async function EpsilonDeltaFixture({ searchParams }: { searchParams: Promise<{ engine?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const engine = (await searchParams).engine === "legacy" ? "legacy" : "jsxgraph";
  const spec = epsilonDeltaGraphSpecSchema.parse({
    id: "quadratic-limit", kind: "epsilon_delta_graph", label: "Limit fungsi kuadrat", description: "Ubah $\\varepsilon$, lalu uji jarak input dan keluaran pada kurva $f(x)=x^2$ di sekitar $c=0$.",
    functionModel: { kind: "quadratic", a: 1, b: 0, c: 0 },
    limitPoint: 0, limitValue: 0, defaultEpsilon: 1, defaultDelta: 1,
    bounds: { xMin: -2, xMax: 2, yMin: -3, yMax: 5 },
    staticFallback: { type: "table", summary: "Nilai fungsi kuadrat di sekitar nol.", headers: ["$x$", "$f(x)$"], rows: [[-0.5, 0.25], [0, 0], [0.5, 0.25]] },
  });
  return <main className="mx-auto max-w-3xl space-y-6 p-4">
    <h1 className="font-heading text-h5">Lingkungan input dan toleransi keluaran</h1>
    <ProductLearningVisual spec={spec} engine={engine} />
    <ProductLearningVisual spec={{ ...spec, id: "precision-limit", label: "Batas presisi numerik", defaultEpsilon: 1e-320, defaultDelta: 1e-160, limitValue: 1e-7 }} engine={engine} />
  </main>;
}
