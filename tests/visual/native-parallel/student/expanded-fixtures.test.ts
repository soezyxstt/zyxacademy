import { describe, expect, test } from "bun:test";
import { assessmentApiPath } from "../../../../packages/native-parity/student/assessment/contract";
import { assessmentFixturePaths, createAssessmentFixtureRequest } from "../../../../packages/native-parity/student/assessment/fixtures";
import { createCommunityFixtureRequest } from "../../../../packages/native-parity/student/community/fixtures";
import { createCourseFixtureRequest } from "../../../../packages/native-parity/student/courses/fixtures";
import { createLearningFixtureRequest } from "../../../../packages/native-parity/student/learning/fixtures";

const longText = "Jelaskan hubungan koefisien dengan perubahan gradien";

describe("Student smoke fixture behavior", () => {
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
