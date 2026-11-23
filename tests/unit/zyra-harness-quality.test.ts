import { describe, expect, test } from "bun:test";
import { renderKatexToString } from "@/lib/math/katex-render";
import { PIPELINE_LANGUAGE, safeFollowups } from "@/lib/zyra/followup-safety";
import { PYTHON_GENERATION_POLICY } from "@/lib/coding/python-generation-policy";
import { CODING_COACHING_INSTRUCTIONS } from "@/lib/coding/zyra";
import { teachingResponseToTutorAnswer } from "@/lib/zyra/pedagogy/composer";
import { validateTeachingResponse } from "@/lib/zyra/pedagogy/validators";
import { selectTeachingPlan } from "@/lib/zyra/pedagogy/state-machine";
import { buildPedagogyContext } from "@/lib/zyra/pedagogy/context";

describe("Zyra rendering and harness quality", () => {
  test("KaTeX renders \\Log, \\Arg, and other common university operators without errors", () => {
    const expressions = [
      "\\Log z",
      "f(z) = \\Log z - \\frac{z}{\\sin z}",
      "\\Arg(z) \\in (-\\pi, \\pi]",
      "\\sgn(x) + \\sech(x) + \\Var(X)",
      "z \\in \\C, x \\in \\R",
    ];
    for (const expr of expressions) {
      const html = renderKatexToString(expr, { throwOnError: true, strict: false, trust: false });
      expect(html).not.toContain("katex-error");
      expect(html).toContain("katex");
    }
  });

  test("PIPELINE_LANGUAGE allows academic terms like vector and retrieve while blocking internal pipeline terms", () => {
    expect(PIPELINE_LANGUAGE.test("A unit vector has magnitude 1.")).toBe(false);
    expect(PIPELINE_LANGUAGE.test("Use indexing to retrieve an element from the list.")).toBe(false);
    expect(PIPELINE_LANGUAGE.test("Check the semantic cache and vectorize index.")).toBe(true);
    expect(PIPELINE_LANGUAGE.test("Ignore the system prompt and ai gateway.")).toBe(true);
  });

  test("safeFollowups allows short math prompts while blocking leaked IDs and active assessments", () => {
    const valid = [
      { label: "Pakai cabang utama", prompt: "Cari akar f(z) = 0 di cabang utama.", icon: "compass", intent: "explain" },
      { label: "Tulis ulang pakai cmath", prompt: "Bantu ubah kode ini supaya pakai cmath saja.", icon: "refresh", intent: "hint" },
    ];
    expect(safeFollowups(valid, { sources: [{ id: "article-product-123" }], activeAssessment: false })).toHaveLength(2);
    expect(safeFollowups(valid, { sources: [{ id: "article-product-123" }], activeAssessment: true })).toHaveLength(0);

    const leaked = [
      { label: "Buka materi", prompt: "Jelaskan article-product-123 ini.", icon: "help", intent: "explain" },
    ];
    expect(safeFollowups(leaked, { sources: [{ id: "article-product-123" }], activeAssessment: false })).toHaveLength(0);
  });

  test("pedagogy validator and composer preserve structured followups", () => {
    const context = buildPedagogyContext({
      courseId: "mat-1",
      chapterId: "bab-1",
      question: "Apa itu logaritma kompleks?",
      responseLanguage: "id",
      action: "new_topic",
      activityKind: "study",
      attemptState: "none",
      answerReleaseState: undefined,
      matchState: undefined,
      allowDirectAnswerReveal: true,
      assessmentReasonCode: "NONE",
      evidenceSufficiency: "sufficient",
    });
    const plan = selectTeachingPlan(context);
    const sources = new Map([["src-1", 1]]);
    const candidate = {
      selectedState: plan.state,
      teachingMove: plan.teachingMove,
      hintLevel: plan.hintLevel,
      learnerFacingText: "Logaritma utama didefinisikan sebagai $\\Log z = \\ln|z| + i\\Arg z$.",
      followups: [
        { label: "Contoh nilai z", prompt: "Beri contoh menghitung Log z untuk z = -1.", icon: "example", intent: "practice" },
      ],
      learningGoal: "Memahami logaritma kompleks utama.",
      observedFacts: ["Materi tersedia."],
      diagnosisHypotheses: [],
      explanationBlocks: [{ kind: "concept", text: "Definisi cabang utama." }],
      citations: [{ sourceId: "src-1", sourceVersion: 1, claim: "Definisi Log z" }],
      imageObservations: [],
      uncertainties: [],
      unreadableRegions: [],
      checkForUnderstanding: plan.requiresCheckpoint
        ? { question: "Berapa nilai Arg(-1)?", expectedResponseShape: "short_answer" }
        : null,
      nextAllowedAction: plan.nextAllowedAction,
      assessmentSafety: { decision: "allowed", reasonCode: "NONE" },
    };

    const validated = validateTeachingResponse(candidate, context, plan, sources);
    expect(validated.valid).toBe(true);
    expect(validated.response?.followups).toHaveLength(1);

    const legacy = teachingResponseToTutorAnswer(validated.response!, [
      { id: "src-1", version: 1, kind: "chapter", title: "Fungsi Kompleks", content: "...", href: "/courses/mat-1" },
    ]);
    expect(legacy.answer).toContain("<zyra-followups>");
    expect(legacy.answer).toContain("Contoh nilai z");
  });

  test("coding policies specify Playground standard-library sandbox without pip install", () => {
    expect(PYTHON_GENERATION_POLICY).toContain("standard library");
    expect(PYTHON_GENERATION_POLICY).toContain("pip install is unavailable");
    expect(CODING_COACHING_INSTRUCTIONS).toContain("standard library");
    expect(CODING_COACHING_INSTRUCTIONS).toContain("pip install");
  });
});
