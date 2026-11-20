import { expect, test } from "bun:test";
import { demoCourseChannel, demoDiscussionSeed, demoGeneralChannel } from "@/lib/demo/discussion-seed";
import { emptyDemoDiscussion, readDemoDiscussion } from "@/lib/demo/discussion-state";
import { demoProfile } from "@/lib/demo/gamification";
import { fictionalDemoSnapshot, publicDemoCourseTitles } from "@/lib/demo/fictional-snapshot";
import { demoReflections } from "@/lib/demo/reflections";

const courses = publicDemoCourseTitles.map((title, index) => ({ id: `fictional-${index}`, title }));

test("seeded questions have course scope, real reply targets and consistent fictional identities", () => {
  const viewer = { id: "demo-self", name: "Pelajar Demo", role: "student" as const };
  const threads = demoDiscussionSeed(courses, "2026-11-05", viewer);
  expect(threads.filter(thread => thread.channelId === demoGeneralChannel)).toHaveLength(2);
  for (const course of courses) expect(threads.filter(thread => thread.channelId === demoCourseChannel(course.id))).toHaveLength(course.title === "Fisika Dasar I" || course.title === "Berpikir Komputasional" ? 3 : 2);
  expect(new Set(threads.map(thread => thread.id)).size).toBe(threads.length);
  expect(threads.some(thread => thread.resolved)).toBe(true);
  expect(threads.some(thread => thread.messages.length === 1 && !thread.resolved)).toBe(true);
  for (const thread of threads) {
    expect(thread.messages[0].messageType).toBe("question");
    thread.messages.forEach((message, index) => {
      if (message.replyTo) expect(thread.messages.slice(0, index).some(post => post.id === message.replyTo)).toBe(true);
      if (message.author.role === "student" && message.author.id !== viewer.id) {
        expect(demoProfile(message.author.id, [])?.displayName).toBe(message.author.name);
      }
    });
  }
});

test("local discussion drafts round-trip through the store and malformed data restores the seed", () => {
  const state = emptyDemoDiscussion();
  state.posts.push({ id: "post", threadId: "thread", body: "Bagaimana kalau penyebutnya nol?", messageType: "answer", createdAt: "2026-11-20T10:00:00.000Z", mentions: [] });
  expect(readDemoDiscussion(JSON.stringify(state))).toEqual(state);
  expect(readDemoDiscussion('{"posts":[{"body":42}]}')).toEqual(emptyDemoDiscussion());
});

test("weekly reflections sum activity across courses without including the incomplete week", () => {
  const snapshots = courses.map(course => fictionalDemoSnapshot(course.id, course.title));
  const reflections = demoReflections(snapshots);
  expect(reflections[0].weekStart).toBe("2026-10-26");
  expect(reflections[0].payload.completed.modules).toBe(
    snapshots.flatMap(snapshot => snapshot.history).filter(day => day.date >= "2026-10-26" && day.date <= "2026-11-01").reduce((sum, day) => sum + day.materialsCompleted, 0),
  );
  expect(reflections[0].payload.streak.currentStreak).toBe(2);
});
