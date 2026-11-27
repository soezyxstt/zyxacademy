import { describe, expect, test } from "bun:test";
import { getTutorDocs, searchTutorDocs } from "../../../academic/docs/tutor";
import { getTutorDocDiagram } from "../../../academic/docs/tutor/diagrams";
import { docSectionId } from "../../../academic/docs/search";
import { readDocInline } from "../../../academic/docs/inline";
import { createTutorFixtureData, tutorFixtureCourses } from "./fixtures";
import { filterGroups, filterParticipants, parseGrade, readAnswers } from "./model";

const actor = { id: "academic-tutor", role: "tutor" };
const [assigned, empty] = tutorFixtureCourses;
const outside = "academic-course-3";
const signal = new AbortController().signal;

describe("tutor route data", () => {
  test("lists assigned active courses and reads participants by canonical or legacy ID", async () => {
    const data = createTutorFixtureData(actor, "populated");
    const dashboard = await data.dashboard(signal);
    expect(dashboard.courses.map((course) => course.courseId)).toEqual([assigned.courseId, empty.courseId]);
    const result = await data.participants(assigned.courseId, signal);
    expect(await data.participants(assigned.legacyCourseId!, signal)).toEqual(result);
    expect(filterParticipants(result.participants, "  NADIA@Example.Test ", "both").map((person) => person.name)).toEqual(["Nadia Lestari"]);
    expect(filterParticipants(result.participants, "kelompok sel", "group").map((person) => person.name)).toEqual(["Rafi Ananda"]);
    expect(filterParticipants(result.participants, "kelompok sel", "direct")).toEqual([]);
    expect(filterGroups(result.groups, "rafi@").map((group) => group.name)).toEqual(["Kelompok Sel"]);
  });

  test("keeps an assigned empty course separate from a denied course", async () => {
    const data = createTutorFixtureData(actor, "populated");
    expect(await data.participants(empty.courseId, signal)).toEqual({ course: empty, participants: [], groups: [] });
    expect(await data.grading(empty.courseId, signal)).toEqual({ course: empty, submissions: [] });
    for (const id of [outside, "kimia-dasar", "missing"]) {
      await expect(data.participants(id, signal)).rejects.toMatchObject({ status: 403 });
      await expect(data.grading(id, signal)).rejects.toMatchObject({ status: 403 });
    }
  });

  test("denies a role or account mismatch even when the course ID is known", async () => {
    for (const denied of [
      { id: actor.id, role: "student" },
      { id: "academic-admin", role: "admin" },
      { id: "different-tutor", role: "tutor" },
    ]) {
      const data = createTutorFixtureData(denied, "populated");
      await expect(data.dashboard(signal)).rejects.toMatchObject({ status: 403 });
      await expect(data.participants(assigned.courseId, signal)).rejects.toMatchObject({ status: 403 });
      await expect(data.grading(assigned.courseId, signal)).rejects.toMatchObject({ status: 403 });
    }
  });

  test("recovers from a load failure and ignores an aborted request", async () => {
    const data = createTutorFixtureData(actor, "error");
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(data.grading(assigned.courseId, cancelled.signal)).rejects.toMatchObject({ status: 499 });
    await expect(data.grading(assigned.courseId, signal)).rejects.toMatchObject({ status: 503 });
    expect((await data.grading(assigned.courseId, signal)).submissions).toHaveLength(2);
  });
});

