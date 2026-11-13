import "server-only";
import { createHash } from "node:crypto";
import { storage } from "@/lib/storage";
import { buildQuestionVisualBindingKey } from "@/lib/storage/keys";
import { interactiveDocumentsInMarkdown } from "./interactive-document-authorization";
import type { InteractiveDocumentAssetPair } from "./interactive-document-assets";

type Question = { prompt: unknown; options: unknown; explanation?: unknown };

function binding(courseId: string, question: Question): string | null {
  if (!courseId || typeof question.prompt !== "string" || !Array.isArray(question.options) || !question.options.every(option => typeof option === "string") || (question.explanation != null && typeof question.explanation !== "string")) return null;
  return JSON.stringify({ version: 1, courseId, prompt: question.prompt, options: question.options.map((option: string) => option.trim()).sort(), explanation: question.explanation ?? "" });
}

function key(content: string) {
  return buildQuestionVisualBindingKey(createHash("sha256").update(content).digest("hex"));
}

/** Called only after the authorized authoring path validates and stages the exact assets. */
export async function stageQuestionVisualBinding(courseId: string, question: Question, pairs: readonly InteractiveDocumentAssetPair[]): Promise<void> {
  const content = binding(courseId, question);
  if (!content) throw new Error("QUESTION_VISUAL_BINDING_INVALID");
  const specs = [question.prompt, ...(question.options as string[]).map(option => option.trim()), question.explanation].flatMap(interactiveDocumentsInMarkdown);
  if (!specs.length) return;
  if (specs.some(spec => !pairs.some(pair => JSON.stringify(pair.spec) === JSON.stringify(spec)))) throw new Error("QUESTION_VISUAL_BINDING_UNVERIFIED");
  if (!storage.download) throw new Error("QUESTION_VISUAL_BINDING_STORAGE_UNAVAILABLE");
  const objectKey = key(content);
  const bytes = Buffer.from(content, "utf8");
  if (!await storage.exists(objectKey)) await storage.upload(bytes, objectKey.split("/").pop()!, "application/json", { key: objectKey });
  if (!Buffer.from(await storage.download(objectKey)).equals(bytes)) throw new Error("QUESTION_VISUAL_BINDING_INTEGRITY");
}

/** The caller supplies only the server-owned snapshot and its template course. */
export async function verifyQuestionVisualBinding(courseId: string, question: Question): Promise<boolean> {
  const content = binding(courseId, question);
  if (!content || !storage.download) return false;
  try {
    return Buffer.from(await storage.download(key(content))).equals(Buffer.from(content, "utf8"));
  } catch {
    return false;
  }
}
