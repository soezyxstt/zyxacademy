import { describe, expect, test } from "bun:test";
import { studentFixturePath } from "../../apps/mobile-native/features/student/fixture-location";
import { matchStudentRoute } from "../../apps/mobile-native/features/student/routes";
import { assessmentApiPath } from "../../packages/native-parity/student/assessment/contract";
import { assessmentFixturePaths, createAssessmentFixtureRequest } from "../../packages/native-parity/student/assessment/fixtures";
import { createCommunityFixtureRequest } from "../../packages/native-parity/student/community/fixtures";
import { createCourseFixtureRequest } from "../../packages/native-parity/student/courses/fixtures";
import { createLearningFixtureRequest } from "../../packages/native-parity/student/learning/fixtures";

const longText = "Jelaskan hubungan koefisien dengan perubahan gradien";

describe("Student smoke fixture behavior", () => {
  test("fixture links preserve flat discussion and catalog selectors after reading the outer URI", () => {
    const discussion = new URL("zyx-native-parity://student-fixture?scenario=loaded&path=/discussions&query_channel=channel-math&query_thread=thread-limit&query_message=message-limit");
    const catalog = new URL("zyx-native-parity://student-fixture?scenario=catalog-parity&path=/courses&query_jurusan=tpb&query_q=no-match");
    expect(matchStudentRoute(studentFixturePath(Object.fromEntries(discussion.searchParams), "loaded"))?.query)
      .toEqual({ channel: "channel-math", thread: "thread-limit", message: "message-limit" });
    expect(matchStudentRoute(studentFixturePath(Object.fromEntries(catalog.searchParams), "catalog-parity"))?.query)
      .toEqual({ jurusan: "tpb", q: "no-match" });
    expect(studentFixturePath({ path: "/courses/matematika-1/quiz/latihan?attemptId=attempt-1" }, "loaded"))
      .toBe("/courses/matematika-1/quiz/latihan?attemptId=attempt-1");
  });

  test("locked assessment gateways deny a player and result paths fail closed", async () => {
    const request = createAssessmentFixtureRequest("locked");
    for (const path of [assessmentFixturePaths.quiz, assessmentFixturePaths.quizPlayer, assessmentFixturePaths.quizReview, assessmentFixturePaths.tryout]) {
      const response = await request(assessmentApiPath(path));
      const data = await response.json();
      expect(response.ok).toBe(true);
      expect(data.assessment.availability).toBe("locked");
      expect(data.player).toBeNull();
      if (data.kind === "quiz-detail") expect(data.review).toBeNull();
    }
    for (const path of [assessmentFixturePaths.quizSummary, assessmentFixturePaths.review, assessmentFixturePaths.summary, assessmentFixturePaths.solutions]) {
      expect((await request(assessmentApiPath(path))).status).toBe(404);
    }
  });

  test("long assessment question reaches players, review, and solution reader", async () => {
    const request = createAssessmentFixtureRequest("long");
    for (const path of [assessmentFixturePaths.quizPlayer, assessmentFixturePaths.quizReview, assessmentFixturePaths.tryout, assessmentFixturePaths.review, assessmentFixturePaths.solutions]) {
      const response = await request(assessmentApiPath(path));
      expect(response.ok).toBe(true);
      expect(JSON.stringify(await response.json())).toContain(longText);
    }
    const started = await request(assessmentApiPath(assessmentFixturePaths.quiz), {
      method: "POST", body: JSON.stringify({ requestId: "smoke-fixture-id" }),
    });
    const receipt = await started.json();
    expect(receipt.attemptId).toBe("native-active-attempt");
    const player = await request(assessmentApiPath(`${assessmentFixturePaths.quiz}?attemptId=${receipt.attemptId}`));
    expect(JSON.stringify(await player.json())).toContain(longText);
  });

  test("quiz gateway reserves distinct attempts and replays each request even at capacity", async () => {
    const request = createAssessmentFixtureRequest("quiz-gateway-new");
    const path = assessmentApiPath(assessmentFixturePaths.quiz);
    const post = (url: string, body: unknown) => request(url, { method: "POST", body: JSON.stringify(body) });
    const start = (requestId: string) => post(path, { requestId });
    const firstKey = "b2ac5a39-1390-43e0-a32c-169488a5d239";
    const secondKey = "163e7e8e-beae-459f-b832-a8a3db725972";
    const thirdKey = "952c0004-7e07-400a-a393-403182ea4277";
    const first = await start(firstKey);
    expect(first.status).toBe(201);
    const firstId: string = (await first.json()).attemptId;
    const detail = async (id?: string) => (await request(id ? `${path}?attemptId=${id}` : path)).json();
    const finish = (id: string) => post(`${path}/attempt/${id}`, { answers: {} });
    const replay = async (key: string, id: string) => {
      const response = await start(key);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ attemptId: id, replayed: true });
    };

    const active = await detail(firstId);
    expect(active.player?.startAt).toBeTruthy();
    expect((await detail(firstId)).player.startAt).toBe(active.player.startAt);
    expect(await (await finish(firstId)).json()).toEqual({ status: "completed", attemptId: firstId });
    expect(await (await finish(firstId)).json()).toEqual({ status: "completed", attemptId: firstId });
    expect(await detail(firstId)).toMatchObject({ player: null, review: { result: { id: firstId }, discussionAvailable: false, items: [] } });
    expect(await detail()).toMatchObject({ assessment: { attempts: 1, maxAttempts: 2 }, history: [{ id: firstId }] });

    const second = await start(secondKey);
    expect(second.status).toBe(201);
    const secondId: string = (await second.json()).attemptId;
    expect(secondId).not.toBe(firstId);
    expect(await detail()).toMatchObject({ assessment: { activeAttemptId: secondId, attempts: 2 } });
    expect(await detail(secondId)).toMatchObject({ player: { questions: expect.any(Array) }, review: null });
    await replay(firstKey, firstId);
    await replay(secondKey, secondId);
    expect((await start(thirdKey)).status).toBe(409);
    expect(await (await finish(secondId)).json()).toEqual({ status: "completed", attemptId: secondId });
    await replay(secondKey, secondId);
    expect((await start(thirdKey)).status).toBe(409);
    expect(await detail()).toMatchObject({ assessment: { attempts: 2 }, history: [{ id: secondId }, { id: firstId }] });
    expect(await detail(secondId)).toMatchObject({ player: null, review: { result: { id: secondId }, discussionAvailable: false, items: [] } });
    expect((await finish("unknown-attempt")).status).toBe(404);

    const exhausted = createAssessmentFixtureRequest("quiz-gateway-exhausted");
    expect((await exhausted(path, { method: "POST", body: JSON.stringify({ requestId: firstKey }) })).status).toBe(409);
  });

  test("offline assessment remains unavailable after a read retry", async () => {
    const request = createAssessmentFixtureRequest("offline");
    const path = assessmentApiPath(assessmentFixturePaths.quiz);
    await expect(request(path)).rejects.toThrow("Fixture network unavailable");
    await expect(request(path)).rejects.toThrow("Fixture network unavailable");
  });

  test("enrollment revocation occurs during the protected material read", async () => {
    const request = createCourseFixtureRequest("revoked");
    const base = "/api/native/student/courses?courseId=matematika-1&view=";
    const list = await (await request(`${base}material-list`)).json();
    expect(list.course.hasFullContentAccess).toBe(true);
    expect(list.materials.find((row: { id: string }) => row.id === "catatan-fungsi").locked).toBe(false);
    const detail = await (await request(`${base}material-detail&materialId=catatan-fungsi`)).json();
    expect(detail.material.locked).toBe(true);
    expect(detail.course.hasFullContentAccess).toBe(false);
  });

  test("community failures are surfaced without assuming delivery", async () => {
    const request = createCommunityFixtureRequest("unavailable");
    await expect(request("/api/native/student/community/feedback", { method: "POST", body: "{}" })).rejects.toThrow("Network request failed");
    expect((await request("/api/native/student/community/feedback", { method: "POST", body: "{}" })).ok).toBe(true);
  });

  test("empty learning fixtures expose distinct empty states", async () => {
    const request = createLearningFixtureRequest("empty");
    const path = "/api/native/student/learning?courseId=matematika-1&view=";
    const concept = await (await request(`${path}concept&slug=limit`)).json();
    expect(concept.concept.kosByType).toEqual({});
    expect(concept.concept.prerequisites).toEqual([]);
    expect((await (await request(`${path}video`)).json()).playlists).toEqual([]);
    expect((await (await request(`${path}live`)).json()).enabled).toBe(false);
    expect((await (await request("/api/student/study-path?courseId=matematika-1")).json()).steps).toEqual([]);
  });
});
