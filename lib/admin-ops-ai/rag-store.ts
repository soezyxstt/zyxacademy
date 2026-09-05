import fs from "node:fs/promises";
import path from "node:path";
import { type OpsAiDocumentSource } from "./types";

export interface DocChunk {
  id: string;
  docTitle: string;
  filePath: string;
  section: string;
  content: string;
  keywords: string[];
}

let cachedChunks: DocChunk[] | null = null;
let lastLoadedTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes in dev/prod

const DOCS_DIR = path.join(process.cwd(), "docs");

/**
 * Extracts sections and chunks from Markdown content
 */
function parseMarkdownToChunks(filePath: string, relativePath: string, rawText: string): DocChunk[] {
  const lines = rawText.split("\n");
  const chunks: DocChunk[] = [];
  
  let currentDocTitle = path.basename(filePath, ".md");
  let currentSection = "Pendahuluan";
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("# ")) {
      // Top level title
      currentDocTitle = trimmed.replace(/^#\s+/, "");
    }

    if (trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
      // Flush previous section
      if (currentLines.length > 0) {
        const content = currentLines.join("\n").trim();
        if (content.length > 20) {
          chunks.push({
            id: `${relativePath}#${encodeURIComponent(currentSection)}`,
            docTitle: currentDocTitle,
            filePath: relativePath,
            section: currentSection,
            content,
            keywords: extractKeywords(`${currentDocTitle} ${currentSection} ${content}`),
          });
        }
        currentLines = [];
      }
      currentSection = trimmed.replace(/^#+\s+/, "");
    } else {
      currentLines.push(line);
    }
  }

  // Flush remaining lines
  if (currentLines.length > 0) {
    const content = currentLines.join("\n").trim();
    if (content.length > 20) {
      chunks.push({
        id: `${relativePath}#${encodeURIComponent(currentSection)}`,
        docTitle: currentDocTitle,
        filePath: relativePath,
        section: currentSection,
        content,
        keywords: extractKeywords(`${currentDocTitle} ${currentSection} ${content}`),
      });
    }
  }

  return chunks;
}

function extractKeywords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9_\-\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3)
    )
  );
}

/**
 * Recursively scan all .md files in docs/
 */
async function scanDocsRecursively(dir: string, baseDir: string = dir): Promise<DocChunk[]> {
  const chunks: DocChunk[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subChunks = await scanDocsRecursively(fullPath, baseDir);
        chunks.push(...subChunks);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const relativePath = path.relative(process.cwd(), fullPath);
        const text = await fs.readFile(fullPath, "utf-8");
        chunks.push(...parseMarkdownToChunks(fullPath, relativePath, text));
      }
    }
  } catch (err) {
    console.warn("[OpsAi RAG] Error reading docs directory:", err);
  }
  return chunks;
}

const PREBUILT_INDEX_PATH = path.join(process.cwd(), "lib", "admin-ops-ai", "ops-docs-index.json");

/**
 * Builds the documentation knowledge base by scanning the filesystem.
 */
export async function buildDocsKnowledgeBase(): Promise<DocChunk[]> {
  const chunks = await scanDocsRecursively(DOCS_DIR);

  // Also include AGENTS.md for durable repository rules
  try {
    const agentsPath = path.join(process.cwd(), "AGENTS.md");
    const agentsText = await fs.readFile(agentsPath, "utf-8");
    chunks.push(...parseMarkdownToChunks(agentsPath, "AGENTS.md", agentsText));
  } catch {
    // Optional
  }

  return chunks;
}

/**
 * Loads and indexes all documentation files in memory, using prebuilt index if available.
 */
export async function getDocsKnowledgeBase(): Promise<DocChunk[]> {
  const now = Date.now();
  if (cachedChunks && now - lastLoadedTime < CACHE_TTL_MS) {
    return cachedChunks;
  }

  // 1. Attempt to load precomputed static index
  try {
    const raw = await fs.readFile(PREBUILT_INDEX_PATH, "utf-8");
    const parsed = JSON.parse(raw) as DocChunk[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      cachedChunks = parsed;
      lastLoadedTime = now;
      return parsed;
    }
  } catch {
    // Fall back to scanning docs directory
  }

  // 2. Scan docs directory on demand
  const chunks = await buildDocsKnowledgeBase();
  cachedChunks = chunks;
  lastLoadedTime = now;
  return chunks;
}

/**
 * Hybrid search over docs: BM25/keyword scoring + Exact phrase & heading boosts
 */
export async function searchDocs(query: string, limit = 5): Promise<OpsAiDocumentSource[]> {
  const chunks = await getDocsKnowledgeBase();
  if (chunks.length === 0) return [];

  const rawQuery = query.toLowerCase().trim();
  const queryWords = extractKeywords(rawQuery);
  if (queryWords.length === 0) return [];

  const scored = chunks.map((chunk) => {
    let score = 0;
    const lowerContent = chunk.content.toLowerCase();
    const lowerSection = chunk.section.toLowerCase();
    const lowerTitle = chunk.docTitle.toLowerCase();
    const lowerPath = chunk.filePath.toLowerCase();

    // Exact phrase match in content or header
    if (lowerContent.includes(rawQuery)) score += 15;
    if (lowerSection.includes(rawQuery) || lowerTitle.includes(rawQuery)) score += 25;
    if (lowerPath.includes(rawQuery)) score += 10;

    // Word frequency & heading matches
    for (const word of queryWords) {
      if (lowerSection.includes(word)) score += 6;
      if (lowerTitle.includes(word)) score += 4;
      if (lowerPath.includes(word)) score += 3;

      const count = (lowerContent.match(new RegExp(`\\b${word}\\b`, "g")) || []).length;
      score += Math.min(count * 1.5, 9);
    }

    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk }) => ({
      title: chunk.docTitle,
      filePath: chunk.filePath,
      section: chunk.section,
      snippet: chunk.content.length > 800 ? `${chunk.content.slice(0, 800)}...` : chunk.content,
    }));
}

