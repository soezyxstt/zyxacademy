import { db } from "@/db";
import { courses, chapters, knowledgeObjects } from "@/db/schema";
import { generateContentWithFallback } from "@/lib/gemini";
import { USE_CASES } from "@/lib/ai-router";
import { eq, asc, and } from "drizzle-orm";

// ─── GEMINI PROMPT BUILDER ───────────────────────────────────────────────────

/**
 * Standardized system prompt to instruct Gemini to compile KOs into canonical custom markdown containers.
 */
export function buildMaterialGenerationPrompt(
  courseTitle: string,
  chapterTitle: string,
  chapterOrderIndex: number,
  kos: (typeof knowledgeObjects.$inferSelect)[]
): string {
  const MAX_KO_CONTENT_CHARS = 2000;
  const kosFormatted = kos.map(ko => {
    const content = ko.content.length > MAX_KO_CONTENT_CHARS
      ? ko.content.slice(0, MAX_KO_CONTENT_CHARS) + "\n...[truncated]"
      : ko.content;
    return `### Knowledge Object
- ID: ${ko.id}
- Title: ${ko.title}
- Type: ${ko.type}
- Difficulty: ${ko.difficulty}
- Bloom Level: ${ko.bloomLevel}
- Importance: ${ko.importance}
- Original Content:
${content}`;
  }).join("\n\n-------------------\n\n");

  return `You are ZYX Canonical Knowledge Compiler.

Your job is to transform a list of Knowledge Objects (KOs) into a single coherent chapter in COMPILER-READY Canonical Markdown for ZYX Academy.

You are NOT writing free-form notes.
You are NOT inventing new syntax.
You are NOT designing new features.
You are ONLY producing Markdown that matches the current ZYX parser, validator, and renderer.

COURSE TITLE: ${courseTitle}
CHAPTER TITLE: ${chapterTitle}
CHAPTER ORDER: ${chapterOrderIndex}

INPUT KNOWLEDGE OBJECTS:
${kosFormatted}

MANDATORY GOALS
1. Produce one cohesive chapter in Bahasa Indonesia.
2. Map every KO to at least one matching block.
3. Keep the output fully self-contained.
4. Use only syntax that ZYX already supports.
5. Prefer canonical academic structure over stylistic variation.
6. Make the output valid for the AST pipeline, KaTeX rendering, and visual rendering.

OUTPUT RULES
- Output ONLY Markdown.
- Do not add explanations, commentary, or prefacing text.
- Do not wrap the whole answer in markdown fences.
- Start immediately with: # ${chapterTitle}
- Use only these heading levels:
  # Chapter
  ## Section
  ### Subsection
- Do not skip heading levels.
- Do not create headings like # GLOSSARY, # SUMMARY, or # FORMULA.

ALLOWED BLOCKS
Use only these custom blocks:
:::learning_objective
:::concept
:::formula
:::formula_reference
:::engineering_insight
:::example
:::misconception
:::exercise
:::warning
:::note
:::summary
:::chart
:::graph
:::flowchart
:::diagram
:::glossary_term

BLOCK CONTRACTS

1) learning_objective
:::learning_objective {bloomLevel="[bloomLevel]"}
- objective 1
- objective 2
:::

2) concept
:::concept {ref="[KO_ID]", title="[TITLE]"}
Explanation of exactly one concept.
Include definition, intuition, interpretation, or relation if needed.
Keep it atomic and self-contained.
Do not put the main formula here.
:::

3) formula
:::formula {ref="[KO_ID]"}
$$
FORMULA
$$
| Simbol | Satuan | Definisi |
|---|---|---|
| ... | ... | ... |
:::
Use this for one main formula or one closely related formula set only.
Do not place the main formula inside a concept block.

4) formula_reference
:::formula_reference {linkedFormulaBlockId="[BLOCK_ID]"}
$$
REFERENCE OR DERIVED EQUATION
$$
:::

5) engineering_insight
:::engineering_insight {discipline="[discipline]"}
Real-world application and engineering meaning.
:::

6) example
:::example {ref="[KO_ID]", difficulty="[difficulty]"}
#### Problem
...
#### Solution
1. ...
2. ...
3. ...
:::

7) misconception
:::misconception {ref="[KO_ID]"}
#### Misconception
...
#### Correction
...
:::

8) exercise
:::exercise {ref="[KO_ID]"}
Questions or tasks for students.
:::

9) warning / note
:::warning
Important caution.
:::
:::note
Helpful clarification.
:::

10) summary
:::summary
- point 1
- point 2
- point 3
:::

11) glossary_term
:::glossary_term {term="[TERM]"}
Definition of the term.
:::
When a glossary term is introduced, reuse it later with [[TERM]].

VISUAL RULES
Use visuals only when they genuinely improve understanding.
Do not invent unsupported visual syntax.

A) graph
Use ONLY this format:
:::graph {id="[unique-graph-id]"}
functions:
  - y = [function of x]
  - y = [function of x]   # optional additional function
domain:
  min: [number]
  max: [number]
samples: [number]
:::

Graph rules:
- Use only the fields: functions, domain, samples.
- Do NOT use equation, equations, range, features, annotations, metadata, or similar extra fields.
- If comparing multiple curves, list multiple functions.
- Choose a domain that shows the phenomenon clearly.
- Use graphs for function behavior, limits, continuity, asymptotes, and trigonometric curves when relevant.

B) chart
Use ONLY this format:
:::chart {id="[unique-chart-id]"}
chartType: [line|bar|scatter|histogram|pie]
xLabel: [X Axis Label]
yLabel: [Y Axis Label]
data:
  - [xVal, yVal]
:::

Chart rules:
- Use only chartType, xLabel, yLabel, and data.
- Do not add extra unsupported fields.

C) flowchart
Use ONLY edge syntax:
:::flowchart {id="[unique-flowchart-id]"}
A --> B
B --> C
:::

Flowchart rules:
- Use only explicit edges.
- Do not use ASCII art, Mermaid, or text-box layouts.
- Use for procedures, algorithms, and step-by-step workflows.

D) diagram
Use ONLY edge syntax:
:::diagram {id="[unique-diagram-id]"}
A --> B
A --> C
B --> D
:::

Diagram rules:
- Use only explicit edges.
- Do not use classifications:, parent:, children:, nodes:, edges:, Mermaid, or ASCII art.
- Use for hierarchies, classification, and relationships.

KO MAPPING RULES
- Every KO ID must appear in at least one block.
- Preserve the KO ID exactly as given.
- If a KO is a concept, use it in a concept block.
- If a KO is a formula, use it in a formula block.
- If a KO is an example, use it in an example block.
- If a KO is a misconception, use it in a misconception block.
- If a KO is an objective, use it in learning_objective.
- If a KO is a summary, use it in summary.

PEDAGOGICAL RULES
- Write in Bahasa Indonesia.
- Keep explanations clear, compact, and textbook-like.
- Decompose content into atomic knowledge units.
- Do not mix many ideas into one concept block.
- Do not place a primary formula inside a concept block.
- Use self-contained explanations only.
- Use inline math with $...$ and display math with $$...$$.
- Avoid references such as “as mentioned above” or “see figure 2”.
- Prefer deterministic structure over creative variation.

SELF-VALIDATION BEFORE FINAL OUTPUT
Check that:
- Every KO is mapped.
- Every block uses valid ZYX syntax.
- No unsupported visual fields are used.
- No Mermaid is used.
- No ASCII diagrams are used.
- Headings are sequential and valid.
- Main formulas are separated into formula blocks.
- Glossary terms are reusable with [[TERM]].
- The output is immediately compilable by the ZYX AST pipeline.

If any rule is violated, fix it before outputting the final Markdown.

FINAL OUTPUT MUST BE ONLY THE CHAPTER MARKDOWN.
Start immediately with:
# ${chapterTitle}`;
}

