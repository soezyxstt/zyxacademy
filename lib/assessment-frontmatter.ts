export interface AssessmentFrontmatter {
  category?: "tutorial" | "quiz" | "uts" | "uas" | "tryout";
  year?: number;
  semester?: number;
  chapters?: string[];
}

/**
 * Parses assessment markdown frontmatter without importing server-only code.
 */
export function parseFrontmatter(markdown: string): {
  frontmatter: AssessmentFrontmatter;
  content: string;
} {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
  const match = normalized.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, content: normalized };
  }

  const yamlText = match[1];
  const content = normalized.replace(frontmatterRegex, "").trim();
  const frontmatter: AssessmentFrontmatter = {};

  const lines = yamlText.split("\n");
  let currentKey: keyof AssessmentFrontmatter | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("-") && currentKey === "chapters") {
      const value = trimmed.slice(1).trim().replace(/^['"]|['"]$/g, "");
      if (value) {
        if (!frontmatter.chapters) frontmatter.chapters = [];
        frontmatter.chapters.push(value);
      }
      continue;
    }

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim() as keyof AssessmentFrontmatter;
    const value = trimmed.slice(colonIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (key === "category") {
      const category = value.toLowerCase();
      if (["tutorial", "quiz", "uts", "uas", "tryout"].includes(category)) {
        frontmatter.category = category as AssessmentFrontmatter["category"];
      }
    } else if (key === "year") {
      const year = Number.parseInt(value, 10);
      if (!Number.isNaN(year)) frontmatter.year = year;
    } else if (key === "semester") {
      const semester = Number.parseInt(value, 10);
      if (!Number.isNaN(semester)) frontmatter.semester = semester;
    } else if (key === "chapters") {
      currentKey = "chapters";
      if (value.startsWith("[") && value.endsWith("]")) {
        frontmatter.chapters = value
          .slice(1, -1)
          .split(",")
          .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
          .filter(Boolean);
      }
    } else {
      currentKey = null;
    }
  }

  return { frontmatter, content };
}
