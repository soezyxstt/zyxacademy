export function pythonReply(text: string): { explanation: string; code: string | null } {
  const blocks = [...text.matchAll(/```(?:python|py)\s*\n([\s\S]*?)```/gi)];
  return {
    explanation: text.replace(/```(?:python|py)\s*\n[\s\S]*?(?:```|$)/gi, "").trim(),
    code: blocks.length === 1 && blocks[0][1].trim() ? blocks[0][1] : null,
  };
}
