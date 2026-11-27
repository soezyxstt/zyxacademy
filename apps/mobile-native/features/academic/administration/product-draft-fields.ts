import type { ProductReviewData } from "./product-review-client";

type Product = ProductReviewData["draft"]["products"][number];
type Choice = { id: string; label: string };
type Value = string | number | boolean;
type Path = readonly (string | number)[];
export type DraftField = { path: Path; key: string; label: string; value: Value; choices?: Choice[]; numeric?: boolean };

const choices = (items: Record<string,string>) => Object.entries(items).map(([id,label]) => ({ id,label }));
const difficulty = choices({ easy: "Mudah", medium: "Sedang", hard: "Sulit" });
const cognitive = choices({ remember: "Mengingat", understand: "Memahami", apply: "Menerapkan", analyze: "Menganalisis", evaluate: "Mengevaluasi", create: "Mencipta" });
const relations = choices({ required: "Wajib", prerequisite: "Prasyarat", related: "Terkait" });
const roles = choices({ primary: "Utama", supporting: "Pendukung", required: "Wajib" });
export const authoredElsewhere = (product: Product) => product.schemaVersion === "article.v4" || (product.productType === "diktat" && Array.isArray(product.units));

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function items(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item,index) => record(item) ? [{ item,index }] : []);
}

export function productDraftFields(product: Product) {
  const fields: DraftField[] = [];
  if (authoredElsewhere(product) || product.productType === "solution_collection") return fields;
  function field(path: Path, label: string, value: unknown, options?: Choice[]) {
    if (value != null && typeof value !== "boolean" && typeof value !== "string" && typeof value !== "number") return;
    fields.push({ path, key: JSON.stringify(path), label, value: value ?? "", choices: options, numeric: typeof value === "number" });
  }

  if (product.title !== undefined) field(["title"], "Judul", product.title);
  if (product.productType === "article") {
    field(["slug"], "Slug", product.slug);
    for (const [i, block] of (product.blocks ?? []).entries()) field(["blocks", i, "content"], `Isi blok ${block.orderIndex + 1}`, block.content);
    for (const [i, section] of (product.sections ?? []).entries()) {
      field(["sections",i,"title"], `Judul bagian ${i + 1}`, section.title);
      field(["sections",i,"learningObjective"], `Tujuan bagian ${i + 1}`, section.learningObjective);
      for (const [j, block] of section.blocks.entries()) field(["sections",i,"blocks",j,"contentMarkdown"], `${section.title} · Blok ${j + 1}`, block.contentMarkdown);
    }
  } else if (product.productType === "question") {
    field(["prompt"], "Soal", product.prompt);
    field(["difficulty"], "Tingkat kesulitan", product.difficulty, difficulty);
    field(["cognitiveLevel"], "Tingkat kognitif", product.cognitiveLevel, cognitive);
    field(["reasoningPattern"], "Pola penalaran", product.reasoningPattern);
    for (const { item, index } of items(product.options)) {
      field(["options",index,"text"], `Pilihan ${index + 1}`, item.text);
      field(["options",index,"isCorrect"], `Kunci pilihan ${index + 1}`, item.isCorrect);
    }
    for (const { item, index } of items(product.ideaRelations)) {
      field(["ideaRelations",index,"relationType"], `Hubungan ${item.ideaId}`, item.relationType, relations);
      field(["ideaRelations",index,"rationale"], `Alasan ${item.ideaId}`, item.rationale);
    }
    for (const { item, index } of items(product.itbCuration)) field(["itbCuration",index,"curatorNote"], `Kurasi ${item.referenceId}`, item.curatorNote);
  } else if (product.productType === "diktat") field(["contentMarkdown"], "Isi Diktat", product.contentMarkdown);
  else if (product.productType === "flashcard") {
    field(["front"], "Sisi depan", product.front); field(["back"], "Sisi belakang", product.back); field(["explanation"], "Penjelasan", product.explanation);
  } else if (product.productType === "solution") field(["content"], "Pembahasan", product.content);
  else if (product.productType === "assessment_blueprint") field(["assessmentType"], "Jenis penilaian", product.assessmentType, choices({ quiz: "Kuis", tryout: "Tryout" }));

  for (const { item, index } of items(product.ideaLinks)) {
    field(["ideaLinks",index,"weight"], `Bobot ${item.id}`, item.weight);
    field(["ideaLinks",index,"role"], `Peran ${item.id}`, item.role, roles);
  }
  return fields;
}

function replaceAt(value: unknown, path: Path, index: number, replacement: Value): unknown {
  if (index === path.length) return replacement;
  const key = path[index];
  if (typeof key === "number" && Array.isArray(value)) {
    const next = [...value];
    next[key] = replaceAt(next[key], path, index + 1, replacement);
    return next;
  }
  if (typeof key === "string" && record(value)) return { ...value, [key]: replaceAt(value[key], path, index + 1, replacement) };
  throw new Error("Invalid product field");
}

export function applyProductFields(product: Product, updates: Record<string,string>): Product | null {
  let next = product;
  for (const field of productDraftFields(product)) {
    const raw = updates[field.key];
    if (raw === undefined || raw === String(field.value)) continue;
    if (field.choices && !field.choices.some(choice => choice.id === raw)) return null;
    if (field.numeric && (!raw.trim() || !Number.isFinite(Number(raw)) || Number(raw) <= 0 || Number(raw) > 1)) return null;
    if (typeof field.value === "boolean" && raw !== "true" && raw !== "false") return null;
    const value = field.numeric ? Number(raw) : typeof field.value === "boolean" ? raw === "true" : raw;
    next = replaceAt(next, field.path, 0, value) as Product;
  }
  return next;
}
