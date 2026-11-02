import { describe, expect, it } from "bun:test";
import { buildFormSteps, formFileSizeLimitMb, isEmptyFormAnswer } from "@/lib/forms/presentation";

describe("Form presentation", () => {
  it("keeps legacy one-question pages without a review step", () => {
    expect(buildFormSteps([{ type: "TEXT" }, { type: "SECTION" }, { type: "RADIO" }], undefined, true))
      .toEqual([{ kind: "cover" }, { kind: "email" }, { kind: "question", questionIndex: 0 },
        { kind: "section", questionIndex: 1 }, { kind: "question", questionIndex: 2 }]);
  });

  it("groups an implicit first section and starts each later section on a new page", () => {
    expect(buildFormSteps([{ type: "TEXT" }, { type: "STATEMENT" }, { type: "SECTION" }, { type: "TEXT" }], "section", true))
      .toEqual([
        { kind: "page", questionIndices: [0, 1], includeCover: true, includeEmail: true },
        { kind: "page", questionIndices: [2, 3], includeCover: false, includeEmail: false },
      ]);
  });

  it("does not invent an empty welcome page before a leading section", () => {
    expect(buildFormSteps([{ type: "SECTION" }, { type: "TEXT" }], "section")).toHaveLength(1);
  });

  it("keeps consecutive and closing sections, including their instructions", () => {
    const pages = buildFormSteps([{ type: "SECTION" }, { type: "SECTION" }, { type: "TEXT" }, { type: "SECTION" }], "section");
    expect(pages.map((page) => page.kind === "page" && page.questionIndices)).toEqual([[0], [1, 2], [3]]);
    expect(buildFormSteps([], "section")).toHaveLength(1);
  });

  it("uses the editor default and clamps file limits to the upload endpoint maximum", () => {
    expect(formFileSizeLimitMb()).toBe(10);
    expect(formFileSizeLimitMb(5)).toBe(5);
    expect(formFileSizeLimitMb(500)).toBe(50);
    for (const value of [NaN, Infinity, 0, -1]) expect(formFileSizeLimitMb(value)).toBe(10);
  });

  it("requires each row of a required grid and rejects whitespace answers", () => {
    const question = { type: "GRID_CHECKBOX", gridRows: ["Materi", "Tutor"] };
    expect(isEmptyFormAnswer(question, {})).toBe(true);
    expect(isEmptyFormAnswer(question, { Materi: ["Baik"], Tutor: [] })).toBe(true);
    expect(isEmptyFormAnswer(question, { Materi: ["Baik"], Tutor: ["Baik"] })).toBe(false);
    expect(isEmptyFormAnswer({ type: "TEXT" }, "  ")).toBe(true);
  });
});
