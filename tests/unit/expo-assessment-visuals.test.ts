import { expect, test } from "bun:test";
import { assessmentChoiceText, assessmentMarkdownBlocks, assessmentMedia, assessmentVideo } from "../../apps/mobile-native/features/student/assessment/visual-markdown";
import { reviewQuizQuestion } from "../../lib/student/assessment-projection";

const origin = "https://staging.zyxacademy.com";
const fileRoot = "/api/storage/file/";
const graph = "```desmos\nx^2\n```";
const diagram = "```mermaid\nflowchart LR\nA[Question] --> B[Reason]\n```";
const structured = "```zyx-visual\n" + JSON.stringify({
  id: "signed-widget", kind: "interactive_document", version: 1, label: "Motion",
  description: "A moving point.", documentBytes: 20, documentSha256: "a".repeat(64),
  printBytes: 20, printSha256: "b".repeat(64), height: 320,
  staticFallback: { type: "text", summary: "Static summary", content: "Read the point." },
  printCaption: "Starting point.",
}) + "\n```";

test("moves vetted legacy and V4 visual controls out of assessment answer rows", () => {
  const source = ["Consider the plot", graph, diagram, structured, "Select an answer"].join("\n\n");
  const blocks = assessmentMarkdownBlocks(source);
  expect(blocks.map(block => block.type)).toEqual(["markdown", "function-widget", "diagram", "embedded-visual", "markdown"]);
  const choice = assessmentChoiceText(source, "Visual", "Graph", "Diagram");
  expect(choice).toContain("Consider the plot");
  expect(choice).toContain("Graph");
  expect(choice).toContain("Diagram");
  expect(choice).toContain("Motion");
  expect(choice).not.toContain("documentSha256");
  expect(assessmentMarkdownBlocks("````markdown\n" + structured + "\n````")[0]).toMatchObject({ type: "code" });
});

test("quiz images admit bounded public raster and separate trusted course storage", () => {
  expect(assessmentMedia("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAo", origin)).toMatchObject({ kind: "image" });
  expect(assessmentMedia("/images/worksheet.webp", origin)).toEqual({ kind: "public-image", url: origin + "/images/worksheet.webp" });
  expect(assessmentMedia(fileRoot + "materials/physics/figure.png", origin)).toEqual({ kind: "storage-image", path: fileRoot + "materials/physics/figure.png" });
  expect(assessmentMedia("https://upload.wikimedia.org/example/figure.png?width=500", origin))
    .toEqual({ kind: "public-image", url: "https://upload.wikimedia.org/example/figure.png?width=500" });
  for (const candidate of [
    "https://outside.example/figure.png", "https://upload.wikimedia.org/example/figure.png?token=secret", "https://staging.zyxacademy.com.evil.example/images/figure.png",
    fileRoot + "forms/private/figure.png", fileRoot + "quizzes/private/attachments/figure.png",
    fileRoot + "materials/%2e%2e/private/figure.png", fileRoot + "materials/figure.png?token=private",
    "data:image/svg+xml;base64,PHN2Zy8+",
  ]) expect(assessmentMedia(candidate, origin)).toBeNull();
});

test("released essay review projects only the attachment label and retains authored essay text", () => {
  const file = { fileKey: "quizzes/secret/attachments/raw.pdf", fileName: "answer.pdf", fileSize: "1 KB" };
  const question = { id: "q", prompt: "Explain", question_type: "essay" };
  expect(reviewQuizQuestion(question, { ...file, text: "Evidence" })).toMatchObject({
    selected: "Evidence", attachment: { fileName: "answer.pdf", fileSize: "1 KB" },
  });
  expect(JSON.stringify(reviewQuizQuestion(question, file))).not.toContain(file.fileKey);
  expect(reviewQuizQuestion({ ...question, question_type: "short_answer" }, file).attachment).toBeUndefined();
});

test("authored assessment video embeds reach the existing video player without weakening image or protected storage admission", () => {
  expect(assessmentVideo("https://youtu.be/dQw4w9WgXcQ", origin)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  const stored = fileRoot + "courses/physics/trajectory.mp4";
  expect(assessmentVideo(stored, origin)).toBe(stored);
  expect(assessmentVideo("https://media.school.edu/lab.webm", origin)).toBe("https://media.school.edu/lab.webm");
  expect(assessmentMedia(stored, origin)).toBeNull();
  for (const value of [fileRoot + "forms/private.mp4", stored + "?token=private", "/api/native/private.mp4", "https://youtu.be/invalid"]) {
    expect(assessmentVideo(value, origin)).toBeNull();
  }
});