describe("tryout grading detail", () => {
  test("reads legacy JSON snapshots and safely handles malformed fields", async () => {
    const data = createTutorFixtureData(actor, "populated");
    const { submissions: [pending] } = await data.grading(assigned.courseId, signal);
    const detail = readAnswers({
      ...pending,
      answersSnapshot: JSON.stringify(pending.answersSnapshot),
      questionsSnapshot: JSON.stringify(pending.questionsSnapshot),
    });
    expect(detail[0].text).toContain("Lapisan ganda fosfolipid");
    expect(detail[1].options.filter((option) => option.chosen || option.correct))
      .toEqual([{ label: "Mitokondria", chosen: true, correct: true }]);
    expect(readAnswers({ ...pending, questionsSnapshot: "{unreadable", answersSnapshot: [] })).toEqual([]);
    expect(readAnswers({
      ...pending,
      questionsSnapshot: [{ id: "q", type: "short_answer", prompt: "Pertanyaan", options: [null], acceptableAnswers: [42, "Kunci"] }],
      answersSnapshot: { q: { text: [] } },
    })).toMatchObject([{ text: "", options: [], accepted: ["Kunci"] }]);
    expect(readAnswers({
      ...pending,
      questionsSnapshot: [
        { id: "single", type: "multiple_choice", prompt: "Satu", options: ["A", "B"], correctIndex: 1, correctIndices: [] },
        { id: "multiple", type: "multiple_choices", prompt: "Beberapa", options: ["A", "B"], correctIndex: 0, correctIndices: [0, 1] },
      ],
      answersSnapshot: { single: { index: 1, indices: [] }, multiple: { index: 0, indices: [1] } },
    }).map((question) => question.options.filter((option) => option.correct || option.chosen))).toEqual([
      [{ label: "B", correct: true, chosen: true }],
      [{ label: "A", correct: true, chosen: false }, { label: "B", correct: true, chosen: true }],
    ]);
  });

  test("publishes grades within a course and preserves prior values on invalid input", async () => {
    const data = createTutorFixtureData(actor, "populated");
    const { submissions: [pending] } = await data.grading(assigned.courseId, signal);
    const save = data.saveGrade!;
    await expect(save(empty.courseId, pending.id, { score: 91, notes: "Baik" })).rejects.toMatchObject({ status: 404 });
    await expect(save(assigned.courseId, pending.id, { score: 101, notes: "" })).rejects.toMatchObject({ status: 400 });
    expect((await data.grading(assigned.courseId, signal)).submissions[0]).toEqual(pending);
    await save(assigned.courseId, pending.id, { score: 0, notes: "Periksa kembali." });
    expect((await data.grading(assigned.courseId, signal)).submissions[0]).toMatchObject({ status: "graded", score: 0, teacherNotes: "Periksa kembali." });
    const fresh = createTutorFixtureData(actor, "populated");
    expect((await fresh.grading(assigned.courseId, signal)).submissions[0]).toEqual(pending);
  });

  test("accepts bounded integer grades", () => {
    expect(["0", " 100 ", "85"].map(parseGrade)).toEqual([0, 100, 85]);
    expect(["-1", "101", "", "abc", "12,5", "5.7"].map(parseGrade)).toEqual(Array(6).fill(null));
  });
});

test("tutor native documentation reuses the translated web guides", () => {
  expect(getTutorDocs()).toHaveLength(6);
  expect(getTutorDocs("en")[0].slug).toBe(getTutorDocs()[0].slug);
  expect(searchTutorDocs("kuis langsung").some((doc) => doc.slug === "kuis-langsung")).toBe(true);
  expect(searchTutorDocs("live quiz", "en").some((doc) => doc.slug === "kuis-langsung")).toBe(true);
  for (const locale of ["id", "en"] as const) {
    const ids = getTutorDocs(locale).flatMap(doc => doc.sections.flatMap(section => section.diagram ? [section.diagram] : []));
    expect(ids).toHaveLength(4);
    for (const id of ids) {
      const diagram = getTutorDocDiagram(id, locale);
      expect(diagram?.caption).toBeTruthy();
      expect(diagram?.rows.length).toBe(id === "tutorial-schedule-lifecycle" || id === "tutor-live-quiz-flow" ? 3 : 2);
      expect(diagram?.rows.every(row => row.title && row.note)).toBe(true);
    }
  }
  expect(docSectionId(1)).toBe("bagian-2");
  expect(readDocInline("Buka [Jadwal](/tutor/schedule#bagian-2), pilih **Tambah**, lalu ketik `lokasi`.")).toEqual([
    { kind: "text", text: "Buka " },
    { kind: "link", text: "Jadwal", href: "/tutor/schedule#bagian-2" },
    { kind: "text", text: ", pilih " },
    { kind: "strong", text: "Tambah" },
    { kind: "text", text: ", lalu ketik " },
    { kind: "code", text: "lokasi" },
    { kind: "text", text: "." },
  ]);
});

