import { db } from "@/db";
import {
  courses,
  chapters,
  knowledgeObjects,
  masterTeachingDocuments,
  flashcardSets,
  flashcards,
} from "@/db/schema";
import { generateContentWithFallback } from "@/lib/gemini";
import { USE_CASES } from "@/lib/ai-router";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { repairJsonString } from "./ko-utils";

// ==========================================
// ZOD SCHEMAS FOR GEMINI VALIDATION
// ==========================================

export const GeneratedFlashcardSchema = z.object({
  koId: z.string(),
  front: z.string().min(1),
  back: z.string().min(1),
  explanation: z.string().optional(),
  cardType: z.enum([
    "definition",
    "formula",
    "parameter_recognition",
    "derivation",
    "cloze",
    "misconception",
    "engineering_application",
  ]),
  /** EIF E4: intrinsic recall difficulty 1 (easy) .. 5 (hard). Defaults from KO difficulty. */
  recallDifficulty: z.coerce.number().int().min(1).max(5).optional(),
});

/** EIF E4: prior recall difficulty seeded from a KO's authoring difficulty. */
export function difficultyPriorFromKO(koDifficulty: "easy" | "medium" | "hard" | undefined): number {
  if (koDifficulty === "easy") return 2;
  if (koDifficulty === "hard") return 4;
  return 3;
}

export const GeneratedFlashcardListSchema = z.array(GeneratedFlashcardSchema);
export type GeneratedFlashcard = z.infer<typeof GeneratedFlashcardSchema>;

// ==========================================
// GEMINI PROMPT BUILDER
// ==========================================

export function buildFlashcardPrompt(
  courseTitle: string,
  chapterTitle: string,
  kos: (typeof knowledgeObjects.$inferSelect)[]
): string {
  const formattedKOs = kos
    .map(
      ko => `KO ID: ${ko.id}
Type: ${ko.type}
Title: ${ko.title}
Concept Name: ${ko.conceptName}
Content: ${ko.content}`
    )
    .join("\n\n-----------------\n\n");

  return `You are an expert curriculum editor in physics and engineering. Generate active recall flashcards from the following list of Knowledge Objects (KOs) matching the Course and Chapter details:

COURSE: ${courseTitle}
CHAPTER: ${chapterTitle}

INPUT KNOWLEDGE OBJECTS:
${formattedKOs}

Extract flashcards matching the following types:
1. "definition": Explain key terms.
2. "formula": State the math equation and parameter details.
3. "parameter_recognition": Ask to identify a specific variable symbol, units, and name inside a formula.
4. "derivation": Explain the steps to derive a math relationship.
5. "cloze": Fill-in-the-blank statements targeting physical principles.
6. "misconception": Prompt to confront a misconception myth and explain why it is wrong.
7. "engineering_application": Detail real-world components or systems using this concept.

Output a JSON array containing objects matching this schema:
[
  {
    "koId": "[Exact KO ID associated with this content]",
    "front": "[Front side text prompt]",
    "back": "[Back side text answer containing details/formulas]",
    "explanation": "[Optional hint or summary context]",
    "cardType": "[one of: definition, formula, parameter_recognition, derivation, cloze, misconception, engineering_application]",
    "recallDifficulty": "[integer 1..5: how hard this card is to recall, 1 trivial, 5 very hard]"
  }
]

Format instructions:
- Ensure all LaTeX expressions are centered or wrapped using standard delimiters ($ for inline, $$ for blocks).
- Every card must link back to its correct input "koId".
- Do not output markdown code fences (like \`\`\`json). Output raw, parseable JSON text only.`;
}

// ==========================================
// PIPELINE GENERATOR SERVICE
// ==========================================

