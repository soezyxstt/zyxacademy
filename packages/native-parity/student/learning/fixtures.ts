import { learningApi, learningLiveJoinApi, learningRouteViews, liveHostPattern, PKA_PATH, type Flashcard, type LearningData, type LearningView, type PkaSchedule, type StudyPathData } from "./contracts";

export type LearningFixtureScenario = "enrolled" | "empty" | "no-enrollment" | "revoked" | "offline" | "long";
type FixtureRequest = (path: string, init?: RequestInit) => Promise<Response>;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const sampleCourse = "Kalkulus Dasar";
const pkaTitle = "Tutorial PKA";
const longTitle = "Limit fungsi aljabar dengan pendekatan tabel nilai dan pembuktian hubungan antara pembilang dan penyebut";
const schedule: PkaSchedule = { id: "session-1", title: "Pembahasan fungsi limit", sessionAt: "2026-07-21T08:00:00.000Z", isPast: true, meetLink: null };
const upcoming: PkaSchedule = { id: "session-2", title: "Latihan Matematika terarah", sessionAt: "2026-07-22T08:00:00.000Z", isPast: false, meetLink: "https://meet.google.com/abc-defg-hij" };
const card: Flashcard = { id: "card-1", front: "Kapan lim x → a f(x) ada?", back: "Ketika limit dari kiri dan kanan sama.",
  explanation: "Nilai fungsi di a dapat berbeda dari limitnya.", dueStatus: "new", priorityReason: "new", recallDifficulty: "beginner" };
const simulation = { id: "pka-fixture-quiz", title: "Matematika, tahap satu", timeLimitSeconds: 1800, stage: { subject: "matematika", number: 1 } } as const;

