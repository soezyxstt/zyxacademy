import { db } from "@/db";
import {
  courses,
  chapters,
  knowledgeObjects,
  knowledgeRelationships,
} from "@/db/schema";
import { eq, and, inArray, asc } from "drizzle-orm";

export interface FormulaParameter {
  symbol: string;
  name: string;
  unit: string;
  description?: string;
}

export interface FormulaHandbookEntry {
  koId: string;
  title: string;
  latex: string;
  parameters: FormulaParameter[];
  assumptions: string[];
  whenToUse: string[];
  commonMistakes: string[];
}

export interface ConceptSummaryEntry {
  koId: string;
  title: string;
  conceptName: string;
  definition: string;
  difficulty: string;
}

export interface EngineeringNoteEntry {
  koId: string;
  title: string;
  insightMarkdown: string;
  discipline: string;
}

export interface CommonMistakeEntry {
  koId: string;
  title: string;
  myth: string;
  correction: string;
  rationale: string;
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  linkedKoId?: string;
}

export interface DiktatConcept {
  conceptName: string;
  definitions: {
    koId: string;
    title: string;
    content: string;
    difficulty: string;
    importance: string;
  }[];
  formulas: {
    koId: string;
    title: string;
    latex: string;
    parameters: FormulaParameter[];
    assumptions: string[];
    whenToUse: string[];
    commonMistakes: string[];
    difficulty: string;
    importance: string;
  }[];
  examples: {
    koId: string;
    title: string;
    content: string;
    difficulty: string;
    importance: string;
  }[];
  misconceptions: {
    koId: string;
    title: string;
    myth: string;
    correction: string;
    rationale: string;
    difficulty: string;
    importance: string;
  }[];
  overviews: {
    koId: string;
    title: string;
    content: string;
    discipline?: string;
    difficulty: string;
    importance: string;
  }[];
  minLearningOrder: number; // For sorting
}

export interface DiktatChapter {
  id: string;
  title: string;
  concepts: DiktatConcept[];
}

export interface DiktatStructure {
  courseId: string;
  chapterIds: string[];
  title: string;
  generationHash: string;
  sections: {
    learningObjectives: string[];
    formulaHandbook: FormulaHandbookEntry[];
    conceptSummaries: ConceptSummaryEntry[];
    engineeringNotes: EngineeringNoteEntry[];
    commonMistakes: CommonMistakeEntry[];
    glossary: GlossaryEntry[];
  };
  chapters: DiktatChapter[];
  examIntelligence?: import("./diktat-exam-intelligence").ExamIntelligenceData;
  auditResult?: {
    status: "PASS" | "WARN" | "FAIL";
    issueCount: number;
    revisionsApplied: number;
  };
}

/**
 * Parses markdown tables or headers to extract parameters, assumptions, and metadata
 * if they are not explicitly declared in KO JSONB metadata.
 */
export function parseFormulaFromMarkdown(content: string): {
  latex: string;
  parameters: FormulaParameter[];
  assumptions: string[];
  whenToUse: string[];
} {
  // Extract first display LaTeX block
  const displayEqMatch = content.match(/\$\$\s*([\s\S]*?)\s*\$\$/);
  const latex = displayEqMatch ? displayEqMatch[1].trim() : "";

  const parameters: FormulaParameter[] = [];
  const assumptions: string[] = [];
  const whenToUse: string[] = [];

  // Parse markdown tables for parameters: | symbol | name | unit | description |
  const lines = content.split("\n");
  for (const line of lines) {
    if (line.includes("|") && !line.includes("---") && !line.toLowerCase().includes("parameter")) {
      // Replace escaped vertical bars with a temporary placeholder to prevent splitting columns on math pipes
      const cleanLine = line.replace(/\\\|/g, "TEMP_ESCAPED_PIPE");
      const parts = cleanLine.split("|").map(p => p.trim().replace(/TEMP_ESCAPED_PIPE/g, "|")).filter(Boolean);
      if (parts.length >= 3) {
        const sym = parts[0].replace(/\$/g, "").trim();
        const name = parts[1];
        const unit = parts[2];

        // Skip table header rows
        const symLower = sym.toLowerCase();
        const nameLower = name.toLowerCase();
        if (symLower === "symbol" || nameLower === "variable" || nameLower === "si unit" || symLower === "") {
          continue;
        }

        parameters.push({
          symbol: sym,
          name,
          unit,
          description: parts[3] || undefined,
        });
      }
    }
  }

  // Find list items under ### Assumptions or ### When to Use headers
  let activeSection = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("###")) {
      const lower = trimmed.toLowerCase();
      if (lower.includes("assumption")) {
        activeSection = "assumptions";
      } else if (lower.includes("use") || lower.includes("application")) {
        activeSection = "when_to_use";
      } else {
        activeSection = "";
      }
      continue;
    }

    if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
      const bulletContent = trimmed.substring(1).trim();
      if (activeSection === "assumptions") {
        assumptions.push(bulletContent);
      } else if (activeSection === "when_to_use") {
        whenToUse.push(bulletContent);
      }
    }
  }

  return { latex, parameters, assumptions, whenToUse };
}

