import { describe, expect, it } from "bun:test";
import { parseQuestionsMarkdown, validateExtractedQuestion } from "@/lib/question-markdown";

describe("question Markdown visual preservation", () => {
  it("preserves visual payloads in prompts, multiline options and explanations", () => {
    const visual = '```zyx-visual\n{\n  "id": "plot-1",\n  "kind": "learning_canvas"\n}\n```';
    const questions = parseQuestionsMarkdown([
      "## Soal 1",
      "Pilih grafik yang benar.",
      visual,
      "A. Grafik pertama",
      visual,
      "B. Grafik kedua",
      "**Jawaban:** A",
      "**Pembahasan:** Perhatikan perubahan grafik.",
      visual,
      "Grafik pertama sesuai.",
      "## Soal 2",
      "**Tipe:** Isian Singkat",
      "Berapakah nilainya?",
      "**Jawaban:** 2",
    ].join("\n"));

    expect(questions).toHaveLength(2);
    expect(questions[0].prompt).toBe(`Pilih grafik yang benar.\n${visual}`);
    expect(questions[0].options).toEqual([`Grafik pertama\n${visual}`, "Grafik kedua"]);
    expect(questions[0].explanation).toBe(`Perhatikan perubahan grafik.\n${visual}\nGrafik pertama sesuai.`);
    expect(questions[0].correctIndices).toEqual([0]);
    expect(validateExtractedQuestion(questions[0], 1)).toBeNull();
    expect(questions[1].acceptableAnswers).toEqual(["2"]);
  });

  it("does not interpret headings, metadata or options inside a fence", () => {
    const fenced = [
      "````text",
      "## Soal 99",
      "**Tipe:** Essay",
      "**Jawaban:** E",
      "**Pembahasan:** Tetap bagian dari kode.",
      "A. Tetap bagian dari kode.",
      "```",
      "````",
    ].join("\n");
    const [question] = parseQuestionsMarkdown([
      "## Soal 1",
      "Baca kode berikut.",
      fenced,
      "A. Benar",
      "B. Salah",
      "**Jawaban:** B",
    ].join("\n"));

    expect(question.prompt).toBe(`Baca kode berikut.\n${fenced}`);
    expect(question.options).toEqual(["Benar", "Salah"]);
    expect(question.correctIndices).toEqual([1]);
    expect(question.explanation).toBe("");
    expect(question.questionType).toBe("multiple_choice");
  });

  it("keeps tilde fences intact without treating their contents as questions", () => {
    const fenced = "~~~text\n## Soal 2\n**Jawaban:** A\n~~~";
    const questions = parseQuestionsMarkdown(`## Soal 1\nBaca teks.\n${fenced}\nA. Ya\nB. Tidak\n**Jawaban:** B`);
    expect(questions).toHaveLength(1);
    expect(questions[0].prompt).toBe(`Baca teks.\n${fenced}`);
    expect(questions[0].correctIndices).toEqual([1]);
  });
});
