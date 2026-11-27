import { expect, test } from "bun:test";
import { courseVideoSource } from "../../packages/course-video/source";

const origin = "https://academy.example.test";
test("uses the existing YouTube IDs and supported links in the embedded player", () => {
  for (const raw of ["youtube/abcdefghijk", "https://youtu.be/abcdefghijk?t=4", "https://m.youtube.com/watch?v=abcdefghijk"]) {
    expect(courseVideoSource(raw, origin)).toEqual({ kind: "youtube", id: "abcdefghijk" });
  }
  expect(courseVideoSource("https://www.youtube.com/watch?v=unknown", origin)).toBeNull();
});

test("only the canonical first-party storage path receives an authenticated request", () => {
  const path = "/api/storage/file/course%20one/lesson.mp4?rev=2";
  for (const value of [path, origin + path]) expect(courseVideoSource(value, origin)).toEqual({ kind: "storage", path });
  const signed = "https://cdn.example.test/course.mp4?sig=abc";
  expect(courseVideoSource(signed, origin)).toEqual({ kind: "stream", uri: signed });
  const remote = "https://cdn.example.test" + path;
  expect(courseVideoSource(remote, origin)).toEqual({ kind: "stream", uri: remote });
});

test("rejects invalid schemes, credentials and ambiguous storage path segments", () => {
  for (const value of [null, "", "file:///course.mp4", "http://example.test/video", "//other.test/video.mp4",
    "https://viewer:pass@example.test/video.mp4", "/api/storage/file/", "/api/storage/file/a%2fb",
    "/api/storage/file/%00", "/api/storage/file/f%5cc", "/api/storage/file/%2e/x", "/api/auth/session",
    "/api/storage/file/one#fragment", "/other/../api/storage/file/a"]) expect(courseVideoSource(value, origin)).toBeNull();
});
