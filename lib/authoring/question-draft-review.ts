import { validateExtractedQuestion } from "@/lib/question-markdown";
import type { NormalizedQuestionBankDraft } from "@/lib/authoring/question-bank-draft";

export type DraftReviewSeverity = "blocking" | "warning";

export type DraftReviewIssue = {
  code: string;
  message: string;
  path?: string;
  severity: DraftReviewSeverity;
};

export type DraftReviewIdeaRow = {
  id: string;
  code: string;
  courseId: string;
  chapterId: string;
  status: string;
};

export type DraftReviewInput = {
  draft: NormalizedQuestionBankDraft;
  scopeCourseId: string;
  scopeChapterId: string;
  ideas: readonly DraftReviewIdeaRow[];
};

export type DraftCoverageStats = {
  catalogIdeaCount: number;
  coveredIdeaCount: number;
  coveredIdeaIds: string[];
  uncoveredIdeaIds: string[];
  questionsPerIdea: Record<string, number>;
};

export type DraftReviewStats = {
  questionCount: number;
  linkedQuestionCount: number;
  unlinkedQuestionCount: number;
  difficultyDistribution: Record<string, number>;
  cognitiveLevelDistribution: Record<string, number>;
  questionTypeDistribution: Record<string, number>;
  tagCounts: Array<{ tag: string; count: number }>;
  coverage: DraftCoverageStats;
};

export type DraftReviewResult = {
  valid: boolean;
  blockingIssueCount: number;
  warningCount: number;
  issues: DraftReviewIssue[];
  issuesTruncated: boolean;
  stats: DraftReviewStats;
};

export const DRAFT_REVIEW_ISSUE_LIMIT = 100;

const WEIGHT_TOLERANCE = 0.000001;

function blocking(code: string, message: string, path?: string): DraftReviewIssue {
  return { code, message, path, severity: "blocking" };
}

function warning(code: string, message: string, path?: string): DraftReviewIssue {
  return { code, message, path, severity: "warning" };
}

function incrementCounter(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

function sortedCounts(counter: Record<string, number>): Array<{ tag: string; count: number }> {
  return Object.entries(counter)
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => left.count - right.count || left.tag.localeCompare(right.tag))
    .map(({ tag, count }) => ({ tag, count }));
}

