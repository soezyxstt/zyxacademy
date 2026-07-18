import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getSemesterEndDate(now = new Date()): Date {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0 = Jan, 6 = July, 11 = Dec
  
  if (month >= 1 && month <= 6) {
    // Feb (1) to July (6) -> July 31
    return new Date(year, 6, 31, 23, 59, 59, 999);
  } else {
    // Aug (7) to Jan (0) -> January 31
    if (month === 0) {
      return new Date(year, 0, 31, 23, 59, 59, 999);
    } else {
      return new Date(year + 1, 0, 31, 23, 59, 59, 999);
    }
  }
}

export function cleanSummary(text: string | null | undefined): string {
  if (!text) return "";
  
  // 1. Split into lines and filter out any container block tags (lines starting with ':::')
  let cleaned = text
    .split("\n")
    .filter((line) => !line.trim().startsWith(":::"))
    .join("\n");

  // 2. Remove standard markdown headings (#s)
  cleaned = cleaned.replace(/^#+\s+/gm, "");

  // 3. Remove inline KaTeX equations (both $...$ and $$...$$ or \[...\] / \(...\))
  cleaned = cleaned.replace(/\$\$[\s\S]*?\$\$/g, "");
  cleaned = cleaned.replace(/\$[^\$\n]+?\$/g, "");
  cleaned = cleaned.replace(/\\\[[\s\S]*?\\\]/g, "");
  cleaned = cleaned.replace(/\\\(.*?\\\)/g, "");

  // 4. Remove glossary/visual double-brackets like [[visual:xxx]] or [[term]]
  cleaned = cleaned.replace(/\[\[visual:[^\]]+\]\]/g, "");
  cleaned = cleaned.replace(/\[\[([^\]]+)\]\]/g, "$1");

  // 5. Clean up other inline markdown styling characters
  cleaned = cleaned.replace(/[#*`_~]/g, "");

  // 6. Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

export { normalizeDate } from "@/lib/date-utils";


