import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCourseVideosData } from "@/app/actions/video-actions";
import { getConceptExplorerData } from "@/lib/concept-explorer-service";
import { getCourse, getStudentCourseAccess } from "@/lib/course-utils";
import { env } from "@/lib/env";
import { getReviewQueue, submitReview } from "@/lib/flashcard-actions";
import { getCourseLearningSummary } from "@/lib/learning-analytics";
import { DEFAULT_LOCALE, normalizeLocale } from "@/lib/i18n/locale";
import { PKA_COURSE_ID, PKA_SUBJECTS } from "@/lib/pka-config";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { getStudentIdeaMasteryReadModel } from "@/lib/student/idea-mastery-read";
import { getLegacyMasteryReadModel } from "@/lib/student/legacy-mastery-read";
import { acknowledgeNativePkaAnnouncement, readNativePkaLearning } from "@/lib/student/native-pka-learning";
import { courseHref, type CourseLearningView, type LearningData } from "@/packages/native-parity/student/learning/contracts";
import { requireNativeStudent } from "../_session";
import { readNativeStudentJson } from "../_request";

const key = z.string().trim().min(1).max(256).refine((value) => value !== "." && value !== ".." && !/[\/\\\u0000-\u001f]/.test(value));
const localeQuery = { locale: z.string().max(32).optional() };
const querySchema = z.discriminatedUnion("view", [
  z.object({ view: z.enum(["flashcard", "mastery", "path", "playground", "progress", "video", "live"]), courseId: key, ...localeQuery }).strict(),
  z.object({ view: z.literal("concept"), courseId: key, slug: key, ...localeQuery }).strict(),
  z.object({ view: z.enum(["pka-home", "pka-registration", "pka-schedule", "pka-report", "pka-material", "pka-simulation"]), ...localeQuery }).strict(),
  z.object({ view: z.literal("pka-stage"), subject: z.enum(PKA_SUBJECTS), stage: z.enum(["1", "2", "3"]), attemptId: key.optional(), ...localeQuery }).strict(),
]);
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("flashcard-review"), courseId: key, flashcardId: key, grade: z.number().int().min(1).max(4),
    manualAnswer: z.string().max(4000).optional(), isExamMode: z.boolean() }).strict(),
  z.object({ action: z.literal("pka-announcement-read"), announcementId: key }).strict(),
]);

const privateHeaders = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: privateHeaders });
}

async function readCourse(options: {
  view: CourseLearningView;
  courseId: string;
  slug?: string;
  userId: string;
  locale: ReturnType<typeof normalizeLocale>;
}): Promise<LearningData | null> {
  const { view, courseId, slug, userId, locale } = options;
  const course = await getCourse(courseId);
  if (!course) return null;
  const courseTitle = course.title;
  const base = { state: "ready" as const, courseTitle };
  if (view === "live") {
    return { ...base, view, enabled: env.FEATURE_LIVE === "1" && Boolean(env.NEXT_PUBLIC_REALTIME_URL), joinCourseId: course.legacyId ?? courseId };
  }
  if (view === "video") {
    const data = await getCourseVideosData(courseId, { includePlayback: false });
    if (!data) return null;
    return { ...base, view, hasFullContentAccess: data.hasFullContentAccess,
      chapters: data.chapters.map(({ id, title }) => ({ id, title })),
      playlists: data.playlists.map(({ id, title, description, videos }) => ({ id, title, description,
        videos: videos.map(({ id, title, description, chapterId, chapterTitle, thumbnailUrl, duration, locked }) =>
          ({ id, title, description, chapterId, chapterTitle: chapterTitle ?? null, thumbnailUrl, duration, locked: Boolean(locked) })),
      })),
    };
  }
  if (view === "flashcard") {
    const access = await getStudentCourseAccess(userId, courseId);
    if (!access?.policy.capabilities.canReviewFlashcard) return { view, state: "locked", courseTitle };
    const queue = await getReviewQueue(userId, courseId);
    return { ...base, view, cards: queue.map(({ card, dueStatus, priorityReason }) => {
      const difficulty = card.metadata && typeof card.metadata === "object" && "recallDifficulty" in card.metadata
        ? card.metadata.recallDifficulty : null;
      return { id: card.id, front: card.front, back: card.back, explanation: card.explanation ?? null, dueStatus, priorityReason,
        recallDifficulty: typeof difficulty === "string" ? difficulty : null };
    }) };
  }
  const access = await resolveCourseAccess({ courseId, userId });
  if (view === "playground") return access.hasCourseAccess ? { ...base, view } : null;
  if (!access.hasFullContentAccess) return { view, state: "locked", courseTitle };
  switch (view) {
    case "path":
      return { ...base, view };
    case "concept": {
      const concept = slug && await getConceptExplorerData(courseId, slug, userId);
      return concept ? { ...base, view, concept } : null;
    }
    case "mastery": {
      const model = (await getStudentIdeaMasteryReadModel(userId, courseId, locale ?? DEFAULT_LOCALE))
        ?? (await getLegacyMasteryReadModel(userId, course.legacyId ?? courseId));
      return { ...base, view, groups: model?.groups ?? [] };
    }
    case "progress": {
      const { studyStatistics, recentActivities } = await getCourseLearningSummary(courseId, userId);
      return { ...base, view, statistics: studyStatistics, activities: recentActivities };
    }
  }
}