export function reviewQuestionBankDraft(input: DraftReviewInput): DraftReviewResult {
  const { draft, scopeCourseId, scopeChapterId } = input;
  const issues: DraftReviewIssue[] = [];
  const ideaById = new Map(input.ideas.map((idea) => [idea.id, idea]));
  const questionsPerIdea = new Map<string, number>();

  const difficultyDistribution: Record<string, number> = {};
  const cognitiveLevelDistribution: Record<string, number> = {};
  const questionTypeDistribution: Record<string, number> = {};
  const tagCounter: Record<string, number> = {};

  let linkedQuestionCount = 0;

  const seenExternalIds = new Set<string>();
  for (const [index, item] of draft.items.entries()) {
    const pathPrefix = `questions[${index}]`;
    const label = `Soal ${item.externalId}`;

    if (seenExternalIds.has(item.externalId)) {
      issues.push(blocking("QUESTION_BANK_DRAFT_DUPLICATE_ID", `${label} memakai ID yang sama dengan soal lain dalam draft.`, `${pathPrefix}.id`));
    }
    seenExternalIds.add(item.externalId);

    const structuralError = validateExtractedQuestion({ ...item.question, sourceIndex: index + 1 }, index + 1);
    if (structuralError) issues.push(blocking("QUESTION_AUTHORING_INVALID_QUESTION", structuralError, pathPrefix));

    if (new Set(item.question.correctIndices).size !== item.question.correctIndices.length) {
      issues.push(blocking("QUESTION_AUTHORING_DUPLICATE_ANSWER", `${label} memiliki kunci jawaban ganda yang sama.`, `${pathPrefix}.correctIndices`));
    }

    if (!item.question.explanation.trim()) {
      issues.push(warning("QUESTION_EXPLANATION_EMPTY", `${label} belum memiliki pembahasan.`, `${pathPrefix}.explanation`));
    }

    incrementCounter(difficultyDistribution, item.question.difficulty);
    incrementCounter(cognitiveLevelDistribution, item.question.cognitiveLevel);
    incrementCounter(questionTypeDistribution, item.question.questionType);
    for (const tag of new Set(item.question.tags)) {
      incrementCounter(tagCounter, tag);
    }

    if (item.ideaLinks.length === 0) {
      issues.push(blocking("QUESTION_AUTHORING_IDEA_REQUIRED", `${label} harus memiliki minimal satu published Idea.`, `${pathPrefix}.ideaLinks`));
      continue;
    }
    linkedQuestionCount += 1;
    if (item.ideaLinks.filter((link) => link.role === "primary").length !== 1) {
      issues.push(blocking("QUESTION_AUTHORING_PRIMARY_IDEA_REQUIRED", `${label} harus memiliki tepat satu Idea dengan role primary.`, `${pathPrefix}.ideaLinks`));
    }

    const linkIds = item.ideaLinks.map((link) => link.ideaId);
    if (new Set(linkIds).size !== linkIds.length) {
      issues.push(blocking("QUESTION_AUTHORING_DUPLICATE_IDEA", `${label} memilih Idea yang sama lebih dari sekali.`, `${pathPrefix}.ideaLinks`));
    }

    const weightSum = item.ideaLinks.reduce((sum, link) => sum + link.weight, 0);
    if (Math.abs(weightSum - 1) > WEIGHT_TOLERANCE) {
      issues.push(blocking("QUESTION_AUTHORING_IDEA_WEIGHT_INVALID", `Total bobot Idea untuk ${label} harus sama dengan 1.`, `${pathPrefix}.ideaLinks`));
    }

    for (const [linkIndex, link] of item.ideaLinks.entries()) {
      const linkPath = `${pathPrefix}.ideaLinks[${linkIndex}]`;
      const idea = ideaById.get(link.ideaId);
      if (!idea) {
        issues.push(blocking("QUESTION_AUTHORING_IDEA_NOT_FOUND", `${label} merujuk Idea ${link.ideaId} yang tidak ditemukan.`, linkPath));
        continue;
      }
      if (idea.status !== "published") {
        issues.push(blocking("QUESTION_AUTHORING_IDEA_NOT_PUBLISHED", `${label} merujuk Idea ${idea.code} yang belum published.`, linkPath));
        continue;
      }
      if (idea.courseId !== scopeCourseId) {
        issues.push(blocking("QUESTION_AUTHORING_IDEA_COURSE_MISMATCH", `${label} merujuk Idea ${idea.code} dari mata kuliah lain.`, linkPath));
        continue;
      }
      if (idea.chapterId !== scopeChapterId) {
        issues.push(blocking("QUESTION_AUTHORING_IDEA_CHAPTER_MISMATCH", `${label} merujuk Idea ${idea.code} di luar bab yang dikunci.`, linkPath));
        continue;
      }
      questionsPerIdea.set(link.ideaId, (questionsPerIdea.get(link.ideaId) ?? 0) + 1);
    }
  }

  const catalogIdeas = input.ideas.filter((idea) => idea.status === "published" && idea.courseId === scopeCourseId && idea.chapterId === scopeChapterId);
  const uncoveredIdeaIds = catalogIdeas.map((idea) => idea.id).filter((id) => !questionsPerIdea.has(id));
  for (const uncovered of uncoveredIdeaIds.slice(0, 25)) {
    const idea = ideaById.get(uncovered);
    issues.push(warning("QUESTION_COVERAGE_GAP", `Idea ${idea?.code ?? uncovered} belum tercover soal mana pun.`, "coverage"));
  }

  const truncated = issues.length > DRAFT_REVIEW_ISSUE_LIMIT;
  const finalIssues = truncated ? issues.slice(0, DRAFT_REVIEW_ISSUE_LIMIT) : issues;
  const blockingIssueCount = finalIssues.filter((issue) => issue.severity === "blocking").length;
  const warningCount = finalIssues.filter((issue) => issue.severity === "warning").length;
  const coveredIdeaIds = [...questionsPerIdea.keys()].sort();

  return {
    valid: blockingIssueCount === 0 && !truncated,
    blockingIssueCount,
    warningCount,
    issues: finalIssues,
    issuesTruncated: truncated,
    stats: {
      questionCount: draft.items.length,
      linkedQuestionCount,
      unlinkedQuestionCount: draft.items.length - linkedQuestionCount,
      difficultyDistribution,
      cognitiveLevelDistribution,
      questionTypeDistribution,
      tagCounts: sortedCounts(tagCounter),
      coverage: {
        catalogIdeaCount: catalogIdeas.length,
        coveredIdeaCount: coveredIdeaIds.length,
        coveredIdeaIds,
        uncoveredIdeaIds,
        questionsPerIdea: Object.fromEntries([...questionsPerIdea.entries()].sort(([left], [right]) => left.localeCompare(right))),
      },
    },
  };
}
