import { notFound } from "next/navigation";
import { LearningCanvasRenderer } from "@/components/course/learning-canvas/learning-canvas-renderer";
import { MathText } from "@/components/course/math-text";
import { CanvasSpecSchema } from "@/lib/zyra/canvas/contracts";

const base = {
  version: "zyra-learning-canvas-v1",
  title: "Representasi ilmiah",
  purpose: "Hubungan kuantitas, satuan, dan representasi matematis.",
  variables: [], controls: [], claimRefs: ["scientific_fixture"],
  altText: "Representasi ilmiah dengan data lokal deterministik.",
  fallback: {
    summary: "Hubungan gaya, massa, dan percepatan.",
    columns: [{ id: "relation", label: "Hubungan" }, { id: "condition", label: "Syarat" }],
    rows: [["$a=\\frac{F}{m}$", "$m>0$"]],
  },
};

const fallback = (summary: string, headers: string[], rows: string[][]) => ({ summary, columns: headers.map((label, index) => ({ id: `c${index}`, label })), rows });

const fixtures = [
  { ...base, type: "function_plot", fallback: fallback("Fungsi $f(x)=x/2$.", ["$x$", "$f(x)$"], [["$4\\times10^{-4}$", "$2\\times10^{-4}$"]]), title: "Fungsi pada skala kecil", domain: { min: 0, max: 0.002, sampleCount: 41 }, series: [{ id: "f", label: "$f(x)$", expression: "x/2", unit: "N" }] },
  { ...base, type: "data_plot", fallback: fallback("Pengukuran gaya terhadap waktu.", ["$t$ ($\\pu{s}$)", "$F$ ($\\pu{N}$)"], [["$2\\times10^{-4}$", "$4\\times10^{-4}$"], ["$4\\times10^{-4}$", "$8\\times10^{-4}$"], ["$8\\times10^{-4}$", "$1.6\\times10^{-3}$"]]), title: "Data pengukuran", xLabel: "$t$", yLabel: "$F$", xUnit: "s", yUnit: "N", points: [{ x: 0.0002, y: 0.0004 }, { x: 0.0004, y: 0.0008 }, { x: 0.0008, y: 0.0016 }] },
  { ...base, type: "derivation", title: "Penurunan bertahap", steps: [{ id: "step1", label: "Hubungan $F$ dan $a$", expression: "F=ma", explanation: "Untuk massa $m>0$, bagi kedua sisi dengan $m$." }, { id: "step2", label: "Percepatan", expression: "a=\\frac{F}{m}", explanation: "Satuan percepatan adalah $\\mathrm{m\\,s^{-2}}$." }] },
  { ...base, type: "table", fallback: fallback("Nilai parameter tanpa satuan.", ["Parameter", "Nilai"], [["$\\alpha$", "$\\frac{1}{2}$"]]), title: "Tabel ilmiah", rows: [["$\\alpha$", "$\\frac{1}{2}$"]] },
  { ...base, type: "flowchart", fallback: fallback("Langkah mencari percepatan.", ["Diketahui", "Hasil", "Syarat"], [["$m,F$", "$a=F/m$", "$m>0$"]]), title: "Alur perhitungan", direction: "down", nodes: [{ id: "input", label: "Diketahui $m$ dan $F$" }, { id: "result", label: "$a=\\frac{F}{m}$" }], edges: [{ source: "input", target: "result", label: "$m>0$" }] },
  { ...base, type: "concept_map", fallback: fallback("Hubungan gaya dan percepatan.", ["Besaran", "Hubungan"], [["$\\vec F,\\vec a$", "$\\vec F=m\\vec a$"]]), title: "Peta konsep", direction: "right", nodes: [{ id: "force", label: "Gaya $\\vec F$" }, { id: "acceleration", label: "Percepatan $\\vec a$" }], edges: [{ source: "force", target: "acceleration", label: "$\\vec F=m\\vec a$" }] },
  ...(["vector_diagram", "free_body"] as const).map(type => ({ ...base, type, fallback: fallback("Komponen gaya pada sumbu Kartesius.", ["Gaya", "$F_x$ ($\\pu{N}$)", "$F_y$ ($\\pu{N}$)"], [["$\\vec F$", "$2$", "$3$"], ["$\\vec W$", "$0$", "$-2$"]]), title: type === "free_body" ? "Diagram benda bebas" : "Vektor gaya", originLabel: "Titik acuan $O=(0,0)$", vectors: [{ id: "force", label: "Gaya terapan $\\vec F$", x: 2, y: 3, unit: "N" }, { id: "weight", label: "Gaya berat $\\vec W$", x: 0, y: -2, unit: "N" }] })),
  { ...base, type: "chemistry_reaction", fallback: fallback("Perbandingan koefisien stoikiometri.", ["Zat", "Koefisien"], [["$\\ce{H2}$", "$2$"], ["$\\ce{O2}$", "$1$"], ["$\\ce{H2O}$", "$2$"]]), title: "Reaksi kimia", reactants: [{ formula: "H2", coefficient: 2 }, { formula: "O2", coefficient: 1 }], products: [{ formula: "H2O", coefficient: 2 }] },
];

export default function ScientificCanvasFixture() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="mx-auto w-full max-w-4xl space-y-8 px-3 py-6 md:px-6">
    <h1 className="font-heading text-h5">Representasi ilmiah</h1>
    <section data-scientific-kind="notation" className="space-y-3">
      <MathText as="div">{String.raw`$$\frac{a+b}{c},\quad c\ne0$$`}</MathText>
      <MathText as="div">{String.raw`$$\begin{pmatrix}1&2\\3&4\end{pmatrix}\begin{pmatrix}1\\0\end{pmatrix}=\begin{pmatrix}1\\3\end{pmatrix}$$`}</MathText>
      <MathText as="div">{String.raw`$$\ce{Ca(OH)2 + 2HCl -> CaCl2 + 2H2O}$$`}</MathText>
      <MathText as="div">{String.raw`$$\pu{4.00e-4 m s-2}$$`}</MathText>
    </section>
    {fixtures.map(fixture => <div key={fixture.type} data-scientific-kind={fixture.type}>
      <LearningCanvasRenderer spec={CanvasSpecSchema.parse(fixture)} />
    </div>)}
  </main>;
}