// ─── CORE MATERIAL COMPILING ACTION ──────────────────────────────────────────

/**
 * Compiles a chapter's constituent Knowledge Objects into Website Material canonical Markdown.
 * Interacts with PostgreSQL to fetch course, chapter and KO records, and routes to Gemini.
 */
export async function generateMarkdownForChapter(chapterId: string, userId?: string): Promise<string> {
  // 1. Fetch chapter from database
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
    throw new Error(`Parent course not found for chapter ID: ${chapterId}`);
  }

  // 3. Fetch constituent active KOs sorted by order index
  const kos = await db
    .select()
    .from(knowledgeObjects)
    .where(and(eq(knowledgeObjects.chapterId, chapterId), eq(knowledgeObjects.status, "active")))
    .orderBy(asc(knowledgeObjects.learningOrder));

  if (kos.length === 0) {
    throw new Error(`No Knowledge Objects found for chapter ID: ${chapterId}`);
  }

  // 4. Fallback mock generation if MOCK_GEMINI is set to true
  if (process.env.MOCK_GEMINI === "true") {
    console.log(`[Mock Pipeline] Generating mock Markdown for Chapter: ${chapterRecord.title}`);
    let markdown = `# ${chapterRecord.title}\n\n`;
    
    // Add learning objectives block
    markdown += `:::learning_objective {bloomLevel="remember"}\n`;
    kos.forEach(ko => {
      markdown += `- Learn the key concepts of ${ko.title}\n`;
    });
    markdown += `:::\n\n`;

    // Map each KO to its corresponding block
    kos.forEach(ko => {
      if (ko.type === "definition" || ko.type === "concept_overview") {
        markdown += `:::concept {ref="${ko.id}", title="${ko.title}"}\n`;
        markdown += `${ko.content}\n`;
        markdown += `:::\n\n`;
      } else if (ko.type === "formula") {
        markdown += `:::formula {ref="${ko.id}"}\n`;
        markdown += `$$\\tau = r \\cdot F \\cdot \\sin(\\theta)$$\n`;
        markdown += `| Parameter | Unit | Definition |\n`;
        markdown += `|---|---|---|\n`;
        markdown += `| \\tau | N.m | Torque |\n`;
        markdown += `| r | m | Lever arm |\n`;
        markdown += `| F | N | Force magnitude |\n`;
        markdown += `| \\theta | rad | Angle |\n`;
        markdown += `:::\n\n`;
        
        markdown += `:::formula_reference {linkedFormulaBlockId="formula-ref-1"}\n`;
        markdown += `$$\\tau = r \\cdot F$$\n`;
        markdown += `:::\n\n`;
      } else if (ko.type === "example") {
        markdown += `:::example {ref="${ko.id}", difficulty="${ko.difficulty}"}\n`;
        markdown += `#### Problem\nCalculate torque with force 10 N and length 0.25 m.\n\n#### Solution\n1. Identify variables: F = 10 N, r = 0.25 m.\n2. Compute: $\\tau = r \\cdot F = 2.5 \\text{ N.m}$.\n`;
        markdown += `:::\n\n`;
      } else if (ko.type === "misconception") {
        markdown += `:::misconception {ref="${ko.id}"}\n`;
        markdown += `#### Misconception\nTorque depends only on force magnitude.\n\n#### Correction\nIt depends on lever arm distance and angle too.\n`;
        markdown += `:::\n\n`;
      } else {
        markdown += `:::concept {ref="${ko.id}", title="${ko.title}"}\n`;
        markdown += `${ko.content}\n`;
        markdown += `:::\n\n`;
      }
    });

    // Add engineering insight
    markdown += `:::engineering_insight {discipline="mechanical"}\n`;
    markdown += `Torque measurements are vital in turbine shaft control loop systems.\n`;
    markdown += `:::\n\n`;

    // Add warning
    markdown += `:::warning\n`;
    markdown += `Never exceed structural limits of wrenches during load tests.\n`;
    markdown += `:::\n\n`;

    // Add summary
    markdown += `:::summary\n`;
    markdown += `- Torque is rotational equivalence of force.\n`;
    markdown += `- Always check coordinate angles.\n`;
    markdown += `:::\n\n`;

    return markdown.trim();
  }

  // 5. Query Gemini API
  console.log(`[AI Pipeline] Synthesizing Markdown from ${kos.length} KOs for Chapter: ${chapterRecord.title}...`);
  const prompt = buildMaterialGenerationPrompt(
    courseRecord.title,
    chapterRecord.title,
    chapterRecord.orderIndex,
    kos
  );

  const { response } = await generateContentWithFallback({
      userId,
    useCase: USE_CASES.MATERIAL_GEN,
    contents: prompt,
  });

  const outputMarkdown = response.text ?? "";
  if (!outputMarkdown.trim()) {
    throw new Error("Gemini returned an empty compilation response.");
  }

  return outputMarkdown.trim();
}
