export function pythonReply(text: string): { explanation: string; code: string | null } {
  const blocks = [...text.matchAll(/```(?:python3?|py)[ \t]*\r?\n([\s\S]*?)```/gi)];
  return {
    explanation: text.replace(/```[^\n]*(?:\n[\s\S]*?(?:```|$)|$)/g, "").trim(),
    code: blocks.length === 1 && blocks[0][1].trim() ? blocks[0][1] : null,
  };
}

export function pythonHistoryReply(text: string, language: "id" | "en"): string {
  const { explanation } = pythonReply(text);
  const recovery = language === "en"
    ? "Final code is sent to the active editor. If it has not been applied, ask Zyra to generate it again."
    : "Kode final dikirim ke editor aktif. Jika belum diterapkan, minta Zyra membuat kode lagi.";
  return [explanation, recovery].filter(Boolean).join("\n\n");
}
