import { describe, expect, test } from "bun:test";
import { compareAgendaEvents, getAgendaAssessment, getAgendaStatus } from "@/lib/student/agenda";

const now = new Date("2030-01-01T17:30:00Z");

describe("student agenda", () => {
  test("groups today by WIB and puts expired items in history on the same day", () => {
    expect(getAgendaStatus(new Date("2030-01-02T02:00:00Z"), false, now)).toBe("today");
    const closeAt = new Date("2030-01-01T17:15:00Z");
    expect(getAgendaAssessment({ openAt: null, closeAt }, now)).toEqual({
      date: closeAt,
      timeKind: "deadline",
      status: "past",
    });
  });

  test("shows the next opening before switching to the deadline", () => {
    const openAt = new Date("2030-01-01T18:00:00Z");
    const closeAt = new Date("2030-01-03T01:00:00Z");
    expect(getAgendaAssessment({ openAt, closeAt }, now)).toEqual({
      date: openAt,
      timeKind: "opens",
      status: "today",
    });
    expect(getAgendaAssessment({ openAt, closeAt }, openAt)).toEqual({
      date: closeAt,
      timeKind: "deadline",
      status: "upcoming",
    });
  });

  test("honors manual availability and skips undated assessments", () => {
    const closeAt = new Date("2030-01-01T17:15:00Z");
    const openAt = new Date("2030-01-02T01:00:00Z");
    expect(getAgendaAssessment({ openAt: null, closeAt, manualStatus: "open" }, now)?.status).toBe("today");
    expect(getAgendaAssessment({ openAt, closeAt: null, manualStatus: "closed" }, now)?.status).toBe("past");
    expect(getAgendaAssessment({ openAt: null, closeAt: null }, now)).toBeNull();
  });

  test("orders active dates first and history from newest to oldest", () => {
    const events = [
      { id: "old", dateValue: "2029-12-30T00:00:00Z", status: "past" },
      { id: "later", dateValue: "2030-01-04T00:00:00Z", status: "upcoming" },
      { id: "today", dateValue: "2030-01-02T00:00:00Z", status: "today" },
      { id: "recent", dateValue: "2030-01-01T17:15:00Z", status: "past" },
    ] as const;
    expect([...events].sort(compareAgendaEvents).map(event => event.id)).toEqual(["today", "later", "recent", "old"]);
  });
});