describe("session-owned tutor fixture interactions", () => {
  test("persists an open slot and rejects conflicts, invalid dates and booked edits", () => {
    const { repository } = createTutorFixtureData(actor, "populated");
    const changes: number[] = [];
    const stop = repository.subscribe(() => changes.push(repository.getSnapshot().slots.length));
    const draft = { date: "2026-11-28", time: "10:30", mode: "online", topic: "Dasar genetika", location: "" } as const;
    expect(repository.saveSlot({ ...draft, date: "2026-02-30" })).toEqual({ ok: false, reason: "invalid" });
    expect(repository.saveSlot({ ...draft, mode: "offline" })).toEqual({ ok: false, reason: "invalid" });
    expect(repository.saveSlot({ ...draft, time: "09:30" })).toEqual({ ok: false, reason: "conflict" });
    expect(repository.saveSlot({ ...draft, id: "academic-slot-1" })).toEqual({ ok: false, reason: "unavailable" });
    expect(repository.saveSlot(draft)).toEqual({ ok: true });
    const slotsOnReturn = repository.getSnapshot().slots;
    expect(slotsOnReturn[1]).toMatchObject({ id: "academic-slot-2", topic: draft.topic, booked: false });
    expect(repository.saveSlot({ ...slotsOnReturn[1], topic: "Dasar genetika lanjut" })).toEqual({ ok: true });
    stop();
    expect(changes).toEqual([2, 2]);
    expect(createTutorFixtureData(actor, "populated").repository.getSnapshot().slots).toHaveLength(1);
  });

  test("shares course and dashboard replies and denies writes outside the assigned course", () => {
    const { repository } = createTutorFixtureData(actor, "populated");
    expect(repository.replyToDiscussion(assigned.courseId, " ")).toBe(false);
    expect(() => repository.replyToDiscussion(outside, "Jawaban")).toThrow("(403)");
    expect(() => repository.replyToDiscussion(empty.courseId, "Jawaban")).toThrow("(404)");
    expect(repository.replyToDiscussion(undefined, "  Jawaban dari ruang diskusi  ")).toBe(true);
    expect(repository.replyToDiscussion(assigned.courseId, "Jawaban dari mata kuliah")).toBe(true);
    expect(repository.getSnapshot().discussionReplies.map((reply) => reply.body)).toEqual(["Jawaban dari ruang diskusi", "Jawaban dari mata kuliah"]);
    const admin = createTutorFixtureData({ id: "academic-admin", role: "admin" }, "populated").repository;
    expect(() => admin.getSnapshot()).toThrow("(403)");
    expect(() => admin.replyToDiscussion(assigned.courseId, "Jawaban")).toThrow("(403)");
  });

  test("retains live session phase through reads and rejects another course", () => {
    const { repository } = createTutorFixtureData(actor, "populated");
    expect(() => repository.updateLive(outside, "open")).toThrow("(403)");
    repository.updateLive(assigned.courseId, "start");
    expect(repository.getSnapshot().live.phase).toBe("setup");
    repository.updateLive(assigned.courseId, "open");
    expect(repository.getSnapshot().live.phase).toBe("lobby");
    repository.updateLive(assigned.courseId, "start");
    repository.updateLive(assigned.courseId, "next");
    expect(repository.getSnapshot().live).toEqual({ phase: "question", currentQuestion: 1 });
    repository.updateLive(assigned.courseId, "next");
    expect(repository.getSnapshot().live.phase).toBe("result");
  });
});
