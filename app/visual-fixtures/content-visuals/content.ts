import type { PublicLearningCanvasVisualSpec } from "@/lib/articles/structured-read-model";

function plot(id: string, label: string): PublicLearningCanvasVisualSpec {
  return {
    id, kind: "learning_canvas", label, description: "Ubah kemiringan garis terhadap sumbu horizontal.", interactive: true,
    canvas: {
      version: "zyra-learning-canvas-v1", type: "function_plot", title: label,
      purpose: "Bandingkan kemiringan positif, nol, dan negatif.",
      altText: "Garis y = ax dengan koefisien kemiringan yang dapat diubah.", claimRefs: [],
      variables: [{ id: "a", label: "Kemiringan", min: -2, max: 2, defaultValue: 1 }],
      controls: [{ variableId: "a", label: "Kemiringan", min: -2, max: 2, step: 0.5, presets: [-1, 0, 1, 2] }],
      domain: { min: -2, max: 2, sampleCount: 48 },
      series: [{ id: "line", label: "Garis", expression: "a*x", lineStyle: "solid", role: "primary" }],
      fallback: {
        summary: "Pada kemiringan awal, y sama dengan x.",
        columns: [{ id: "x", label: "$x$" }, { id: "y", label: "$y$" }],
        rows: [["-1", "-1"], ["0", "0"], ["1", "1"]],
      },
    },
  };
}

function embed(spec: PublicLearningCanvasVisualSpec) {
  return `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``;
}

export const prompt = `Amati grafik $y=ax$ sebelum memilih jawaban.\n\n${embed(plot("question-plot", "Grafik soal"))}\n\nApa yang terjadi ketika koefisien $a$ bernilai positif?`;
export const options = [
  `Garis naik dari kiri ke kanan.\n\n${embed(plot("option-plot", "Grafik pilihan jawaban"))}`,
  "Garis turun dari kiri ke kanan.",
];
export const explanation = `Koefisien $a$ menentukan kemiringan garis.\n\n${embed(plot("explanation-plot", "Grafik pembahasan"))}\n\nSaat $a>0$, kenaikan nilai $x$ diikuti kenaikan nilai $y$.`;
export const invalidContent = "Teks sebelum visual tetap terbaca.\n\n```zyx-visual\n{\"kind\":\"learning_canvas\",\"canvas\":{\"type\":\"function_plot\"}}\n```\n\nTeks setelah visual tetap terbaca.";
