import { expect, test } from "bun:test";
import { hasLegacyPrivateFormativeEnvelope, legacyArticleBlockPublicMarkdown, legacyArticlePublicMarkdown } from "@/lib/materials/legacy-article-public";

test("V2 public projection preserves prompts and options and excludes all private envelope fields", () => {
  const raw = JSON.stringify({ content: "Pertanyaan publik", answer: "private-top-answer", isCorrect: true, feedback: "private-top-feedback", formativeCheckPayload: { checkKind: "multiple_choice", answer: "private-answer", explanation: "private-explanation", options: [{ id: "a", text: "Pilihan satu", isCorrect: true }, { id: "b", text: "Pilihan dua", isCorrect: false }] } });
  const result = legacyArticleBlockPublicMarkdown(raw);
  for (const text of ["Pertanyaan publik", "Pilihan satu", "Pilihan dua"]) expect(result).toContain(text);
  for (const text of ["private-", "isCorrect", "formativeCheckPayload"]) expect(result).not.toContain(text);
  expect(hasLegacyPrivateFormativeEnvelope(raw)).toBe(true);
  expect(hasLegacyPrivateFormativeEnvelope(result)).toBe(false);
});

test("V2 projection keeps authored worked reasoning and fails closed for unknown envelopes", () => {
  const raw = JSON.stringify({ content: "Contoh publik", workedExamplePayload: { steps: [{ stepIndex: 0, label: "Langkah", explanation: "Operasi", reason: "Alasan" }], verification: "Pemeriksaan" } });
  for (const text of ["Contoh publik", "Langkah", "Operasi", "Alasan", "Pemeriksaan"]) expect(legacyArticleBlockPublicMarkdown(raw)).toContain(text);
  expect(legacyArticleBlockPublicMarkdown("Markdown biasa")).toBe("Markdown biasa");
  for (const value of [JSON.stringify({ answer: "private" }), JSON.stringify([{ answer: "private" }]), '{"formativeCheckPayload": broken', JSON.stringify({ content: "Prompt", formativeCheckPayload: { answer: "private" } })]) expect(() => legacyArticleBlockPublicMarkdown(value)).toThrow("PAYLOAD_INVALID");
});

test("historical read guard rejects nested JSON encodings, Unicode keys and concatenated blocks", () => {
  let raw = JSON.stringify({ content: "Prompt", formativeCheckPayload: { answer: "private" } });
  for (let depth = 0; depth < 6; depth++) {
    expect(hasLegacyPrivateFormativeEnvelope(`Markdown awal\n\n${raw}\n\nMarkdown akhir`)).toBe(true);
    raw = JSON.stringify(raw);
  }
  const unicodeKey = "formativeCheckPayload".split("").map(char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
  expect(hasLegacyPrivateFormativeEnvelope(`{"${unicodeKey}":{"answer":"private"}}`)).toBe(true);
  expect(hasLegacyPrivateFormativeEnvelope(JSON.stringify(`{"${unicodeKey}":{}}`))).toBe(true);
  expect(hasLegacyPrivateFormativeEnvelope(JSON.stringify('{"formativeCheckPayload"\n\t: {"answer":"private"}}'))).toBe(true);
  expect(hasLegacyPrivateFormativeEnvelope("Teks publik dengan rumus \\frac{1}{2}")).toBe(false);
  const mixed = 'Intro\n\n{"content":"Question","answer":"private","isCorrect":true}';
  expect(hasLegacyPrivateFormativeEnvelope(mixed)).toBe(true);
  expect(hasLegacyPrivateFormativeEnvelope(JSON.stringify(mixed))).toBe(true);
  expect(() => legacyArticleBlockPublicMarkdown(mixed)).toThrow('PAYLOAD_INVALID');
  expect(() => legacyArticleBlockPublicMarkdown('Intro\n{"content":"Question","unknownPrivateField":"private"}')).toThrow('PAYLOAD_INVALID');
  const code = '```json\n{"answer":"literal public code"}\n```';
  expect(hasLegacyPrivateFormativeEnvelope(code)).toBe(false);
  expect(legacyArticleBlockPublicMarkdown(code)).toBe(code);
  const feedback = 'Intro\n{"explanation":"private feedback"}';
  expect(() => legacyArticleBlockPublicMarkdown(feedback)).toThrow('PAYLOAD_INVALID');
  expect(hasLegacyPrivateFormativeEnvelope(JSON.stringify(feedback))).toBe(true);
  expect(hasLegacyPrivateFormativeEnvelope('Kolom "content": isi pesan')).toBe(false);
  expect(legacyArticleBlockPublicMarkdown('Kolom "content": isi pesan')).toBe('Kolom "content": isi pesan');
  expect(hasLegacyPrivateFormativeEnvelope('Himpunan {"x", "y"}')).toBe(false);
  expect(hasLegacyPrivateFormativeEnvelope('Intro\n{"unknown\\"key":"private"}')).toBe(true);
});

test("final public projection rejects objects assembled across blocks or worked fields", () => {
  const blocks = [{ id: "a", orderIndex: 0, content: "Intro\n{" }, { id: "b", orderIndex: 1, content: '"answer":"private"}' }];
  expect(() => legacyArticlePublicMarkdown(blocks)).toThrow("PAYLOAD_INVALID");
  expect(() => legacyArticlePublicMarkdown([{ ...blocks[0], content: "Intro\n{<!-- separated -->" }, blocks[1]])).toThrow("PAYLOAD_INVALID");
  const worked = { content: "Prompt", workedExamplePayload: { steps: [{ stepIndex: 0, label: "Langkah", explanation: 'Intro\n{"explanation":"private"}', reason: "Alasan" }], verification: "Pemeriksaan" } };
  expect(() => legacyArticleBlockPublicMarkdown(JSON.stringify(worked))).toThrow("PAYLOAD_INVALID");
  expect(legacyArticlePublicMarkdown([{ id: "code", orderIndex: 0, content: '```json\n{"answer":"public code"}\n```' }])).toContain('"answer":"public code"');
});
