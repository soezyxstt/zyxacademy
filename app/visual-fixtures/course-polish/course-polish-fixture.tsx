"use client";

import { CourseDocumentsClient } from "@/app/(student)/courses/[id]/material/course-documents-client";
import { QuizListClient } from "@/app/(student)/courses/[id]/quiz/quiz-list-client";
import { TryoutListClient } from "@/app/(student)/courses/[id]/tryout/tryout-list-client";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { StudentCourseProgressView } from "@/components/course/student-course-progress-view";
import { CourseVideosClient } from "@/components/course/video/course-videos-client";
import type { VideoItem } from "@/app/actions/video-actions";
import type { CourseMaterial } from "@/lib/student-course-fixtures";
import { CoursePolishShell } from "./course-polish-shell";

const courseId = "fixture-math";
const courseTitle = "Matematika I";
const chapters = [{ id: "limit", title: "Limit fungsi", orderIndex: 1, canonicalId: null, legacyChapterId: null }];
const materials: CourseMaterial[] = [
  { id: "limit-intro", courseId, title: "Pengantar limit fungsi", kind: "article", docCategory: "materi", tabGroup: "materi", fileSize: "8 min read", completed: true, isPastYear: false },
  { id: "limit-rules", courseId, title: "Teorema limit dan limit fungsi dengan bentuk tak tentu", kind: "article", docCategory: "materi", tabGroup: "materi", fileSize: "12 min read", completed: false, isPastYear: false, locked: true },
];
const quizDefaults = { category: "chapter", selectionRules: { count: 10 }, timeLimitSeconds: 900, manualStatus: "open", openAt: null, closeAt: null } as const;
const tryoutDefaults = { courseId, type: "tryout", status: "published", settings: { maxAttempts: 2, timeLimitMinutes: 45 }, questions: [], questionCount: 25 } as const;
const timestamp = new Date("2030-01-02T00:00:00Z");
const video: VideoItem = {
  id: "limits", courseId, playlistId: "playlist", chapterId: "limit", chapterTitle: chapters[0].title,
  title: "Pengantar limit dari grafik", description: null, duration: 740, fileSize: null,
  videoUrl: "/fixture.mp4", thumbnailUrl: null, orderIndex: 1, uploadedBy: null,
  createdAt: timestamp, updatedAt: timestamp, locked: false,
};

export function CoursePolishFixture({ section, activityTimestamp }: { section: string; activityTimestamp: string }) {
  return (
    <CoursePolishShell course={{ id: courseId, title: courseTitle }} section={section}>
      <CoursePageShell title={courseTitle}>
        {section === "material" && <CourseDocumentsClient courseId={courseId} courseTitle={courseTitle} materials={materials} chapters={chapters} accessTier="free" lockedMaterialCount={1} />}
        {section === "video" && <CourseVideosClient courseId={courseId} hasFullContentAccess={false} chapters={chapters} initialPlaylists={[
          { id: "playlist", courseId, title: "Limit fungsi", description: null, orderIndex: 1, createdAt: timestamp, updatedAt: timestamp, videos: [
            video,
            { ...video, id: "indeterminate", title: "Bentuk tak tentu pada limit fungsi", orderIndex: 2, locked: true },
          ] },
        ]} />}
        {section === "quiz" && <QuizListClient courseId={courseId} hasFullContentAccess={false} accessTier="free" freeEligibleTemplateIds={["active", "upcoming"]} templates={[
          { ...quizDefaults, id: "active", title: "Latihan limit fungsi dan kontinuitas", visibility: "free" },
          { ...quizDefaults, id: "locked", title: "Latihan lanjutan", visibility: "paid" },
          { ...quizDefaults, id: "upcoming", title: "Kuis limit pekanan", visibility: "free", manualStatus: "scheduled", openAt: new Date("2030-01-03T00:00:00Z") },
        ]} attempts={[{ id: "attempt", templateId: "active", status: "in_progress", score: null }]} />}
        {section === "tryout" && <TryoutListClient courseId={courseId} hasFullContentAccess={false} tryouts={[
          { ...tryoutDefaults, id: "free", title: "Tryout tengah semester", isFree: true, questions: [] },
          { ...tryoutDefaults, id: "locked", title: "Tryout akhir semester", questions: [] },
          { ...tryoutDefaults, id: "upcoming", title: "Tryout pengayaan", isFree: true, questions: [], openAt: new Date("2030-01-03T00:00:00Z") },
        ]} />}
        {section === "progress" && <StudentCourseProgressView courseId={courseId}
          statistics={{ studyTimeMin: 48, completedMaterialsCount: 2, cardsReviewedCount: 12, currentStreakDays: 3 }}
          activities={[{ id: "reading", type: "material_completion", title: "Fungsi dan grafik", timestamp: activityTimestamp }]}
        />}
      </CoursePageShell>
    </CoursePolishShell>
  );
}
