import { notFound } from "next/navigation";
import { ProductLearningVisual } from "@/components/course/product-learning-visual";
import type { PublicSourceFigureVisualSpec } from "@/lib/articles/structured-read-model";

const base: PublicSourceFigureVisualSpec = { id: "loaded", kind: "source_figure", label: "Segitiga dan lingkaran dari sumber", description: "Koordinat titik menentukan alas $AC=6$ dan tinggi $OB=4$.", assetId: "a".repeat(64), interactive: false, captionMarkdown: "Segitiga memiliki luas $\\frac12(6)(4)=12$. Lingkaran berpusat di $O$ memiliki jari-jari $r=2$.", staticFallback: { type: "text", summary: "Segitiga sama kaki memiliki sisi $AB=BC=5$.", content: "Titik $A=(3,0)$, $B=(0,4)$, dan $C=(-3,0)$. Luas lingkaran adalah $4\\pi$." }, asset: { assetId: "a".repeat(64), imageUrl: "/api/courses/fixture/articles/article/source-figures/loaded", attribution: "Diagram sintetis lokal, milik Zyx.", width: 600, height: 400 } };

export default function SourceFiguresFixture() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="mx-auto max-w-prose space-y-8 p-4">
    <ProductLearningVisual spec={base} />
    <ProductLearningVisual spec={{ ...base, id: "unavailable", label: "Gambar belum tersedia", asset: undefined }} />
    <ProductLearningVisual spec={{ ...base, id: "broken", label: "Pemulihan kegagalan gambar", asset: { ...base.asset!, imageUrl: "/api/courses/fixture/articles/article/source-figures/broken" } }} />
  </main>;
}