export async function generateFlashcardsForChapter(chapterId: string, userId?: string): Promise<number> {
  // 1. Fetch chapter
  const [chapterRecord] = await db
    .select()
    .from(chapters)
    .where(eq(chapters.id, chapterId));

  if (!chapterRecord) {
    throw new Error(`Chapter not found with ID: ${chapterId}`);
  }

  // 2. Fetch parent course
  const [courseRecord] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, chapterRecord.courseId));

  if (!courseRecord) {
    throw new Error(`Course not found for chapter ID: ${chapterId}`);
  }

  // 3. Fetch constituent KOs
  const activeKOs = await db
    .select()
    .from(knowledgeObjects)
    .where(
      and(
        eq(knowledgeObjects.chapterId, chapterId),
        eq(knowledgeObjects.status, "active")
      )
    );

  if (activeKOs.length === 0) {
    throw new Error(`No active Knowledge Objects found for Chapter: ${chapterId}`);
  }

  const mtdId = activeKOs[0].mtdId;
  const [mtdRecord] = await db
    .select()
    .from(masterTeachingDocuments)
    .where(eq(masterTeachingDocuments.id, mtdId));

  if (!mtdRecord) {
    throw new Error(`Source MTD not found: ${mtdId}`);
  }

  // Compute generation hash
  const activeKOsSorted = [...activeKOs].sort((a, b) => a.id.localeCompare(b.id));
  const hashInput = activeKOsSorted.map(k => `${k.id}:${k.content}`).join("\n");
  const crypto = await import("crypto");
  const generationHash = crypto.createHash("sha256").update(hashInput).digest("hex");

  let cardsToInsert: GeneratedFlashcard[] = [];

  // 4. Run Mock or Real Gemini Generator
  if (process.env.MOCK_GEMINI === "true") {
    console.log(`[Mock Flashcards] Compiling cards for Chapter: ${chapterRecord.title}`);
    activeKOs.forEach(ko => {
      if (ko.type === "definition") {
        cardsToInsert.push({
          koId: ko.id,
          front: `Explain the physical concept of: ${ko.title}.`,
          back: ko.content,
          cardType: "definition",
        });
        cardsToInsert.push({
          koId: ko.id,
          front: `What is the key term matching: ${ko.title}?`,
          back: `The term is [[${ko.conceptName}]].`,
          cardType: "cloze",
        });
      } else if (ko.type === "formula") {
        cardsToInsert.push({
          koId: ko.id,
          front: `State the mathematical equation for: ${ko.title}.`,
          back: `$$\\rho = \\frac{m}{V}$$`,
          cardType: "formula",
        });
        cardsToInsert.push({
          koId: ko.id,
          front: `Identify the variable symbol \\rho in the context of ${ko.title}.`,
          back: `Name: Density, Unit: kg/m^3`,
          cardType: "parameter_recognition",
        });
        cardsToInsert.push({
          koId: ko.id,
          front: `Show derivation stages for ${ko.title}.`,
          back: `Algebraic integration from base units.`,
          cardType: "derivation",
        });
      } else if (ko.type === "misconception") {
        cardsToInsert.push({
          koId: ko.id,
          front: `Confront the common error regarding: ${ko.title}.`,
          back: ko.content,
          cardType: "misconception",
        });
      } else {
        cardsToInsert.push({
          koId: ko.id,
          front: `State application cases for ${ko.title}.`,
          back: `Mechanical turbine shaft control loop systems.`,
          cardType: "engineering_application",
        });
      }
    });
  } else {
    console.log(`[AI Flashcards] Extracting cards from ${activeKOs.length} KOs...`);
    const prompt = buildFlashcardPrompt(courseRecord.title, chapterRecord.title, activeKOs);
    const { response } = await generateContentWithFallback({
      userId,
      useCase: USE_CASES.FLASHCARD_GEN,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              koId: { type: "STRING" },
              front: { type: "STRING" },
              back: { type: "STRING" },
              cardType: { type: "STRING", enum: GeneratedFlashcardSchema.shape.cardType.options },
              explanation: { type: "STRING" },
              recallDifficulty: { type: "INTEGER", minimum: 1, maximum: 5 },
            },
            required: ["koId", "front", "back", "cardType"],
          },
        },
      },
    });

    const outputText = response.text || "";
    if (!outputText.trim()) {
      throw new Error("Gemini returned empty flashcard pool.");
    }

    // Clean potential markdown enclosing fences
    const cleanJSONText = repairJsonString(outputText);
    const parsedJSON = JSON.parse(cleanJSONText);
    
    // Explicit Zod schema validation before database insertion
    const validation = GeneratedFlashcardListSchema.safeParse(parsedJSON);
    if (!validation.success) {
      throw new Error(`Gemini flashcards failed schema checks: ${validation.error.message}`);
    }

    cardsToInsert = validation.data;
  }

  // 5. Commit to database
  return await db.transaction(async tx => {
    // Find or create flashcard set
    const [existingSet] = await tx
      .select()
      .from(flashcardSets)
      .where(eq(flashcardSets.chapterId, chapterId));

    let setId = "";
    if (existingSet) {
      setId = existingSet.id;
      await tx
        .update(flashcardSets)
        .set({
          isStale: false,
          generationHash,
          updatedAt: new Date(),
        })
        .where(eq(flashcardSets.id, setId));
    } else {
      setId = `fc-set-${randomUUID()}`;
      await tx.insert(flashcardSets).values({
        id: setId,
        courseId: chapterRecord.courseId,
        chapterId,
        sourceMtdId: mtdId,
        sourceMtdVersion: mtdRecord.version,
        isStale: false,
        generationHash,
        title: `Flashcards: ${chapterRecord.title}`,
        status: "draft",
      });
    }

    // Purge prior AI generated flashcards for this set in one shot
    await tx.delete(flashcards).where(eq(flashcards.setId, setId));

    // E4: map koId -> authoring difficulty for the recall-difficulty prior.
    const koDifficulty = new Map(activeKOs.map((k) => [k.id, k.difficulty]));

    // Insert new cards
    for (const card of cardsToInsert) {
      const recallDifficulty = Math.max(
        1,
        Math.min(5, card.recallDifficulty ?? difficultyPriorFromKO(koDifficulty.get(card.koId))),
      );
      await tx.insert(flashcards).values({
        id: `fc-${randomUUID()}`,
        setId,
        koId: card.koId,
        front: card.front,
        back: card.back,
        explanation: card.explanation,
        status: "active",
        metadata: { cardType: card.cardType, recallDifficulty },
      });
    }

    return cardsToInsert.length;
  });
}
