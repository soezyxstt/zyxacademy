import { describe, it, expect } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MathText } from "@/components/course/math-text";

describe("MathText with markdown images", () => {
  it("renders markdown image with base64 data URI", () => {
    const prompt = "Diagram berikut: ![Composite wall](data:image/jpeg;base64,/9j/4AAQSkZJRg==) Tentukan nilai.";
    const html = renderToStaticMarkup(React.createElement(MathText, null, prompt));

    expect(html).toContain("<img");
    expect(html).toContain('src="data:image/jpeg;base64,/9j/4AAQSkZJRg=="');
    expect(html).toContain('alt="Composite wall"');
    expect(html).toContain("<figcaption");
    expect(html).toContain("Composite wall");
    expect(html).not.toContain("![Composite wall]");
  });

  it("renders markdown image with R2 storage proxy URL", () => {
    const prompt = "Bagan alir siklus termal: ![](/api/storage/file/courses/ms3103/questions/diagram-1.png)";
    const html = renderToStaticMarkup(React.createElement(MathText, null, prompt));

    expect(html).toContain("<img");
    expect(html).toContain('src="/api/storage/file/courses/ms3103/questions/diagram-1.png"');
    expect(html).not.toContain("![](");
  });

  it("renders both LaTeX math formulas and markdown images together", () => {
    const prompt = "Perhatikan resistansi termal $R_{tot} = \\frac{L}{kA}$ pada dinding komposit: ![Diagram Dinding](https://r2.zyxacademy.com/wall.png) Hitunglah!";
    const html = renderToStaticMarkup(React.createElement(MathText, null, prompt));

    expect(html).toContain("katex");
    expect(html).toContain("<img");
    expect(html).toContain('src="https://r2.zyxacademy.com/wall.png"');
    expect(html).toContain('alt="Diagram Dinding"');
    expect(html).toContain("Diagram Dinding");
  });

  it("cleans accidental whitespace or newlines inside base64 strings", () => {
    const prompt = "Uji newline: ![Test](data:image/jpeg;base64,/9j/4AAQ\nSkZ\r\nJRg==)";
    const html = renderToStaticMarkup(React.createElement(MathText, null, prompt));

    expect(html).toContain('src="data:image/jpeg;base64,/9j/4AAQSkZJRg=="');
  });

  it("leaves standard plain text and math intact when no images are present", () => {
    const prompt = "Hitung $\\int_0^1 2x\\,dx$ untuk $x \\ge 0$.";
    const html = renderToStaticMarkup(React.createElement(MathText, null, prompt));

    expect(html).toContain("katex");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<figure");
  });

  it("renders markdown links and raw URLs as clickable anchor tags", () => {
    const prompt = "Silakan kunjungi [Portal Belajar](https://zyx.id/portal) atau buka https://itb.ac.id untuk materi.";
    const html = renderToStaticMarkup(React.createElement(MathText, null, prompt));

    expect(html).toContain('<a href="https://zyx.id/portal" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain(">Portal Belajar</a>");
    expect(html).toContain('<a href="https://itb.ac.id" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain(">https://itb.ac.id</a>");
  });

  it("renders bold and inline code in text segments alongside math", () => {
    const prompt = "**Penting:** Gunakan rumus $E = mc^2$ pada `main.py`.";
    const html = renderToStaticMarkup(React.createElement(MathText, null, prompt));

    expect(html).toContain("<strong");
    expect(html).toContain("Penting:</strong>");
    expect(html).toContain("<code");
    expect(html).toContain("main.py</code>");
    expect(html).toContain("katex");
  });
});
