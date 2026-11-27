import { describe, expect, test } from "bun:test";
import { addVisibleQuizQuestions, emptyQuizQuestionFilters, filterQuizQuestions, removeVisibleQuizQuestions, unchangedOrEligibleSelection, type PickerQuestion } from "./quiz-picker";

const bank: PickerQuestion[] = [
  { id: "first", prompt: "Definisi integral", type: "multiple_choice", origin: "zyx_original", quizSelectable: true, reviewStatus: "published", difficulty: "easy", tags: ["integral"] },
  { id: "second", prompt: "Latihan Integral", type: "essay", origin: "zyx_original", quizSelectable: true, reviewStatus: "published", difficulty: "hard", tags: ["integral"] },
  { id: "old", prompt: "Deret integral", type: "essay", origin: "historical_reference", quizSelectable: false, reviewStatus: "flagged", difficulty: "hard", tags: ["integral"] },
  { id: "other", prompt: "Deret tak hingga", type: "essay", origin: "itb_example", quizSelectable: true, reviewStatus: "published", difficulty: "hard", tags: ["deret"] },
];

describe("Admin quiz fixed-question picker", () => {
  test("combines query, difficulty, type, origin, review status, tag and selected-only", () => {
    const base = { bank, ids: ["second", "old"], disabledIds: [], search: " INTEGRAL " };
    expect(filterQuizQuestions({ ...base, filters: { ...emptyQuizQuestionFilters,
      difficulty: "hard", type: "essay", status: "published", origin: "zyx_original", tag: "integral", selectedOnly: true,
    } }).map(({ id }) => id)).toEqual(["second"]);
    expect(filterQuizQuestions({ ...base, disabledIds: ["old"], filters: { ...emptyQuizQuestionFilters, status: "flagged" } })).toEqual([]);
    expect(filterQuizQuestions({ ...base, filters: { ...emptyQuizQuestionFilters, origin: "itb_example" } })).toEqual([]);
  });

  test("bulk operations preserve original order, use all filtered rows and skip ineligible additions", () => {
    const visible = filterQuizQuestions({ bank, ids: ["other", "second"], disabledIds: [], search: "integral", filters: emptyQuizQuestionFilters });
    const added = addVisibleQuizQuestions(["other", "second"], visible);
    expect(added).toEqual(["other", "second", "first"]);
    expect(removeVisibleQuizQuestions(added, visible)).toEqual(["other"]);
    expect(removeVisibleQuizQuestions(["old", ...added], [bank[2]])).toEqual(added);
  });

  test("an old ineligible question can be kept on a metadata-only edit or removed", () => {
    expect(unchangedOrEligibleSelection(["old", "second"], ["old", "second"], bank)).toBe(true);
    expect(unchangedOrEligibleSelection(["second", "old"], ["old", "second"], bank)).toBe(false);
    expect(unchangedOrEligibleSelection(["second"], ["old", "second"], bank)).toBe(true);
  });
});
