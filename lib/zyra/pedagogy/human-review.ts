import { createHash } from "node:crypto";
import { z } from "zod";

export const PEDAGOGY_REVIEW_DIMENSIONS = [
  "clarity",
  "scaffolding",
  "helpfulness",
  "cognitiveLoad",
  "understandingOverAnswerReveal",
] as const;

export type PedagogyReviewDimension = (typeof PEDAGOGY_REVIEW_DIMENSIONS)[number];

const DraftRubricSchema = z.object({
  clarity: z.null(),
  scaffolding: z.null(),
  helpfulness: z.null(),
  cognitiveLoad: z.null(),
  understandingOverAnswerReveal: z.null(),
  reviewerNotes: z.literal(""),
}).strict();

export const PedagogyHumanReviewDraftSchema = z.object({
  status: z.literal("pending_maintainer_review"),
  plan: z.literal("007"),
  runId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/),
  rubricScale: z.object({
    minimum: z.literal(1),
    maximum: z.literal(5),
    passingAverage: z.literal(4),
  }).strict(),
  instructions: z.string().min(1),
  syntheticInputsOnly: z.literal(true),
  reviewItems: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
    inputKind: z.literal("synthetic_golden"),
    baselineAnswer: z.string().max(20_000),
    candidateAnswer: z.string().max(20_000),
    rubric: DraftRubricSchema,
  }).strict()).min(1).max(40),
  secretsPrinted: z.literal(false),
  authenticatedUrlsPrinted: z.literal(false),
}).strict();

export type PedagogyHumanReviewDraft = z.infer<typeof PedagogyHumanReviewDraftSchema>;

const ReviewScoreSchema = z.number().int().min(1).max(5);

const SubmittedRubricSchema = z.object({
  clarity: ReviewScoreSchema,
  scaffolding: ReviewScoreSchema,
  helpfulness: ReviewScoreSchema,
  cognitiveLoad: ReviewScoreSchema,
  understandingOverAnswerReveal: ReviewScoreSchema,
  reviewerNotes: z.string().max(2_000),
}).strict();

export const PedagogyHumanReviewSubmissionSchema = z.object({
  status: z.literal("submitted"),
  plan: z.literal("007"),
  runId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/),
  reviewer: z.object({
    type: z.literal("maintainer_human"),
    identityHash: z.string().regex(/^[a-f0-9]{64}$/),
    reviewedAt: z.string().datetime({ offset: true }),
  }).strict(),
  syntheticInputsOnly: z.literal(true),
  reviewItems: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
    inputKind: z.literal("synthetic_golden"),
    rubric: SubmittedRubricSchema,
  }).strict()).min(1).max(40),
}).strict();

export type PedagogyHumanReviewSubmission = z.infer<typeof PedagogyHumanReviewSubmissionSchema>;