/**
 * Compiles a set of chapters and KOs into a structured JSON Diktat configuration.
 */
export async function generateDiktatStructure(
  courseId: string,
  chapterIds: string[]
): Promise<DiktatStructure> {
  // 1. Fetch parent course
  const [courseRecord] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId));

  if (!courseRecord) {
    throw new Error(`Course not found: ${courseId}`);
  }

  // 2. Fetch constituent active KOs
  const activeKOs = await db
    .select()
    .from(knowledgeObjects)
    .where(
      and(
        inArray(knowledgeObjects.chapterId, chapterIds),
        eq(knowledgeObjects.status, "active")
      )
    )
    .orderBy(asc(knowledgeObjects.learningOrder));

  if (activeKOs.length === 0) {
    throw new Error(`No active Knowledge Objects found for the selected chapters.`);
  }

  // Fetch chapters details to sort and render them sequentially
  const chaptersRecords = await db
    .select()
    .from(chapters)
    .where(inArray(chapters.id, chapterIds))
    .orderBy(asc(chapters.orderIndex));

  // 3. Compute State Hash
  const sortedKOs = [...activeKOs].sort((a, b) => a.id.localeCompare(b.id));
  const hashInput = sortedKOs.map(k => `${k.id}:${k.content}:${k.updatedAt.toISOString()}`).join("\n");
  const crypto = await import("crypto");
  const generationHash = crypto.createHash("sha256").update(hashInput).digest("hex");

  // Fetch relationships to link misconceptions to formulas
  const relationships = await db
    .select()
    .from(knowledgeRelationships)
    .where(inArray(knowledgeRelationships.sourceKoId, activeKOs.map(k => k.id)));
  
  const relationshipsMap = new Map<string, string[]>(); // Map sourceKoId -> targetKoIds
  relationships.forEach(rel => {
    const list = relationshipsMap.get(rel.sourceKoId) || [];
    list.push(rel.targetKoId);
    relationshipsMap.set(rel.sourceKoId, list);
  });

  const learningObjectives: string[] = [];
  const formulaHandbook: FormulaHandbookEntry[] = [];
  const conceptSummaries: ConceptSummaryEntry[] = [];
  const engineeringNotes: EngineeringNoteEntry[] = [];
  const commonMistakes: CommonMistakeEntry[] = [];
  const glossaryMap = new Map<string, GlossaryEntry>();

  // Process KOs sequentially for flat sections (backward compatibility with validator)
  for (const ko of activeKOs) {
    const meta = (ko.metadata as any) || {};

    // 1. Objectives
    if (ko.type === "objective") {
      learningObjectives.push(ko.content.replace(/^-\s*/, "").trim());
    }

    // 2. Formulas
    else if (ko.type === "formula") {
      const parsedMD = parseFormulaFromMarkdown(ko.content);
      const latex = meta.latex || parsedMD.latex || "";
      const parameters = meta.parameters || parsedMD.parameters || [];
      const assumptions = meta.assumptions || parsedMD.assumptions || [];
      const whenToUse = meta.whenToUse || parsedMD.whenToUse || [];

      // Link common mistakes from linked misconception KOs
      const linkedMistakes: string[] = [];
      const linkedKoIds = relationshipsMap.get(ko.id) || [];
      const misconceptionKOs = activeKOs.filter(
        k => k.type === "misconception" && (linkedKoIds.includes(k.id) || k.conceptName === ko.conceptName)
      );

      misconceptionKOs.forEach(m => {
        const mMeta = (m.metadata as any) || {};
        linkedMistakes.push(mMeta.myth || m.title || m.content);
      });

      formulaHandbook.push({
        koId: ko.id,
        title: ko.title,
        latex,
        parameters,
        assumptions,
        whenToUse,
        commonMistakes: meta.commonMistakes || linkedMistakes,
      });

      // Extract parameters into glossary references if needed
      parameters.forEach((p: FormulaParameter) => {
        if (!glossaryMap.has(p.symbol)) {
          glossaryMap.set(p.symbol, {
            term: p.symbol,
            definition: p.name + (p.description ? ` - ${p.description}` : ""),
            linkedKoId: ko.id,
          });
        }
      });
    }

    // 3. Definitions & Summaries
    else if (ko.type === "definition" || ko.type === "summary") {
      conceptSummaries.push({
        koId: ko.id,
        title: ko.title,
        conceptName: ko.conceptName,
        definition: ko.content,
        difficulty: ko.difficulty,
      });

      glossaryMap.set(ko.conceptName.toLowerCase(), {
        term: ko.conceptName,
        definition: ko.content.replace(/^[^a-zA-Z0-9]+/, "").substring(0, 150) + "...",
        linkedKoId: ko.id,
      });
    }

    // 4. Engineering Notes
    else if (ko.type === "concept_overview") {
      engineeringNotes.push({
        koId: ko.id,
        title: ko.title,
        insightMarkdown: ko.content,
        discipline: meta.discipline || "general",
      });
    }

    // 5. Misconceptions
    else if (ko.type === "misconception") {
      commonMistakes.push({
        koId: ko.id,
        title: ko.title,
        myth: meta.myth || ko.title,
        correction: meta.correction || ko.content,
        rationale: meta.physicalRationale || ko.content,
      });
    }
  }

  // 4. Build Structured Student-Facing Chapters and Concepts
  const chaptersList: DiktatChapter[] = [];

  for (const chRec of chaptersRecords) {
    const chKOs = activeKOs.filter(ko => ko.chapterId === chRec.id);
    if (chKOs.length === 0) continue;

    // Group KOs in this chapter by conceptName (case-sensitive mapping)
    const conceptGroups = new Map<string, typeof activeKOs>();
    for (const ko of chKOs) {
      const list = conceptGroups.get(ko.conceptName) || [];
      list.push(ko);
      conceptGroups.set(ko.conceptName, list);
    }

    const dictConcepts: DiktatConcept[] = [];

    for (const [conceptName, kos] of conceptGroups.entries()) {
      const definitions: { koId: string; title: string; content: string; difficulty: string; importance: string }[] = [];
      const formulas: any[] = [];
      const examples: { koId: string; title: string; content: string; difficulty: string; importance: string }[] = [];
      const misconceptions: any[] = [];
      const overviews: { koId: string; title: string; content: string; discipline?: string; difficulty: string; importance: string }[] = [];
      
      let minLearningOrder = Infinity;

      for (const ko of kos) {
        if (ko.learningOrder < minLearningOrder) {
          minLearningOrder = ko.learningOrder;
        }

        const meta = (ko.metadata as any) || {};

        if (ko.type === "definition" || ko.type === "summary") {
          definitions.push({
            koId: ko.id,
            title: ko.title,
            content: ko.content,
            difficulty: ko.difficulty,
            importance: ko.importance,
          });
        } else if (ko.type === "formula") {
          const parsedMD = parseFormulaFromMarkdown(ko.content);
          const latex = meta.latex || parsedMD.latex || "";
          const parameters = meta.parameters || parsedMD.parameters || [];
          const assumptions = meta.assumptions || parsedMD.assumptions || [];
          const whenToUse = meta.whenToUse || parsedMD.whenToUse || [];

          // Link common mistakes from linked misconception KOs
          const linkedMistakes: string[] = [];
          const linkedKoIds = relationshipsMap.get(ko.id) || [];
          const misconceptionKOs = activeKOs.filter(
            k => k.type === "misconception" && (linkedKoIds.includes(k.id) || k.conceptName === ko.conceptName)
          );
          misconceptionKOs.forEach(m => {
            const mMeta = (m.metadata as any) || {};
            linkedMistakes.push(mMeta.myth || m.title || m.content);
          });

          formulas.push({
            koId: ko.id,
            title: ko.title,
            latex,
            parameters,
            assumptions,
            whenToUse,
            commonMistakes: meta.commonMistakes || linkedMistakes,
            difficulty: ko.difficulty,
            importance: ko.importance,
          });
        } else if (ko.type === "example" || ko.type === "exercise") {
          examples.push({
            koId: ko.id,
            title: ko.title,
            content: ko.content,
            difficulty: ko.difficulty,
            importance: ko.importance,
          });
        } else if (ko.type === "misconception") {
          misconceptions.push({
            koId: ko.id,
            title: ko.title,
            myth: meta.myth || ko.title,
            correction: meta.correction || ko.content,
            rationale: meta.physicalRationale || ko.content,
            difficulty: ko.difficulty,
            importance: ko.importance,
          });
        } else if (ko.type === "concept_overview") {
          overviews.push({
            koId: ko.id,
            title: ko.title,
            content: ko.content,
            discipline: meta.discipline,
            difficulty: ko.difficulty,
            importance: ko.importance,
          });
        }
      }

      dictConcepts.push({
        conceptName,
        definitions,
        formulas,
        examples,
        misconceptions,
        overviews,
        minLearningOrder,
      });
    }

    // Sort concepts in this chapter by learningOrder
    dictConcepts.sort((a, b) => a.minLearningOrder - b.minLearningOrder);

    chaptersList.push({
      id: chRec.id,
      title: chRec.title,
      concepts: dictConcepts,
    });
  }

  // Sort glossary alphabetically
  const glossary = Array.from(glossaryMap.values()).sort((a, b) =>
    a.term.localeCompare(b.term)
  );

  return {
    courseId,
    chapterIds,
    title: `Diktat Kuliah: ${courseRecord.title}`,
    generationHash,
    sections: {
      learningObjectives,
      formulaHandbook,
      conceptSummaries,
      engineeringNotes,
      commonMistakes,
      glossary,
    },
    chapters: chaptersList,
  };
}
