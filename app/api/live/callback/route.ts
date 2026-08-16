/**
 * POST /api/live/callback ; called by the Durable Object on session end.
 * Writes live_quiz_results rows, learning_events, and triggers mastery recompute.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { liveQuizSessions, liveQuizResults } from "@/db/schema";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";
import { recordLearningEvents } from "@/lib/learning-events";
import { inngest } from "@/lib/inngest";

interface LeaderboardEntry {
 userId: string;
 name: string;
 score: number;
 rank: number;
}

interface AnswerEntry {
 choice: number;
 receivedTs: number;
}

interface Question {
 prompt: string;
 options: string[];
 correctIndex: number;
}

interface CallbackBody {
 sessionId: string;
 courseId: string;
 leaderboard: LeaderboardEntry[];
 answersByQuestion: Record<number, Record<string, AnswerEntry>>;
 questions: Question[];
}

export async function POST(req: NextRequest) {
 const auth = req.headers.get("Authorization");
 if (!auth || auth !== `Bearer ${env.LIVE_HMAC_SECRET ?? ""}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const body = (await req.json()) as CallbackBody;
 const { sessionId, courseId, leaderboard, answersByQuestion, questions } = body;

 // Mark session as ended
 await db
 .update(liveQuizSessions)
 .set({ state: "ended", endedAt: new Date(), participantCount: leaderboard.length })
 .where(eq(liveQuizSessions.id, sessionId));

 // Write per-student result rows
 const resultRows = leaderboard.map((entry) => {
 const answersForStudent: Array<{
 questionIndex: number;
 choice: number;
 correct: boolean;
 }> = [];

 for (const [qiStr, answers] of Object.entries(answersByQuestion)) {
 const qi = Number(qiStr);
 const answer = answers[entry.userId];
 if (!answer) continue;
 const correct = questions[qi]?.correctIndex === answer.choice;
 answersForStudent.push({ questionIndex: qi, choice: answer.choice, correct });
 }

 return {
 id: randomUUID(),
 sessionId,
 studentId: entry.userId,
 courseId,
 score: entry.score,
 rank: entry.rank,
 answersSnapshot: answersForStudent,
 };
 });

 if (resultRows.length > 0) {
 await db.insert(liveQuizResults).values(resultRows).onConflictDoNothing();
 }

 // Write learning_events (one per answer) ; drives mastery recompute
 const learningEventInputs = leaderboard.flatMap((entry) => {
 const events: Parameters<typeof recordLearningEvents>[0] = [];
 for (const [qiStr, answers] of Object.entries(answersByQuestion)) {
 const qi = Number(qiStr);
 const answer = answers[entry.userId];
 if (!answer) continue;
 const q = questions[qi];
 if (!q) continue;
 const correct = q.correctIndex === answer.choice;
 events.push({
 studentId: entry.userId,
 courseId,
 eventType: "quiz_answer",
 correctness: correct ? 1 : 0,
 weight: 1,
 });
 }
 return events;
 });

 if (learningEventInputs.length > 0) {
 await recordLearningEvents(learningEventInputs);
 }

 // Fire mastery recompute for each distinct student
 {
 const studentIds = [...new Set(leaderboard.map((e) => e.userId))];
 await Promise.allSettled(
 studentIds.map((studentId) =>
 inngest.send({
 name: "mastery/recompute",
 data: { studentId, courseId },
 })
 )
 );
 }

 return NextResponse.json({ ok: true });
}
