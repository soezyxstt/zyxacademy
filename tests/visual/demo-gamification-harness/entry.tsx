// Actual demo compositions with fictional course context and stubbed server actions.
import { useState } from "react";
import { usePathname } from "next/navigation";
import { DemoAchievements } from "@/components/demo/demo-achievements";
import { DemoLeaderboard } from "@/components/demo/demo-leaderboard";
import { DemoProfile } from "@/components/demo/demo-profile";
import { DemoGroups } from "@/components/demo/demo-groups";
import { DemoGamificationProvider } from "@/components/demo/demo-gamification-provider";
import { StudentExperienceProvider } from "@/components/student-experience-provider";
import { StudentIdentityContent, StudentProfileDialog } from "@/components/gamification/student-identity";
import { useStudentSocial } from "@/components/gamification/social-provider";
import { demoStudentHref } from "@/lib/demo/routes";
import type { StudentIdentity } from "@/lib/gamification/social-contracts";

const courses = [{ id: "math", title: "Kalkulus I" }, { id: "logic", title: "Berpikir komputasional" }];
const baseline = courses.map(course => ({ courseId: course.id, revision: "fixture-v1", course: { completedMaterials: 12 }, history: [{ quizzesCompleted: 8 }] }));
const rankings = { math: [{ rank: 1, name: "Ayu", avgScore: 96, attempts: 8 }, { rank: 2, name: "Bima", avgScore: 89, attempts: 6 }, { rank: 3, name: "Pelajar Demo", studentId: "fictional-demo-student", avgScore: 84, attempts: 5 }], logic: [{ rank: 1, name: "Citra", avgScore: 94, attempts: 7 }] };
function SearchFixture() {
  const social = useStudentSocial();
  const [people, setPeople] = useState<StudentIdentity[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  return <section className="mx-auto max-w-xl space-y-3 p-4"><label htmlFor="people-search">Cari orang</label><input id="people-search" className="w-full rounded-md border bg-background p-2 text-body-sm" onChange={event => { void social.search(event.target.value).then(setPeople); }} /><div className="divide-y rounded-xl border bg-card">{people.map(person => <button key={person.publicId} type="button" className="flex w-full items-center gap-2 p-3" onClick={() => setSelected(person.publicId)}><StudentIdentityContent name={person.displayName} identity={person} /></button>)}</div>{selected && <StudentProfileDialog publicId={selected} open onOpenChange={open => { if (!open) setSelected(null); }} />}</section>;
}
export default function DemoFixture() {
  const pathname = usePathname();
  const view = window.location.pathname.split("/").pop();
  void pathname;
  const href = (path: string) => demoStudentHref("id", path, "math");
  return <StudentExperienceProvider value={{ mode: "demo", href, route: () => href("/dashboard"), courseHref: id => href(`/courses/${id}`), account: { name: "Pelajar Demo", email: "demo@example.test" }, courses, baseline: baseline as any, selectedCourseId: "math", overlay: null, ready: true }}>
    <DemoGamificationProvider name="Pelajar Demo"><main className="min-h-screen bg-background text-foreground">
      {view === "achievements" ? <DemoAchievements /> : view === "profile" ? <DemoProfile profile={null} courseId="math" /> : view === "groups" ? <DemoGroups /> : view === "search" ? <SearchFixture /> : <DemoLeaderboard rankings={rankings} />}
    </main></DemoGamificationProvider>
  </StudentExperienceProvider>;
}