function payload(view: LearningView, url: URL, scenario: LearningFixtureScenario, removedAnnouncements: Set<string>, reviewedCards: Set<string>): LearningData | null {
  const pka = view.startsWith("pka-");
  const courseTitle = pka ? pkaTitle : sampleCourse;
  const enrolled = scenario !== "no-enrollment" && scenario !== "revoked";
  const empty = scenario === "empty";
  const title = scenario === "long" ? longTitle : "Limit fungsi";
  const ready = { state: "ready" as const, courseTitle };
  if (pka && view === "pka-registration") return enrolled ? { view, state: "redirect", path: PKA_PATH } : { ...ready, view };
  if (pka && !enrolled) return { view: view as Extract<LearningData, { state: "redirect" }>["view"], state: "redirect", path: `${PKA_PATH}/daftar` };
  if (!enrolled && view !== "live" && view !== "video" && view !== "playground") return { view, state: "locked", courseTitle };
  switch (view) {
    case "concept": {
      const slug = url.searchParams.get("slug");
      if (!slug || slug === "missing") return null;
      return { ...ready, view, concept: { conceptId: slug, canonicalSlug: slug, conceptName: title, masteryScore: empty ? null : 56,
        prerequisites: empty ? [] : [{ conceptName: "Fungsi real", slug: "fungsi" }], unlocks: [], related: [],
        kosByType: empty ? {} : { definition: [{ id: "definition-1", title, content: "Limit menjelaskan nilai yang didekati fungsi saat masukan mendekati suatu titik.\n\nNilai fungsi di titik itu tidak menentukan limit." }] } } };
    }
    case "flashcard": return { ...ready, view, cards: empty ? [] : [card, { ...card, id: "card-2", front: scenario === "long" ? longTitle : "Apa makna limit dari kiri?", back: "Nilai yang didekati dari masukan yang lebih kecil." }]
      .filter((item) => !reviewedCards.has(item.id)) };
    case "mastery": return { ...ready, view, groups: empty ? [] : [{ chapter: { id: "chapter-1", title: "Fungsi dan limit", orderIndex: 1 },
      concepts: [{ conceptName: title, conceptSlug: "limit", masteryScore: 56, confidence: 72, trend: "improving", blockedBy: ["Fungsi real"] },
        { conceptName: "Limit sepihak", conceptSlug: "sepihak", masteryScore: null, confidence: null, trend: null, blockedBy: [] }] }] };
    case "path": return { ...ready, view };
    case "playground": return scenario === "revoked" ? null : { ...ready, view };
    case "progress": return { ...ready, view, statistics: empty ? null : { studyTimeMin: 35, completedMaterialsCount: 2, cardsReviewedCount: 12, currentStreakDays: 3 },
      activities: empty ? [] : [{ id: "event-1", type: "material_completion", title: "Menyelesaikan dokumen", timestamp: "2026-07-20T07:00:00.000Z", description: title }] };
    case "video": return { ...ready, view, hasFullContentAccess: enrolled, chapters: empty ? [] : [{ id: "chapter-1", title: "Fungsi dan limit" }], playlists: empty ? [] : [{ id: "playlist-1", title: "Pembahasan limit", description: null,
      videos: [{ id: "video-1", title, description: "Pendekatan numerik dengan tabel.", chapterId: "chapter-1", chapterTitle: "Fungsi dan limit", thumbnailUrl: null, duration: 411, locked: !enrolled }] }] };
    case "live": return { ...ready, view, enabled: !empty, joinCourseId: url.searchParams.get("courseId") ?? "matematika-1" };
    case "pka-home": return { ...ready, view, testDate: "2026-07-23T00:00:00+07:00", nextSession: empty ? null : upcoming,
      announcements: empty ? [] : [{ id: "ann-1", title: "Mulai dari simulasi awal", body: "Pilih Matematika, Fisika, atau Kimia untuk memeriksa kesiapan awal.", isPinned: true, createdAt: "2026-07-20T07:00:00.000Z" },
        { id: "ann-2", title: scenario === "long" ? longTitle : "Materi sesi terbaru", body: "Latihan limit dapat dibaca sebelum sesi berikutnya.", isPinned: false, createdAt: "2026-07-21T07:00:00.000Z" }]
        .filter((item) => !removedAnnouncements.has(item.id)), simulationCount: empty ? 0 : 2, completedCount: empty ? 0 : 1, bestScore: empty ? 0 : 75 };
    case "pka-schedule": return { ...ready, view, schedules: empty ? [] : [schedule, upcoming] };
    case "pka-report": return { ...ready, view, results: [
      { subject: "matematika", status: empty ? "not_attempted" : "solid", attempted: !empty, passedAtStage: empty ? null : 1, bestScore: empty ? null : 75, message: "" },
      { subject: "fisika", status: "not_attempted", attempted: false, passedAtStage: null, bestScore: null, message: "" },
      { subject: "kimia", status: "not_attempted", attempted: false, passedAtStage: null, bestScore: null, message: "" },
    ] };
    case "pka-material": return { ...ready, view };
    case "pka-simulation": return { ...ready, view, hasFullContentAccess: true, templates: empty ? [] : [simulation], attempts: [] };
    case "pka-stage": {
      const stage = Number(url.searchParams.get("stage")) as 1 | 2 | 3;
      const attemptId = url.searchParams.get("attemptId");
      if (![1, 2, 3].includes(stage) || !["matematika", "fisika", "kimia"].includes(url.searchParams.get("subject") ?? "")) return null;
      if (attemptId && !["pka-attempt-complete", "pka-attempt-draft"].includes(attemptId)) return null;
      return { ...ready, view, template: simulation, stage: { stage, bestScore: null, passed: null, attemptId: null, quizTemplateId: simulation.id,
        passScoreThreshold: 70, status: stage > 1 ? "locked" : "unlocked" },
        attempt: !attemptId || stage > 1 ? null : { id: attemptId, templateId: simulation.id, status: attemptId === "pka-attempt-complete" ? "completed" : "in_progress", score: attemptId === "pka-attempt-complete" ? 75 : null } };
    }
  }
  return null;
}

