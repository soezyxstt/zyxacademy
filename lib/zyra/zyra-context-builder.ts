/**
 * Zyra Multi-Layer Context Builder
 *
 * PRODUCTION ARCHITECTURE NOTE:
 * `askTutorRag` in `lib/tutor-rag.ts` is the primary production owner for Tier 1 grounded RAG,
 * student-free KV caching, and AI query action classification.
 * `buildZyraContext` serves as the multi-layer context aggregator (conversation, course, learning,
 * mastery, and retrieval memories) for extended Zyra chat interface sessions while enforcing
 * strict token budgets per layer.
 */

import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { chatSessions, tutorChatMessages } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  getConversationMemory,
} from "./conversation-memory";
import {
  getCourseMemory,
} from "./course-memory";
import {
  getLearningMemory,
} from "./learning-memory";
import {
  getMasteryMemory,
} from "./mastery-memory";
import {
  getRetrievalMemory,
} from "./retrieval-memory";
import type {
  ZyraContext,
  ContextBudget,
} from "./memory-layers";

export interface ZyraContextBuilderInput {
  studentId: string;
  courseId: string;
  question: string;
  sessionId?: string | null;
  chapterId?: string | null;
}

const DEFAULT_MAX_TOKENS = 12000;

const TOKEN_BUDGET = {
  currentQuestion: 500,
  retrievalMemory: 3000,
  conversationMemory: 2500,
  courseMemory: 1000,
  masteryMemory: 2000,
  learningMemory: 1500,
} as const;

export async function buildZyraContext(
  input: ZyraContextBuilderInput
): Promise<ZyraContext> {
  const { studentId, courseId, question, sessionId, chapterId } = input;

  const [
    conversationMemory,
    courseMemory,
    learningMemory,
    masteryMemory,
    retrievalMemory,
  ] = await Promise.all([
    getConversationMemory({
      studentId,
      courseId,
      sessionId: sessionId ?? null,
      limit: 20,
    }),
    getCourseMemory({ studentId, courseId }),
    getLearningMemory({ studentId, courseId, limit: 10 }),
    getMasteryMemory({ studentId, courseId }),
    getRetrievalMemory({ courseId, chapterId: chapterId ?? null, question }),
  ]);

  const budget = calculateBudget(question, retrievalMemory);

  return {
    conversationMemory,
    courseMemory,
    learningMemory,
    masteryMemory,
    retrievalMemory,
    budget,
    metadata: {
      builtAt: new Date(),
      studentId,
      courseId,
      sessionId: sessionId ?? null,
    },
  };
}

function calculateBudget(
  question: string,
  retrievalMemory: { sources: Array<{ label: string }> }
): ContextBudget {
  const questionTokens = estimateTokens(question);

  const allocated = {
    currentQuestion: Math.min(questionTokens, TOKEN_BUDGET.currentQuestion),
    retrievalMemory: Math.min(retrievalMemory.sources.length * 500, TOKEN_BUDGET.retrievalMemory),
    conversationMemory: TOKEN_BUDGET.conversationMemory,
    courseMemory: TOKEN_BUDGET.courseMemory,
    masteryMemory: TOKEN_BUDGET.masteryMemory,
    learningMemory: TOKEN_BUDGET.learningMemory,
  };

  const totalAllocated = Object.values(allocated).reduce((a, b) => a + b, 0);
  const remaining = Math.max(0, DEFAULT_MAX_TOKENS - totalAllocated);

  return {
    maxTokens: DEFAULT_MAX_TOKENS,
    allocated,
    remaining,
  };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function createChatSession(
  studentId: string,
  courseId: string,
  title: string
): Promise<string> {
  const sessionId = randomUUID();
  await db.insert(chatSessions).values({
    id: sessionId,
    studentId,
    courseId,
    title,
    startedAt: new Date(),
    lastMessageAt: new Date(),
  });
  return sessionId;
}

export async function getOrCreateChatSession(
  studentId: string,
  courseId: string,
  title: string
): Promise<string> {
  const [existing] = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.studentId, studentId),
        eq(chatSessions.courseId, courseId)
      )
    )
    .orderBy(desc(chatSessions.lastMessageAt))
    .limit(1);

  if (existing) {
    await db
      .update(chatSessions)
      .set({ lastMessageAt: new Date() })
      .where(eq(chatSessions.id, existing.id));
    return existing.id;
  }

  return createChatSession(studentId, courseId, title);
}

export async function getRecentSessions(
  studentId: string,
  courseId: string,
  limit = 10
) {
  return db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.studentId, studentId),
        eq(chatSessions.courseId, courseId)
      )
    )
    .orderBy(desc(chatSessions.lastMessageAt))
    .limit(limit);
}

export async function getSessionMessages(
  sessionId: string,
  limit = 100
) {
  return db
    .select()
    .from(tutorChatMessages)
    .where(eq(tutorChatMessages.sessionId, sessionId))
    .orderBy(desc(tutorChatMessages.createdAt))
    .limit(limit);
}