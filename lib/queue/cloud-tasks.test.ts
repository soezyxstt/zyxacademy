import { expect, test } from "bun:test";
import { enqueueTask, prepareTask } from "./cloud-tasks";

test("worker environment, PDF queue, delay and stable retry identity", () => {
  const event = { name: "source.pdf.page.requested", data: { pageNumber: 1 }, id: "page-one", delaySeconds: 15 };
  const { task, parent } = prepareTask(event, "staging", 0);
  expect(parent.endsWith("/zyx-staging-pdf")).toBe(true);
  expect(task.scheduleTime).toBe("1970-01-01T00:00:15.000Z");
  expect(task.name).toBe(prepareTask(event, "staging", 500).task.name);
  expect(task.name).not.toBe(prepareTask(event, "production").task.name);
  expect(task.httpRequest.url.startsWith(task.httpRequest.oidcToken.audience + "/internal/tasks/")).toBe(true);
});

test("mastery coalesces only the same student and target in one bucket", () => {
  const event = { name: "mastery/recompute.requested", data: { studentId: "student", courseId: "course" } };
  const { task } = prepareTask(event, "staging", 0);
  expect(task.name).toBe(prepareTask(event, "staging", 29_999).task.name);
  expect(task.name).not.toBe(prepareTask(event, "staging", 30_000).task.name);
  expect(task.name).not.toBe(prepareTask({ ...event, data: { ...event.data, courseId: "other" } }, "staging", 0).task.name);
});

test("test process exits before loading credentials even with Cloud Tasks selected", async () => {
  const before = process.env.QUEUE_PROVIDER;
  try {
    process.env.QUEUE_PROVIDER = "cloud-tasks";
    expect(await enqueueTask({ name: "test.event", data: {}, id: "offline" })).toBe("offline");
  } finally {
    if (before === undefined) delete process.env.QUEUE_PROVIDER;
    else process.env.QUEUE_PROVIDER = before;
  }
});
