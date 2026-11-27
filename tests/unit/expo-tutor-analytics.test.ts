import { expect, test } from "bun:test";
import { createAcademicClient, type AcademicTransport } from "@/apps/mobile-native/features/academic/client";

test("Tutor refresh posts to the authorized web route and rereads the exact course snapshot", async () => {
  const updates: Parameters<NonNullable<AcademicTransport["command"]>>[] = [];
  const reads: string[] = [];
  const signal = new AbortController().signal;
  const snapshot = {
    courseTitle: "Biologi", enrolledCount: 10, activeCount: 8, weakConcepts: [], allConcepts: [], interventionCounts: [],
    quizParticipationPct: 40, watchlist: [{ studentId: "signed-member", name: "Nadia", decliningConcepts: [], activeInterventionCount: 0, lastActiveAt: null }],
    topMisconceptions: [{ misconceptionKoId: "mis-a", label: "Definisi", conceptName: "Konsep", pctSelected: 20, sampleSize: 5 }],
    conceptTrends: { Example: [{ week: "W1", avgMastery: 20 }, { week: "W2", avgMastery: 30 }] },
    mostMissed: { Example: [{ id: "question", prompt: "Prompt", correctRate: 0.2 }] },
  };
  const transport: AcademicTransport = {
    accountId: "tutor", origin: "https://staging.example.test", locale: "en",
    async get(path, actualSignal) {
      expect(actualSignal).toBe(signal);
      reads.push(path);
      return Response.json(snapshot);
    },
    async command(...input) { updates.push(input); return Response.json({ updatedAt: "2026-11-25T00:00:00.000Z" }); },
  };
  const { tutor } = createAcademicClient(transport);
  await tutor.refreshAnalytics?.("course&id", "request-1", signal);
  expect(updates).toEqual([["/api/tutor/analytics/refresh?courseId=course%26id", { method: "POST", body: {}, requestId: "request-1" }, signal]]);
  expect(await tutor.analytics?.("course&id", signal)).toEqual(snapshot);
  expect(reads).toEqual(["/api/native/academic/tutor/courses/course%26id/analytics"]);
  expect(createAcademicClient({ ...transport, command: undefined }).tutor.refreshAnalytics).toBeUndefined();
});

test("Tutor refresh surfaces a scope failure without retrying the write", async () => {
  let attempts = 0;
  const { tutor } = createAcademicClient({
    accountId: "tutor", origin: "https://staging.example.test", locale: "id",
    async get() { throw new Error("denied refresh must stop before reads"); },
    async command() { attempts++; return Response.json({ error: "Forbidden" }, { status: 403 }); },
  });
  await expect(tutor.refreshAnalytics?.("unassigned", "request-1", new AbortController().signal)).rejects.toHaveProperty("status", 403);
  expect(attempts).toBe(1);
});
