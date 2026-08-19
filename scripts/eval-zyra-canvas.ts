import {
  validateCanvasSpec,
  type CanvasSpec,
} from "@/lib/zyra/canvas";

function fallback() {
  return {
    summary: "Tabel ringkas untuk membaca hasil visual.",
    columns: [{ id: "value", label: "Nilai" }],
    rows: [["synthetic"]],
  };
}

function functionPlot(title: string, expression: string, claim: string): CanvasSpec {
  return {
    version: "zyra-learning-canvas-v1",
    type: "function_plot",
    title,
    purpose: "Menguji hubungan antarbesaran secara lokal.",
    variables: [],
    controls: [],
    claimRefs: [claim],
    altText: `Grafik ${title} dengan titik sampel terbatas.`,
    fallback: fallback(),
    domain: { min: -2, max: 2, sampleCount: 24 },
    series: [{ id: "f", label: "f(x)", expression }],
  };
}

function vector(type: "vector_diagram" | "free_body", title: string, unit: string, claim: string): CanvasSpec {
  return {
    version: "zyra-learning-canvas-v1",
    type,
    title,
    purpose: "Membaca arah dan besar besaran fisika.",
    variables: [],
    controls: [],
    claimRefs: [claim],
    altText: `Diagram ${title} dengan vektor berunit ${unit}.`,
    fallback: fallback(),
    vectors: [{ id: "v", label: "Vektor utama", x: 3, y: 4, unit }],
  };
}

function chemistry(title: string, formula: string, claim: string): CanvasSpec {
  return {
    version: "zyra-learning-canvas-v1",
    type: "chemistry_reaction",
    title,
    purpose: "Membaca koefisien dan hubungan jumlah zat.",
    variables: [],
    controls: [],
    claimRefs: [claim],
    altText: `Diagram reaksi ${title} dengan zat pereaksi dan produk.`,
    fallback: fallback(),
    reactants: [{ formula, coefficient: 1 }],
    products: [{ formula: "H2O", coefficient: 1 }],
  };
}

const mathFixtures: CanvasSpec[] = [
  functionPlot("Parabola", "x^2", "math-1"),
  functionPlot("Sinus", "sin(x)", "math-2"),
  functionPlot("Eksponensial", "exp(x)", "math-3"),
  {
    version: "zyra-learning-canvas-v1",
    type: "derivation",
    title: "Turunan sederhana",
    purpose: "Melihat perubahan bentuk persamaan secara bertahap.",
    variables: [],
    controls: [],
    claimRefs: ["math-4"],
    altText: "Tiga langkah derivasi sederhana.",
    fallback: fallback(),
    steps: [{ id: "step", label: "Langkah 1", expression: "2 + 2", explanation: "Gabungkan nilai yang diketahui." }],
  },
  {
    version: "zyra-learning-canvas-v1",
    type: "table",
    title: "Tabel nilai",
    purpose: "Membandingkan input dan output.",
    variables: [],
    controls: [],
    claimRefs: ["math-5"],
    altText: "Tabel input dan output.",
    fallback: fallback(),
    rows: [["0", "0"], ["1", "1"]],
  },
];

const physicsFixtures: CanvasSpec[] = [
  vector("vector_diagram", "Kecepatan", "m/s", "physics-1"),
  vector("free_body", "Gaya normal", "N", "physics-2"),
  functionPlot("Gerak lurus", "3*x + 1", "physics-3"),
  vector("vector_diagram", "Perpindahan", "m", "physics-4"),
  vector("free_body", "Berat benda", "N", "physics-5"),
];

const chemistryFixtures: CanvasSpec[] = [
  chemistry("Pembentukan air", "H2", "chem-1"),
  chemistry("Pembakaran", "CH4", "chem-2"),
  chemistry("Asam basa", "HCl", "chem-3"),
  chemistry("Oksidasi", "Fe", "chem-4"),
  chemistry("Penguraian", "CaCO3", "chem-5"),
];

const tutorialPkaFixture: CanvasSpec = {
  version: "zyra-learning-canvas-v1",
  type: "flowchart",
  title: "Langkah menjawab",
  purpose: "Menata urutan berpikir untuk latihan Tutorial PKA.",
  variables: [],
  controls: [],
  claimRefs: ["pka-1"],
  altText: "Diagram tiga langkah menjawab latihan.",
  fallback: fallback(),
  direction: "right",
  nodes: [
    { id: "read", label: "Baca soal" },
    { id: "choose", label: "Pilih prinsip" },
    { id: "check", label: "Periksa hasil" },
  ],
  edges: [
    { source: "read", target: "choose" },
    { source: "choose", target: "check" },
  ],
};

const fixtures = [
  ...mathFixtures,
  ...physicsFixtures,
  ...chemistryFixtures,
  tutorialPkaFixture,
];
const results = fixtures.map((fixture) => validateCanvasSpec(fixture));
const passed = results.filter((result) => result.isValid).length;
const report = {
  status: passed === fixtures.length ? "passed" : "failed",
  fixtureCount: fixtures.length,
  passed,
  failed: fixtures.length - passed,
  mathFixtures: mathFixtures.length,
  physicsFixtures: physicsFixtures.length,
  chemistryFixtures: chemistryFixtures.length,
  tutorialPkaFixtures: 1,
  providerCalls: 0,
};
console.log(JSON.stringify(report));
if (report.status !== "passed") process.exitCode = 1;
