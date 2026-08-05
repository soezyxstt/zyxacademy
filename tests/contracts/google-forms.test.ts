import { describe, test, expect } from "bun:test";
import { CreateCustomQuestionInput, QuestionType } from "@/lib/google-forms";

describe("Google Forms Contract & Payload Tests", () => {
  test("FORMS-001: All 12 Google Forms question types are correctly typed and accepted", () => {
    const allTypes: QuestionType[] = [
      "TEXT",
      "PARAGRAPH",
      "RADIO",
      "CHECKBOX",
      "DROP_DOWN",
      "FILE_UPLOAD",
      "SCALE",
      "RATING",
      "GRID_RADIO",
      "GRID_CHECKBOX",
      "DATE",
      "TIME",
    ];

    expect(allTypes.length).toBe(12);

    const questions: CreateCustomQuestionInput[] = [
      { title: "Jawaban Singkat", type: "TEXT", required: true },
      { title: "Paragraf / Teks Panjang", type: "PARAGRAPH", required: true },
      { title: "Pilihan Ganda", type: "RADIO", options: ["Opsi A", "Opsi B"], required: true },
      { title: "Kotak Centang", type: "CHECKBOX", options: ["Centang 1", "Centang 2"], required: true },
      { title: "Menu Dropdown", type: "DROP_DOWN", options: ["Pilihan 1", "Pilihan 2"], required: true },
      { title: "Unggah Berkas", type: "FILE_UPLOAD", required: false },
      { title: "Skala Penilaian Linear", type: "SCALE", scaleLow: 1, scaleHigh: 5, scaleLowLabel: "Buruk", scaleHighLabel: "Baik" },
      { title: "Penilaian Bintang", type: "RATING", required: true },
      { title: "Kisi Pilihan Ganda", type: "GRID_RADIO", gridRows: ["Baris 1", "Baris 2"], gridColumns: ["Sangat Setuju", "Tidak Setuju"] },
      { title: "Kisi Kotak Centang", type: "GRID_CHECKBOX", gridRows: ["Baris A", "Baris B"], gridColumns: ["Pilihan X", "Pilihan Y"] },
      { title: "Pilih Tanggal Lahir", type: "DATE", required: true },
      { title: "Pilih Waktu / Jam", type: "TIME", required: true },
    ];

    expect(questions.length).toBe(12);
    for (let i = 0; i < questions.length; i++) {
      expect(questions[i].type).toBe(allTypes[i]);
    }
  });

  test("FORMS-002: Grid question types contain row and column definitions", () => {
    const gridQuestion: CreateCustomQuestionInput = {
      title: "Evaluasi Pelayanan Sesi Tutorial",
      type: "GRID_RADIO",
      gridRows: ["Kecepatan Tampil", "Kejelasan Penjelasan", "Kualitas Materi"],
      gridColumns: ["Sangat Kurang", "Kurang", "Cukup", "Baik", "Sangat Baik"],
      required: true,
    };

    expect(gridQuestion.gridRows?.length).toBe(3);
    expect(gridQuestion.gridColumns?.length).toBe(5);
  });

  test("FORMS-003: Questions accept optional imageUrl for image attachments", () => {
    const questionWithImage: CreateCustomQuestionInput = {
      title: "Perhatikan diagram berikut!",
      type: "RADIO",
      options: ["Fisika 1", "Fisika 2"],
      imageUrl: "https://pub-storage.zyx.edu/diagrams/fig-01.png",
      required: true,
    };

    expect(questionWithImage.imageUrl).toBeDefined();
    expect(questionWithImage.imageUrl).toContain("http");
  });
});
