import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { ProductLearningVisual } from "@/components/course/product-learning-visual";
import { LearningCanvasRenderer } from "@/components/course/learning-canvas/learning-canvas-renderer";
import { FunctionPlotCanvasSchema } from "@/lib/zyra/canvas/contracts";

const examples = [
  { id: "powers", title: "Fungsi pangkat", formulas: ["y=x^n", "x^{1/2}=\\sqrt{x}", "x^{1/3}=\\sqrt[3]{x}", "x^{3/2}=(\\sqrt{x})^3", "x^{2/3}=(\\sqrt[3]{x})^2"], expressions: ["x^2", "x^3"] },
  { id: "reciprocal", title: "Fungsi resiprokal", formulas: ["f(x)=\\frac{1}{x}", "g(x)=\\frac{1}{x^2}", "\\lim_{x\\to\\pm\\infty}f(x)=0", "\\lim_{x\\to\\pm\\infty}g(x)=0"], expressions: ["1/x", "1/x^2"] },
  { id: "trigonometry", title: "Trigonometri", formulas: ["\\sin(\\theta+2\\pi)=\\sin\\theta,\\quad \\cos(\\theta+2\\pi)=\\cos\\theta", "\\sin(-\\theta)=-\\sin\\theta,\\quad \\cos(-\\theta)=\\cos\\theta", "\\sin^2\\theta+\\cos^2\\theta=1", "\\tan\\theta=\\frac{\\sin\\theta}{\\cos\\theta},\\quad\\cos\\theta\\ne0"], expressions: ["sin(x)", "cos(x)"] },
  { id: "transform", title: "Transformasi fungsi", formulas: ["y=a(c(x-k))^2", "|a|\\text{ mengubah skala vertikal}", "1/|c|\\text{ mengubah skala horizontal}"], expressions: ["x^2", "a*(c*(x-k))^2"] },
  { id: "geometry", title: "Lingkaran, elips, dan hiperbola", formulas: ["x^2+y^2=9", "\\frac{x^2}{9}+\\frac{y^2}{4}=1", "xy=4"], expressions: ["sqrt(9-x^2)", "-sqrt(9-x^2)", "2*sqrt(1-x^2/9)", "-2*sqrt(1-x^2/9)", "4/x"] },
];

export default function ArticleGraphsFixture() {
  if (process.env.NODE_ENV !== "development") notFound();
  const plots = examples.map(example => FunctionPlotCanvasSchema.parse({
    version: "zyra-learning-canvas-v1", type: "function_plot",
    title: example.title, purpose: "Bandingkan bentuk kurva fungsi.", altText: `Grafik ${example.title.toLowerCase()}.`,
    domain: { min: -5, max: 5 }, equalAxisScale: example.id === "geometry",
    series: example.expressions.map((expression, index) => ({ id: `f${index}`, label: `Fungsi ${index + 1}`, expression, lineStyle: index % 2 ? "solid" : "dashed", excludedX: expression.includes("/x") ? [0] : [] })),
    variables: example.id === "transform" ? ["k", "a", "c"].map(id => ({ id, label: id, min: -3, max: 3, defaultValue: 1 })) : [],
    controls: example.id === "transform" ? ["k", "a", "c"].map(id => ({ variableId: id, label: id, min: -3, max: 3, step: 0.5, presets: [-1, 0, 1, 2] })) : [],
    pointMarkers: example.id === "trigonometry" ? [{ seriesId: "f0", x: 0, y: 0, label: "O", kind: "closed" }] : [],
    fallback: { summary: "Nilai acuan pada kurva pertama.", columns: [{ id: "x", label: "x" }, { id: "y", label: "y" }], rows: [["1", example.id === "trigonometry" ? "0.8415" : example.id === "geometry" ? "2.8284" : "1"]] },
  }));
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl space-y-8 p-4">
      <h1 className="font-heading text-h5">Formula dan grafik artikel</h1>
      {examples.map((example, index) => (
        <section key={example.id} id={example.id} className="min-w-0 space-y-3">
          <h2 className="font-heading text-body-base font-bold">{example.title}</h2>
          <MarkdownRenderer content={example.formulas.map(formula => `$$${formula}$$`).join("\n\n")} />
          <ProductLearningVisual spec={{ id: `graph-${example.id}`, kind: "learning_canvas", label: example.title, description: plots[index].altText, interactive: true, canvas: plots[index] }} />
        </section>
      ))}
      <section id="tall-and-wide" className="min-w-0 space-y-3">
        <h2 className="font-heading text-body-base font-bold">Integral dan identitas</h2>
        <MarkdownRenderer content={String.raw`$$\int_{0}^{\infty}\frac{\sqrt{x}}{1+x^2}\,dx$$

$$\sum_{n=1}^{\infty}\frac{1}{n^2}=\frac{\pi^2}{6}$$

$$\underbrace{\frac{a}{b}+\frac{c}{d}+\frac{e}{f}+\frac{g}{h}+\frac{i}{j}+\frac{k}{l}+\frac{m}{n}+\frac{o}{p}+\frac{q}{r}+\frac{s}{t}+\frac{u}{v}+\frac{w}{z}}_{\text{Jumlah pecahan}}$$

- $$x^{1/2}=\sqrt{x}$$ untuk $x\ge0$.
- $$x^{1/3}=\sqrt[3]{x}$$ untuk $x\in\mathbb{R}$.`} />
      </section>
      <section id="zyra" className="min-w-0 space-y-3">
        <h2 className="font-heading text-body-base font-bold">Grafik Zyra</h2>
        <LearningCanvasRenderer spec={plots[3]} />
      </section>
    </main>
  );
}
