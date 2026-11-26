import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import {
  bookings, courses, discussionChannels, discussionMessages, discussionThreads, enrollments, gamificationAccounts,
  gamificationLeaderboardPeriods, gamificationProfiles, groupCourses, groupMembers, groups, mataKuliah, pendaftaranMurid, pengguna,
  penggunaPeran, peran, quizTemplates, session, studentQuizAttempts, tutorSlots, user, weeklyReflections,
} from "../../../../../db/schema";
import { membershipIdFor, PERAN_SEEDS } from "../../../../../lib/auth/peran";
import { calendarDateToJakartaInstant, daysFrom, getCalendarWeekRange, jakartaDay } from "../../../../../lib/date-utils";
import { communityReference as data } from "./community-data";

const database = new URL(process.env.DATABASE_URL ?? "");
if (!["127.0.0.1", "localhost"].includes(database.hostname) || database.pathname !== "/student_evidence") {
  throw new Error("Expected a disposable loopback database for community reference data");
}
const learner = "student-evidence-" + data.learnerSession;
const peer = "student-evidence-" + data.peerSession;
const tutor = "student-evidence-community-tutor";
const canonical = data.course + "-canonical";
const now = new Date();
const expiry = daysFrom(360, now);
const week = getCalendarWeekRange(jakartaDay(now));
const slotDate = jakartaDay(now);
const dayOfWeek = new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "Asia/Jakarta" })
  .format(calendarDateToJakartaInstant(slotDate));
const quizId = data.course + "-quiz";
const quizWindow = { openAt: daysFrom(-1, now), closeAt: daysFrom(1, now) };
const groupId = data.course + "-group";
const slotId = data.course + "-slot";
const channelId = data.course + "-discussions";
const connection = new Client({ connectionString: database.href });
await connection.connect();
try {
  const db = drizzle(connection);
  await db.transaction(async tx => {
    await tx.insert(peran).values([...PERAN_SEEDS]).onConflictDoNothing();
    const accounts = [
      { id: learner, name: data.learner, role: "student", membership: "murid" },
      { id: peer, name: data.peer, role: "student", membership: "murid" },
      { id: tutor, name: data.tutor, role: "teacher", membership: "tutor" },
    ] as const;
    for (const { id, name, role, membership } of accounts) {
      await tx.insert(user).values({ id, name, role, email: id + "@example.invalid", faculty: "FMIPA", major: "Matematika", entryYear: 2025 }).onConflictDoNothing();
      await tx.insert(pengguna).values({ id, status: "active" }).onConflictDoNothing();
      await tx.insert(penggunaPeran).values({ id: membershipIdFor(id, membership), penggunaId: id, peranId: "peran-" + membership, source: "better_auth_user_create" }).onConflictDoNothing();
      if (role === "student") {
        const fields = { token: randomUUID(), expiresAt: expiry };
        await tx.insert(session).values({ id, userId: id, ...fields }).onConflictDoUpdate({ target: session.id, set: fields });
      }
    }
    await tx.insert(courses).values({ id: data.course, title: data.courseTitle, category: "Matematika", description: "Limit, turunan dan integral." }).onConflictDoNothing();
    await tx.insert(mataKuliah).values({ id: canonical, code: "MA-VC-001", title: data.courseTitle, legacyCourseId: data.course }).onConflictDoNothing();
    await tx.insert(enrollments).values({ id: data.course + "-learner", userId: learner, courseId: data.course, expiresAt: expiry }).onConflictDoNothing();
    await tx.insert(pendaftaranMurid).values({ id: data.course + "-learner", penggunaId: learner, mataKuliahId: canonical, endAt: expiry }).onConflictDoNothing();
    await tx.insert(quizTemplates).values({
      id: quizId, courseId: data.course, category: "chapter", title: data.quiz, status: "published", selectionRules: {},
      manualStatus: "open", ...quizWindow,
    }).onConflictDoUpdate({ target: quizTemplates.id, set: quizWindow });
    await tx.insert(studentQuizAttempts).values({
      id: quizId, studentId: learner, templateId: quizId, score: 93, durationSeconds: 180, status: "completed", questionsSnapshot: [], answersSnapshot: {},
    }).onConflictDoNothing();
    await tx.insert(gamificationProfiles).values([
      { userId: learner, publicId: "alya-komunitas-fixture", displayName: data.learner, leaderboardOptIn: true, visibility: "members" },
      { userId: peer, publicId: data.publicId, displayName: data.peer, leaderboardOptIn: true, visibility: "members", showFaculty: true, allowFollows: true },
    ]).onConflictDoNothing();
    await tx.insert(gamificationAccounts).values({ userId: learner, baseXpMicro: 165_000_000, lpBalance: 835, rankKey: "kades" }).onConflictDoNothing();
    await tx.insert(gamificationLeaderboardPeriods).values({ userId: learner, periodKey: "all", baseXpMicro: 165_000_000 }).onConflictDoNothing();
    await tx.insert(weeklyReflections).values({ id: data.course + "-week", studentId: learner, weekStart: week.startIso, payload: {
      completed: { quizzes: 2, flashcards: 21, modules: 4 }, masteryGrowth: 12, mostImproved: "Integral",
      streak: { currentStreak: 3, longestStreak: 5 },
    } }).onConflictDoUpdate({ target: weeklyReflections.id, set: { weekStart: week.startIso } });
    await tx.insert(groups).values({ id: groupId, name: data.group }).onConflictDoNothing();
    await tx.insert(groupCourses).values({ id: groupId, groupId, courseId: data.course }).onConflictDoNothing();
    await tx.insert(groupMembers).values({ id: groupId, groupId, userId: learner, role: "leader" }).onConflictDoNothing();
    await tx.insert(tutorSlots).values({
      id: slotId, tutorId: tutor, dayOfWeek, startTime: "13:00", endTime: "14:30", sessionDate: slotDate, mode: "offline", location: "Ruang belajar",
    }).onConflictDoUpdate({ target: tutorSlots.id, set: { dayOfWeek, sessionDate: slotDate } });
    await tx.insert(bookings).values({
      id: slotId, slotId, studentId: learner, courseId: data.course, groupId, sessionDate: slotDate,
      topic: data.sessionTopic, mode: "offline", location: "Ruang belajar", startTime: "13:00", endTime: "14:30",
    }).onConflictDoUpdate({ target: bookings.id, set: { sessionDate: slotDate } });
    await tx.insert(discussionChannels).values({
      id: channelId, kind: "course", title: data.courseTitle, courseId: canonical, legacyCourseId: data.course, countRevision: 1n,
    }).onConflictDoNothing();
    await tx.insert(discussionThreads).values({ id: data.threadId, channelId, authorId: learner, title: data.threadTitle, nextSeq: 2 }).onConflictDoNothing();
    await tx.insert(discussionMessages).values({
      id: data.threadId + "-question", threadId: data.threadId, authorId: learner, body: data.question,
      kind: "human", messageType: "question", seq: 1, requestId: data.threadId + "-question-request",
    }).onConflictDoNothing();
  });
  console.log("Seeded disposable community reference data.");
} finally {
  await connection.end();
}
