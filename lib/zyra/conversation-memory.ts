import { db } from "@/db";
import { tutorChatMessages } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { deserializeTutorMessageSources } from "./canvas/chat";
import type { ConversationMemory, TutorSource } from "./memory-layers";

const DEFAULT_MESSAGE_LIMIT = 20;

export interface ConversationMemoryInput {
  studentId: string;
  courseId: string;
  sessionId: string | null;
  limit?: number;
}

export async function getConversationMemory(
  input: ConversationMemoryInput
): Promise<ConversationMemory> {
  const { studentId, courseId, sessionId, limit = DEFAULT_MESSAGE_LIMIT } = input;

  const whereConditions = [
    eq(tutorChatMessages.studentId, studentId),
    eq(tutorChatMessages.courseId, courseId),
  ];

  if (sessionId) {
    whereConditions.push(eq(tutorChatMessages.sessionId, sessionId));
  }

  const messages = await db
    .select()
    .from(tutorChatMessages)
    .where(and(...whereConditions))
    .orderBy(desc(tutorChatMessages.createdAt))
    .limit(limit);

  const reversed = messages.reverse();
  const activeTopic = reversed.length > 0 ? extractTopic(reversed) : null;

  return {
    recentMessages: reversed.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sources: deserializeTutorMessageSources(m.sources).sources.filter((source): source is TutorSource =>
        ["chapter", "ko", "question", "practice_question", "past_exam"].includes(source.type)),
      createdAt: m.createdAt,
    })),
    activeTopic,
    sessionId: input.sessionId,
    messageCount: messages.length,
  };
}

function extractTopic(messages: Array<{ role: string; content: string }>): string | null {
  const studentMessages = messages.filter((m) => m.role === "student");
  if (studentMessages.length === 0) return null;

  const lastStudentMessage = studentMessages[studentMessages.length - 1];
  return lastStudentMessage.content.slice(0, 100);
}