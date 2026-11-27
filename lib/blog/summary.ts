/** Interactive editor summary generation. The shared blog service keeps its deterministic fallback. */
export async function generateBlogSummary(userId: string, content: string, requestId?: string): Promise<string | undefined> {
  try {
    const { generateContentWithFallback } = await import("@/lib/gemini");
    const generated = await generateContentWithFallback({
      userId, requestId, feature: "blog-summary", useCase: "chapter-summary",
      contents: `Tolong buatkan ringkasan untuk artikel berikut:\n\n${content}`,
      config: { temperature: 0.3, maxOutputTokens: 100, systemInstruction: "Tulis ringkasan artikel Zyx Academy maksimal 2 kalimat dalam bahasa Indonesia yang komunikatif. Gunakan sentence case. Hindari tanda seru, tanda hubung panjang, dan filler. Kembalikan ringkasan saja." },
    });
    const text: unknown = generated.response.text;
    return typeof text === "string" ? text.trim().replace(/[\u2013\u2014]/g, ", ").replace(/!/g, ".").replace(/\bZYX\b/gi, "Zyx").slice(0, 2000) || undefined : undefined;
  } catch {
    return undefined;
  }
}
