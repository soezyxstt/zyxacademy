import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Server, ServerWebSocket } from "bun";
import type { TutorLiveAction } from "@/packages/academic/tutor-support";
import { assertFixtureRunner, fixtureOrigin } from "./scope";
import { staffRoles } from "./staff-role";

const courseId = staffRoles.tutor.recordId;
const legacyId = courseId + "-legacy";
const templateId = courseId + "-quiz";
const commands: TutorLiveAction[] = ["start", "reveal", "next", "end"];
type SocketData = { roomId: string };
type Question = { prompt: string; options: string[]; correctIndex: number; origin?: string; sourceEventName?: string };

export function createTutorLiveFixture() {
  assertFixtureRunner();
  const secret = randomBytes(32).toString("hex");
  process.env.FEATURE_LIVE = "1";
  process.env.LIVE_HMAC_SECRET = secret;
  process.env.NEXT_PUBLIC_REALTIME_URL = fixtureOrigin;
  let room: { id: string; questions: Question[]; phase: string; index: number } | undefined;
  let owner: string | undefined;
  let socketsOpened = 0;
  let resumedReveal = false;
  let activeRouteReads = 0;
  let exactRoomReads = 0;
  const applied: TutorLiveAction[] = [];
  const sockets = new Set<ServerWebSocket<SocketData>>();

  function sync(ws: ServerWebSocket<SocketData>) {
    if (!room || ws.data.roomId !== room.id) return;
    const question = room.questions[room.index];
    ws.send(JSON.stringify({
      type: "state_sync", sessionState: room.phase, currentQuestionIndex: room.index,
      ...(room.phase === "lobby" && { participantCount: 1 }),
      ...(room.phase === "question" && { ...question, correctIndex: undefined, total: room.questions.length, deadline: Date.now() + 45_000,
        perOptionCounts: room.index === 0 ? [1, 0] : [0, 0], totalAnswered: room.index === 0 ? 1 : 0, totalParticipants: 1 }),
      ...(room.phase === "reveal" && question),
      ...(room.phase === "ended" && { finalBoard: [{ userId: "preview-learner", name: "Murid Preview", rank: 1, score: 100 }] }),
    }));
  }

  function validToken(token: string, sessionId: string) {
    const [payload, mac] = token.split(".");
    if (!payload || !mac || !/^[a-f0-9]{64}$/.test(mac)) return false;
    const expected = createHmac("sha256", secret).update(payload).digest();
    if (!timingSafeEqual(expected, Buffer.from(mac, "hex"))) return false;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return value.userId === owner && value.sessionId === sessionId && value.isHost === true && value.exp > Date.now();
  }

  return {
    async seed(accountId: string) {
      owner = accountId;
      const [{ db }, { aiQuestionBank, courses, mataKuliah, quizTemplates }, { eq }] = await Promise.all([
        import("@/db"), import("@/db/schema"), import("drizzle-orm"),
      ]);
      await db.transaction(async tx => {
        const questionIds = [legacyId + "-q1", legacyId + "-q2"];
        await tx.insert(courses).values({ id: legacyId, title: staffRoles.tutor.recordTitle, category: "Fisika" }).onConflictDoNothing();
        await tx.update(mataKuliah).set({ legacyCourseId: legacyId }).where(eq(mataKuliah.id, courseId));
        await tx.insert(aiQuestionBank).values(questionIds.map((id, index) => ({
          id, courseId: legacyId, prompt: "Soal Live Preview " + (index + 1), options: ["Pilihan A", "Pilihan B"],
          correctIndices: [0], explanation: "Penjelasan soal Live Preview.", reviewStatus: "published" as const,
          ...(index === 0 ? { origin: "historical_reference" as const, sourceEventName: "Seleksi Preview",
            sourceReferenceId: legacyId + "-reference" } : {}),
        }))).onConflictDoNothing();
        await tx.insert(quizTemplates).values({
          id: templateId, title: "Kuis Live Preview", courseId: legacyId, category: "weekly", status: "published",
          selectionRules: { assessmentType: "quiz", questionIds },
        }).onConflictDoNothing();
      });
    },
    recordHostRead(response: Response, exact: boolean) {
      if (!response.ok || !room || room.phase === "ended") return;
      if (exact) exactRoomReads++;
      else activeRouteReads++;
    },
    async verified() {
      if (!room || room.phase !== "ended" || socketsOpened < 3 || activeRouteReads < 1 || exactRoomReads < 1 || !resumedReveal ||
        JSON.stringify(applied) !== JSON.stringify(commands)) return false;
      const [{ db }, { liveQuizSessions }, { eq }] = await Promise.all([import("@/db"), import("@/db/schema"), import("drizzle-orm")]);
      const [row] = await db.select().from(liveQuizSessions).where(eq(liveQuizSessions.id, room.id)).limit(1);
      return row?.state === "ended" && row.tutorId === owner && row.courseId === legacyId && row.templateId === templateId;
    },
    closeSockets() {
      for (const socket of sockets) socket.terminate();
      sockets.clear();
    },
    async worker(request: Request, listener: Server<SocketData>) {
      const url = new URL(request.url);
      const [, id, operation] = /^\/room\/([a-f0-9-]{36})\/(init|control|websocket)$/.exec(url.pathname) ?? [];
      if (!id) return new Response(null, { status: 404 });
      if (operation === "websocket") {
        if (request.method !== "GET" || id !== room?.id || !validToken(url.searchParams.get("token") ?? "", id)) {
          return new Response(null, { status: 403 });
        }
        return listener.upgrade(request, { data: { roomId: id } }) ? undefined : new Response(null, { status: 400 });
      }
      if (request.method !== "POST" || request.headers.get("Authorization") !== "Bearer " + secret) {
        return new Response(null, { status: 403 });
      }
      const body = await request.json() as { action?: TutorLiveAction; sessionId?: string; courseId?: string; questions?: Question[] };
      if (operation === "init" && !room && body.sessionId === id && body.courseId === legacyId && body.questions?.length === 2) {
        room = { id, questions: body.questions, phase: "lobby", index: -1 };
        return Response.json({ ok: true });
      }
      if (operation !== "control" || room?.id !== id || !body.action || body.action !== commands[applied.length]) {
        return new Response(null, { status: 409 });
      }
      applied.push(body.action);
      if (body.action === "start" || body.action === "next") {
        room.index++;
        room.phase = "question";
      } else {
        room.phase = body.action === "reveal" ? "reveal" : "ended";
      }
      for (const ws of sockets) {
        // Force the real app to obtain fresh credentials and recover the reveal.
        if (body.action === "reveal") ws.close(1012, "preview reconnect");
        else sync(ws);
      }
      return Response.json({ ok: true });
    },
    websocket: {
      open(ws: ServerWebSocket<SocketData>) {
        sockets.add(ws);
        socketsOpened++;
        if (room?.phase === "reveal") resumedReveal = true;
        sync(ws);
      },
      close(ws: ServerWebSocket<SocketData>) { sockets.delete(ws); },
      message() {},
    },
  };
}
