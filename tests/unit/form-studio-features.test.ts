import { describe, it, expect } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MathText } from "@/components/course/math-text";
import { PublicFormViewer } from "@/components/forms/public-form-viewer";
import type { QuestionType } from "@/lib/google-forms";

describe("Form Studio - Markdown Rendering & Clickable Links", () => {
  it("renders markdown links [title](url) as clickable <a> tags with target='_blank'", () => {
    const text = "Silakan pelajari [Panduan Pengisian](https://zyx.id/docs) sebelum menjawab.";
    const html = renderToStaticMarkup(React.createElement(MathText, null, text));

    expect(html).toContain('<a href="https://zyx.id/docs" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain(">Panduan Pengisian</a>");
  });

  it("detects and converts raw URLs (https://...) into clickable links", () => {
    const text = "Kunjungi https://zyx.id atau https://itb.ac.id/info untuk pengumuman resmi.";
    const html = renderToStaticMarkup(React.createElement(MathText, null, text));

    expect(html).toContain('<a href="https://zyx.id" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain(">https://zyx.id</a>");
    expect(html).toContain('<a href="https://itb.ac.id/info" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain(">https://itb.ac.id/info</a>");
  });

  it("supports bold, italic, code, and math formulas simultaneously", () => {
    const text = "**Catatan:** Nilai variabel `x` ditentukan oleh formula $f(x) = x^2 + 1$. Kunjungi [Link](https://example.com).";
    const html = renderToStaticMarkup(React.createElement(MathText, null, text));

    expect(html).toContain("<strong");
    expect(html).toContain("Catatan:</strong>");
    expect(html).toContain("<code");
    expect(html).toContain("x</code>");
    expect(html).toContain("katex");
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer"');
  });
});

describe("Form Studio - Non-Question Statement Slides & Preview Logic", () => {
  it("verifies STATEMENT is a valid QuestionType and numbering excludes STATEMENT and SECTION", () => {
    const questions: Array<{ title: string; type: QuestionType }> = [
      { title: "Petunjuk Awal", type: "STATEMENT" },
      { title: "Nama Mahasiswa", type: "TEXT" },
      { title: "Bagian Kedua", type: "SECTION" },
      { title: "Informasi Tambahan", type: "STATEMENT" },
      { title: "NIM / Angkatan", type: "TEXT" },
    ];

    // Numbering logic mirroring AdminFormsBuilder and PublicFormViewer
    const questionNumbers = new Map<number, number>();
    let qCount = 0;
    questions.forEach((q, idx) => {
      if (q.type === "SECTION" || q.type === "STATEMENT") {
        questionNumbers.set(idx, 0);
      } else {
        qCount += 1;
        questionNumbers.set(idx, qCount);
      }
    });

    const totalQuestions = questions.filter((q) => q.type !== "SECTION" && q.type !== "STATEMENT").length;

    expect(totalQuestions).toBe(2);
    expect(questionNumbers.get(0)).toBe(0); // Statement slide (not numbered)
    expect(questionNumbers.get(1)).toBe(1); // Pertanyaan #1
    expect(questionNumbers.get(2)).toBe(0); // Section break (not numbered)
    expect(questionNumbers.get(3)).toBe(0); // Statement slide (not numbered)
    expect(questionNumbers.get(4)).toBe(2); // Pertanyaan #2
  });

  it("renders PublicFormViewer with previewForm and STATEMENT informational slide", () => {
    const previewForm = {
      id: "test-form-1",
      slug: "test-form-1",
      title: "Kuesioner Praktikum Kimia",
      description: "Baca informasi di [Portal Kimia](https://zyx.id/kimia) terlebih dahulu.",
      category: "survey",
      questions: [
        {
          title: "Informasi Keselamatan Laboratorium",
          description: "Wajib menggunakan jas lab dan kacamata pelindung. Kunjungi https://safety.itb.ac.id.",
          imageUrl: "https://r2.zyxacademy.com/safety-rules.png",
          type: "STATEMENT",
          required: false,
        },
        {
          title: "Nama Lengkap",
          type: "TEXT",
          required: true,
        },
      ],
      settings: {
        collectEmail: "none" as const,
      },
    };

    const html = renderToStaticMarkup(
      React.createElement(PublicFormViewer, {
        previewForm,
        isPreview: true,
      })
    );

    // Verify form rendered in preview mode
    expect(html).toContain("Kuesioner Praktikum Kimia");
    expect(html).toContain('<a href="https://zyx.id/kimia" target="_blank" rel="noopener noreferrer"');
    // Total question count displays 1 (excludes the STATEMENT slide)
    expect(html).toContain("1 pertanyaan");
  });

  it("renders markdown links and formatting in review screen question titles and answers", () => {
    const previewForm = {
      id: "test-form-review",
      slug: "test-form-review",
      title: "Pendaftaran Tutorial UTS TPB",
      category: "survey",
      questions: [
        {
          title: "Udah join [grup WhatsApp](https://chat.whatsapp.com/CzK0v3qvu4jGLnyaa) nyaa?",
          type: "MULTIPLE_CHOICE" as const,
          options: ["Ya", "Belum"],
          required: true,
        },
      ],
      settings: {
        collectEmail: "none" as const,
      },
    };

    // Step 0: cover, Step 1: question 0, Step 2: review
    const html = renderToStaticMarkup(
      React.createElement(PublicFormViewer, {
        previewForm,
        isPreview: true,
        initialStepIndex: 2,
      })
    );

    expect(html).toContain("Tinjau Jawaban Anda");
    expect(html).toContain('<a href="https://chat.whatsapp.com/CzK0v3qvu4jGLnyaa" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain(">grup WhatsApp</a>");
    expect(html).toContain("nyaa?");
  });
});