export interface PedagogyHumanReviewResult {
  status: "passed" | "failed";
  plan: "007";
  runId: string;
  reviewerType: "maintainer_human";
  reviewerIdentityHash: string;
  reviewedAt: string;
  reviewItemCount: number;
  dimensionAverages: Record<PedagogyReviewDimension, number>;
  overallAverage: number;
  lowScoreCount: number;
  reasonCodes: string[];
  sourceDraftHash: string;
  rawAnswersStored: false;
  rawReviewerIdentityStored: false;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertUniqueIds(ids: readonly string[], code: string): void {
  if (new Set(ids).size !== ids.length) throw new Error(code);
}

export function validatePedagogyHumanReview(
  draftInput: unknown,
  submissionInput: unknown,
): PedagogyHumanReviewResult {
  const draft = PedagogyHumanReviewDraftSchema.parse(draftInput);
  const submission = PedagogyHumanReviewSubmissionSchema.parse(submissionInput);
  if (draft.runId !== submission.runId) throw new Error("PEDAGOGY_REVIEW_RUN_ID_MISMATCH");

  const draftIds = draft.reviewItems.map((item) => item.id);
  const submittedIds = submission.reviewItems.map((item) => item.id);
  assertUniqueIds(draftIds, "PEDAGOGY_REVIEW_DRAFT_DUPLICATE_ID");
  assertUniqueIds(submittedIds, "PEDAGOGY_REVIEW_SUBMISSION_DUPLICATE_ID");
  if (
    draftIds.length !== submittedIds.length
    || [...draftIds].sort().some((id, index) => id !== [...submittedIds].sort()[index])
  ) {
    throw new Error("PEDAGOGY_REVIEW_ITEM_SET_MISMATCH");
  }

  const totals = Object.fromEntries(PEDAGOGY_REVIEW_DIMENSIONS.map((dimension) => [dimension, 0])) as Record<PedagogyReviewDimension, number>;
  let lowScoreCount = 0;
  const reasonCodes = new Set<string>();
  for (const item of submission.reviewItems) {
    const scores = PEDAGOGY_REVIEW_DIMENSIONS.map((dimension) => item.rubric[dimension]);
    scores.forEach((score, index) => {
      totals[PEDAGOGY_REVIEW_DIMENSIONS[index]] += score;
      if (score < 3) lowScoreCount += 1;
    });
    if (scores.some((score) => score < 4) && item.rubric.reviewerNotes.trim().length === 0) {
      reasonCodes.add("PEDAGOGY_REVIEW_NOTES_REQUIRED_FOR_LOW_SCORE");
    }
  }

  const dimensionAverages = Object.fromEntries(PEDAGOGY_REVIEW_DIMENSIONS.map((dimension) => [
    dimension,
    Number((totals[dimension] / submission.reviewItems.length).toFixed(3)),
  ])) as Record<PedagogyReviewDimension, number>;
  const overallAverage = Number((
    PEDAGOGY_REVIEW_DIMENSIONS.reduce((sum, dimension) => sum + dimensionAverages[dimension], 0)
    / PEDAGOGY_REVIEW_DIMENSIONS.length
  ).toFixed(3));

  for (const dimension of PEDAGOGY_REVIEW_DIMENSIONS) {
    if (dimensionAverages[dimension] < draft.rubricScale.passingAverage) {
      reasonCodes.add(`PEDAGOGY_REVIEW_${dimension.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_BELOW_GATE`);
    }
  }
  if (lowScoreCount > 0) reasonCodes.add("PEDAGOGY_REVIEW_SCORE_BELOW_THREE");

  const reasons = [...reasonCodes].sort();
  return {
    status: reasons.length === 0 ? "passed" : "failed",
    plan: "007",
    runId: draft.runId,
    reviewerType: "maintainer_human",
    reviewerIdentityHash: submission.reviewer.identityHash,
    reviewedAt: submission.reviewer.reviewedAt,
    reviewItemCount: submission.reviewItems.length,
    dimensionAverages,
    overallAverage,
    lowScoreCount,
    reasonCodes: reasons,
    sourceDraftHash: sha256(stableSerialize(draft)),
    rawAnswersStored: false,
    rawReviewerIdentityStored: false,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function reviewItemHtml(item: PedagogyHumanReviewDraft["reviewItems"][number], index: number): string {
  const dimensions = PEDAGOGY_REVIEW_DIMENSIONS.map((dimension) => `
        <label>${escapeHtml(dimension)}
          <select data-score="${escapeHtml(dimension)}" required>
            <option value="">Pilih</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </label>`).join("");
  return `
    <section class="review-item" data-item-id="${escapeHtml(item.id)}" data-input-kind="${item.inputKind}">
      <h2>Kasus ${index + 1}</h2>
      <div class="answers">
        <article><h3>Baseline</h3><pre>${escapeHtml(item.baselineAnswer)}</pre></article>
        <article><h3>Candidate</h3><pre>${escapeHtml(item.candidateAnswer)}</pre></article>
      </div>
      <div class="scores">${dimensions}
        <label class="notes">Catatan reviewer
          <textarea data-notes rows="4" maxlength="2000"></textarea>
        </label>
      </div>
    </section>`;
}

export function renderPedagogyHumanReviewPage(draftInput: unknown): string {
  const draft = PedagogyHumanReviewDraftSchema.parse(draftInput);
  const items = draft.reviewItems.map(reviewItemHtml).join("\n");
  const runId = JSON.stringify(draft.runId);
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <title>Plan 007 human review</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, system-ui, sans-serif; }
    body { max-width: 1120px; margin: 0 auto; padding: 24px; background: Canvas; color: CanvasText; }
    h1, h2, h3 { font-family: system-ui, sans-serif; }
    .review-item { border: 1px solid GrayText; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .answers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    article { min-width: 0; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; border: 1px solid GrayText; border-radius: 8px; }
    .scores { display: grid; grid-template-columns: repeat(5, minmax(130px, 1fr)); gap: 12px; margin-top: 16px; }
    label { display: grid; gap: 6px; }
    select, textarea, input, button { font: inherit; padding: 8px; border: 1px solid GrayText; border-radius: 6px; }
    .notes { grid-column: 1 / -1; }
    .reviewer { display: grid; gap: 8px; max-width: 520px; }
    button { margin-top: 16px; cursor: pointer; }
    #status { min-height: 24px; }
    @media (max-width: 760px) { .answers, .scores { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>Plan 007 human review</h1>
  <p>Bandingkan baseline dan candidate. Nilai setiap dimensi 1 sampai 5. Beri catatan untuk nilai di bawah 4.</p>
  <label class="reviewer">Identitas reviewer
    <input id="reviewer" autocomplete="off" placeholder="Nama atau email, hanya hash yang disimpan" required>
  </label>
  <form id="review-form">${items}
    <button type="submit">Unduh evidence review</button>
    <p id="status" role="status"></p>
  </form>
  <script>
    const runId = ${runId};
    const dimensions = ${JSON.stringify(PEDAGOGY_REVIEW_DIMENSIONS)};
    const encoder = new TextEncoder();
    const toHex = (bytes) => Array.from(new Uint8Array(bytes)).map((value) => value.toString(16).padStart(2, "0")).join("");
    document.getElementById("review-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const reviewer = document.getElementById("reviewer").value.trim();
      const status = document.getElementById("status");
      if (!reviewer) { status.textContent = "Identitas reviewer wajib diisi."; return; }
      const items = [];
      for (const element of document.querySelectorAll(".review-item")) {
        const rubric = {};
        for (const dimension of dimensions) {
          const value = Number(element.querySelector('[data-score="' + dimension + '"]').value);
          if (!Number.isInteger(value) || value < 1 || value > 5) {
            status.textContent = "Semua dimensi harus dinilai.";
            return;
          }
          rubric[dimension] = value;
        }
        rubric.reviewerNotes = element.querySelector("[data-notes]").value.trim();
        if (dimensions.some((dimension) => rubric[dimension] < 4) && !rubric.reviewerNotes) {
          status.textContent = "Nilai di bawah 4 membutuhkan catatan reviewer.";
          return;
        }
        items.push({ id: element.dataset.itemId, inputKind: element.dataset.inputKind, rubric });
      }
      const identityHash = toHex(await crypto.subtle.digest("SHA-256", encoder.encode(reviewer)));
      const submission = {
        status: "submitted",
        plan: "007",
        runId,
        reviewer: { type: "maintainer_human", identityHash, reviewedAt: new Date().toISOString() },
        syntheticInputsOnly: true,
        reviewItems: items,
      };
      const blob = new Blob([JSON.stringify(submission, null, 2) + "\n"], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "plan-007-pedagogy-human-review-submission.json";
      link.click();
      URL.revokeObjectURL(link.href);
      status.textContent = "Evidence review sudah diunduh.";
    });
  </script>
</body>
</html>`;
}
