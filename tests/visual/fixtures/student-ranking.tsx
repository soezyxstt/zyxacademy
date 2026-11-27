import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Trophy } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { StudentCourseLeaderboardContent } from "@/components/course/student-course-leaderboard-content";
import { LeaderboardResults } from "@/components/gamification/leaderboard-results";
import { StudentSocialProvider, type StudentSocialAdapter } from "@/components/gamification/social-provider";
import { MobileChromeProvider } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavbar } from "@/components/navigation/mobile-top-navbar";
import { StudentAcademicLeaderboardView } from "@/components/student-academic-leaderboard-view";
import { StudentLeaderboardControls } from "@/components/student-leaderboard-controls";
import { StudentLeaderboardView } from "@/components/student-leaderboard-view";
import { Reveal } from "@/components/ui/reveal";
import { TabNav } from "@/components/ui/tabs";
import learning from "@/messages/id/learning.json";
import student from "@/messages/id/student.json";
import ui from "@/messages/id/ui.json";
import type { AcademicRanking, LeaderboardPage, PublicStudentProfile } from "@/packages/native-parity/student/community/contracts";
import { courseFixtureRows, coursePodiumIdentities, rankingCourse, rankingEvidence, rankingViewerId } from "@/packages/native-parity/student/community/ranking-fixture";
import { createStudentFixtureRequest } from "@/packages/native-parity/student/fixture-request";

const base = "/api/native/student/community/";
const locale = rankingEvidence.locale;
const courseLabels = learning.leaderboard;

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Ranking fixture returned ${response.status}`);
  return response.json();
}

function CourseBoard({ simulation, unranked }: { simulation: boolean; unranked: boolean }) {
  const path = rankingEvidence.coursePath;
  return <CoursePageShell title={courseLabels.title.replace("{course}", rankingCourse.title)} icon={Trophy}>
    <TabNav tabs={[
      { href: `${path}?type=quiz`, label: courseLabels.quiz, active: !simulation },
      { href: `${path}?type=simulation`, label: courseLabels.tryout, active: simulation },
    ]} />
    <Reveal>
      <StudentCourseLeaderboardContent rankedRows={simulation ? [] : courseFixtureRows}
        userId={unranked ? undefined : rankingViewerId} activeType={simulation ? "simulation" : "quiz"} identities={coursePodiumIdentities} />
    </Reveal>
  </CoursePageShell>;
}

function CombinedBoard({ request }: { request: ReturnType<typeof createStudentFixtureRequest> }) {
  const query = useSearchParams();
  const tab = query.get("tab") === "academic" ? "academic" : "rank";
  const period = query.get("period") === "month" ? "month" : query.get("period") === "week" ? "week" : "all";
  const scope = query.get("scope") === "following" ? "following" : "global";
  const courseId = query.get("course") ?? undefined;
  const rankingPath = tab === "rank"
    ? `participation-ranking?${new URLSearchParams({ period, scope })}`
    : `academic-ranking?${new URLSearchParams(courseId ? { course: courseId } : {})}`;
  const [state, setState] = useState<{ path: string; data: LeaderboardPage | AcademicRanking }>();
  useEffect(() => {
    let active = true;
    void request(base + rankingPath).then(json<LeaderboardPage | AcademicRanking>).then(data => {
      if (active) setState({ path: rankingPath, data });
    });
    return () => { active = false; };
  }, [request, rankingPath]);

  const data = state?.path === rankingPath ? state.data : undefined;
  const academic = data && "boards" in data ? data : undefined;
  return <StudentLeaderboardView title={student.leaderboard.title}>
    <StudentLeaderboardControls tab={tab} locale={locale} period={period} scope={scope} courseId={courseId} courses={academic?.courses ?? []}>
      {data && ("boards" in data ? <StudentAcademicLeaderboardView embedded
        allCourses={data.boards.map(board => board.course)}
        leaderboardByCourse={Object.fromEntries(data.boards.map(board => [board.course.id, board.rows.map(row => ({
          rank: row.rank, name: row.name, avgScore: row.average, attempts: row.attempts, identity: row.identity,
        }))]))} /> : <LeaderboardResults page={data} locale={locale} period={period} scope={scope}
        basePath={rankingEvidence.participationPath} showFilters={false} />)}
    </StudentLeaderboardControls>
  </StudentLeaderboardView>;
}

async function unsupported(): Promise<never> {
  throw new Error("Social writes are outside this read-only visual reference");
}

function Fixture() {
  const pathname = usePathname();
  const query = useSearchParams();
  const course = pathname === rankingEvidence.coursePath;
  const unranked = query.get("scenario") === rankingEvidence.unrankedScenario;
  const scenario = unranked ? rankingEvidence.unrankedScenario : rankingEvidence.scenario;
  const request = useMemo(() => createStudentFixtureRequest(scenario), [scenario]);
  const social = useMemo<StudentSocialAdapter>(() => ({
    profile: async id => {
      const response = await request(`${base}public-profile?${new URLSearchParams({ id })}`);
      return response.status === 404 ? null : json<PublicStudentProfile>(response);
    },
    follow: unsupported, unfollow: unsupported, search: unsupported, list: unsupported, removeFollower: unsupported,
  }), [request]);

  return <NextIntlClientProvider locale={locale} timeZone={rankingEvidence.timeZone} messages={{ learning, student, ui }}>
    <StudentSocialProvider value={social}>
      <MobileChromeProvider>
        <MobileTopNavbar title={course ? rankingCourse.title : student.routeTitles.leaderboard} />
        <main>
          {course ? <CourseBoard simulation={query.get("type") === "simulation"} unranked={unranked} /> : <CombinedBoard request={request} />}
        </main>
      </MobileChromeProvider>
    </StudentSocialProvider>
  </NextIntlClientProvider>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