function scenarioPath(courseId: string): StudyPathData {
  return { dayPlan: null, steps: [
    { stepId: "step-1", ideaId: "idea-1", chapterId: "chapter-1", chapterTitle: "Fungsi dan limit", chapterOrder: 1, conceptName: "Limit fungsi", status: "available",
      actions: { moduleHref: `/courses/${encodeURIComponent(courseId)}/material/pengantar` }, estimatedMinutes: 8, prerequisites: [], priorityReason: "Perlu diulang" },
    { stepId: "step-2", ideaId: "idea-2", chapterId: "chapter-1", chapterTitle: "Fungsi dan limit", chapterOrder: 1, conceptName: "Kekontinuan", status: "locked",
      actions: {}, estimatedMinutes: 12, prerequisites: ["Limit fungsi"], priorityReason: "Prasyarat" },
  ] };
}

export function createLearningFixtureRequest(scenario: LearningFixtureScenario = "enrolled"): FixtureRequest {
  const removedAnnouncements = new Set<string>();
  const reviewedCards = new Set<string>();
  const failedReads = new Set<string>();
  return async (path, init) => {
    if (init?.signal?.aborted) throw new Error("Request aborted");
    if (scenario === "offline" && !failedReads.has(path)) {
      failedReads.add(path);
      throw new TypeError("Network request failed");
    }
    const url = new URL(path, "https://student.fixture.invalid");
    const fail = (status = 404) => json({ error: "Unavailable" }, status);
    if (url.pathname === learningApi) {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}"));
        if (scenario === "revoked" || scenario === "no-enrollment") return fail(403);
        if (body.action === "pka-announcement-read" && body.announcementId === "ann-2") {
          removedAnnouncements.add(body.announcementId);
          return json({ success: true });
        }
        if (body.action === "flashcard-review" && ["card-1", "card-2"].includes(body.flashcardId) && [1, 2, 3, 4].includes(body.grade)) {
          reviewedCards.add(body.flashcardId);
          return json({ nextReviewDue: "2026-07-24T07:00:00.000Z", nextIntervalDays: 3, nextBox: 2 });
        }
        return fail(400);
      }
      const view = url.searchParams.get("view") as LearningView;
      const data = payload(view, url, scenario, removedAnnouncements, reviewedCards);
      return data ? json(data) : fail();
    }
    if (url.pathname === "/api/student/study-path") {
      if (scenario === "revoked" || scenario === "no-enrollment") return fail(403);
      if (scenario === "empty") return json({ steps: [], dayPlan: null });
      const data = scenarioPath(url.searchParams.get("courseId") ?? "matematika-1");
      return json(url.searchParams.has("days") ? { ...data, dayPlan: [{ day: 1, steps: data.steps.slice(0, 1), totalMinutes: 8 }] } : data);
    }
    if (url.pathname === learningLiveJoinApi) return fail(scenario === "revoked" ? 403 : 404);
    if (url.pathname === "/api/videos/video-1/playback-url") {
      if (scenario === "revoked" || scenario === "no-enrollment") return fail(403);
      return json({ url: "https://student.fixture.invalid/video-1.mp4", fallbackUrl: null, isPresigned: true, expiresIn: 300 });
    }
    return fail();
  };
}

export const learningFixtureCases = [
  ...Object.keys(learningRouteViews), liveHostPattern,
].flatMap((pattern, index) => {
  const path = pattern.replace("[id]", "matematika-1").replace("[slug]", "limit").replace("[materialId]", "pengantar")
    .replace("[subject]", "matematika").replace("[stage]", "1");
  const primary: LearningFixtureScenario = pattern.endsWith("/daftar") ? "no-enrollment" : "enrolled";
  const alternative: LearningFixtureScenario = pattern.startsWith(PKA_PATH) ? "no-enrollment" : "empty";
  return ([primary, alternative === primary ? "enrolled" : alternative, "offline"] as const).map((scenario, state) => ({
    id: `student-learning-${index + 1}-${state + 1}`, component: "LearningScreen", pattern, path, scenario,
    theme: state === 2 ? "dark" as const : "light" as const,
  }));
});