export async function GET(request: Request) {
  const session = await requireNativeStudent(request);
  if (session instanceof Response) return session;
  const url = new URL(request.url);
  const values = Object.fromEntries(url.searchParams);
  if (url.searchParams.size !== Object.keys(values).length) return json({ error: "Invalid learning request" }, 400);
  const parsed = querySchema.safeParse(values);
  if (!parsed.success) return json({ error: "Invalid learning request" }, 400);
  const query = parsed.data;
  try {
    if ("courseId" in query) {
      const data = await readCourse({ ...query, userId: session.userId, locale: normalizeLocale(query.locale) });
      return data ? json(data) : json({ error: "Not found" }, 404);
    }
    const course = await getCourse(PKA_COURSE_ID);
    if (!course) return json({ error: "Not found" }, 404);
    const stage = query.view === "pka-stage"
      ? { subject: query.subject, number: Number(query.stage) as 1 | 2 | 3, attemptId: query.attemptId }
      : undefined;
    const data = await readNativePkaLearning({ view: query.view, userId: session.userId, courseTitle: course.title, stage });
    return data ? json(data) : json({ error: "Not found" }, 404);
  } catch (error) {
    console.error("Native student learning read failed", query.view, error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Learning data unavailable" }, 500);
  }
}

export async function POST(request: Request) {
  const session = await requireNativeStudent(request);
  if (session instanceof Response) return session;
  const parsed = inputSchema.safeParse(await readNativeStudentJson(request).catch(() => null));
  if (!parsed.success) return json({ error: "Invalid learning request" }, 400);
  const input = parsed.data;
  try {
    if (input.action === "pka-announcement-read") {
      const status = await acknowledgeNativePkaAnnouncement(session.userId, input.announcementId);
      if (status === "forbidden") return json({ error: "Forbidden" }, 403);
      if (status === "missing") return json({ error: "Not found" }, 404);
      return json({ success: true });
    }
    const access = await getStudentCourseAccess(session.userId, input.courseId);
    if (!access?.policy.capabilities.canReviewFlashcard) return json({ error: "Forbidden" }, 403);
    const review = await submitReview(session.userId, input.flashcardId, input.grade, input.manualAnswer, input.isExamMode, input.courseId);
    revalidatePath(courseHref(input.courseId, "/flashcard"));
    return json(review);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FLASHCARD_ACCESS_DENIED" || message === "FLASHCARD_NOT_AVAILABLE" || message.startsWith("Flashcard not found")) {
      return json({ error: "Flashcard unavailable" }, 403);
    }
    console.error("Native student learning write failed", input.action, error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Learning operation unavailable" }, 500);
  }
}
