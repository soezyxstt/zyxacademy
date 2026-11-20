import { useSearchParams } from "next/navigation";
import { StudentLeaderboardView } from "@/components/student-leaderboard-view";
import { StudentLeaderboardControls } from "@/components/student-leaderboard-controls";
import { StudentAcademicLeaderboardView } from "@/components/student-academic-leaderboard-view";
import { LeaderboardResults } from "@/components/gamification/leaderboard-results";
import type { LeaderboardEntry } from "@/lib/gamification/social-contracts";

const courses = [{ id: "math", title: "Kalkulus I" }, { id: "logic", title: "Berpikir komputasional dan pemecahan masalah" }];
const entry: LeaderboardEntry = {
  publicId: "alya", displayName: "Alya Putri", avatarUrl: null, avatarMode: "photo", avatarBadgeId: null,
  badgeTier: null, equippedFrameId: null, equippedThemeId: null, rankKey: "bupati", baseXpMicro: 4000000, position: 1,
};
const rankings = {
  math: [{ rank: 1, name: "Alya Putri", avgScore: 92, attempts: 8, identity: entry }, { rank: 2, name: "Bima Saputra", avgScore: 87, attempts: 6 }],
  logic: [],
};

export default function LeaderboardFixture() {
  const params = useSearchParams();
  const tab = params.get("tab") === "academic" ? "academic" : "rank";
  const period = params.get("period") === "week" ? "week" : params.get("period") === "month" ? "month" : "all";
  const scope = params.get("scope") === "following" ? "following" : "global";
  const available = params.has("noCourses") ? [] : courses;
  const courseId = available.some((course) => course.id === params.get("course")) ? params.get("course") ?? undefined : undefined;
  const visible = courseId ? available.filter((course) => course.id === courseId) : available;
  return <main className="min-h-screen bg-background text-foreground">
    <StudentLeaderboardView title="Papan peringkat">
      <StudentLeaderboardControls tab={tab} period={period} scope={scope} courseId={courseId} courses={available} locale="id">
        {tab === "rank" ? <LeaderboardResults page={{ entries: params.has("empty") ? [] : [entry], ownEntry: null, nextCursor: null }} period={period} scope={scope} locale="id" basePath="/leaderboard" showFilters={false} />
          : <StudentAcademicLeaderboardView embedded allCourses={visible} leaderboardByCourse={rankings} />}
      </StudentLeaderboardControls>
    </StudentLeaderboardView>
  </main>;
}
