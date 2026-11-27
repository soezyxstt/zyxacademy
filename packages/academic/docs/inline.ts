type DocInline = { kind: "text" | "code" | "strong"; text: string } | { kind: "link"; text: string; href: string };

const inlineToken = /(\[[^\]]+\]\(\/[^)\s]+\)|`[^`]+`|\*\*[^*]+\*\*)/g;
const linkToken = /^\[([^\]]+)\]\((\/[^)\s]+)\)$/;

export function readDocInline(text: string): DocInline[] {
  return text.split(inlineToken).filter(Boolean).map(part => {
    const link = linkToken.exec(part);
    if (link) return { kind: "link", text: link[1], href: link[2] };
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) return { kind: "code", text: part.slice(1, -1) };
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) return { kind: "strong", text: part.slice(2, -2) };
    return { kind: "text", text: part };
  });
}
