import { describe, expect, test } from "bun:test";
import { operationsCatalog } from "@/lib/admin-mcp/operations-catalog";
import { matchesScheduleFile, readScheduleMultipart, resourceDownloadKey, scopedUploadId } from "@/lib/native/schedule/resource-file";
import { safeScheduleLink, scheduleFilePolicy, scheduleResourcePath, writableSchedulePhase } from "@/packages/native-parity/schedule/resources";

describe("native schedule resources", () => {
  test("only constructs fixed same-booking file delivery paths and safe web links", () => {
    expect(scheduleResourcePath("murid", "booking-1", "resource-1")).toBe("/api/native/schedule/murid/booking-1?download=resource-1");
    expect(scheduleResourcePath("tutor", "booking-1")).toBe("/api/native/schedule/tutor/booking-1");
    expect(scheduleResourcePath("tutor", "booking/../2")).toBeNull();
    expect(scheduleResourcePath("tutor", "booking-1", "../resource-1")).toBeNull();
    expect(safeScheduleLink("https://example.com/notes")).toBe("https://example.com/notes");
    expect(safeScheduleLink("https://username:password@example.com")).toBeNull();
    expect(safeScheduleLink("/api/storage/file/schedules/other/pre_session/file.pdf")).toBeNull();
  });

  test("restricts normalized and legacy object references to the selected booking and phase", () => {
    const key = "schedules/booking-1/pre_session/notes.pdf";
    expect(resourceDownloadKey("booking-1", "pre", key)).toBe(key);
    expect(resourceDownloadKey("booking-1", "pre", `/api/storage/file/${key}`)).toBe(key);
    expect(resourceDownloadKey("booking-1", "pre", `/f/${key}`)).toBe(key);
    expect(resourceDownloadKey("booking-2", "pre", key)).toBeNull();
    expect(resourceDownloadKey("booking-1", "post", key)).toBeNull();
    expect(resourceDownloadKey("booking-1", "pre", `https://outside.invalid/api/storage/file/${key}`)).toBeNull();
    expect(resourceDownloadKey("booking-1", "pre", "/api/storage/file/schedules/booking-1/pre_session/%2E%2E")).toBeNull();
    expect(resourceDownloadKey("booking-1", "pre", "/api/storage/file/schedules/booking-1/pre_session/a%2Fb.pdf")).toBeNull();
  });

  test("reads real multipart within limits and aborts an oversized body without a declared length", async () => {
    const body = new FormData();
    body.set("file", new File(["%PDF-1.7\n"], "notes.pdf", { type: "application/pdf" }));
    body.set("requestId", crypto.randomUUID());
    const multipart = new Request("https://example.com", { method: "POST", body });
    const parsed = await readScheduleMultipart(multipart);
    expect(parsed).toBeInstanceOf(FormData);
    if (!(parsed instanceof FormData)) throw new Error("Missing multipart");
    const file = parsed.get("file") as File;
    expect(file.name).toBe("notes.pdf");
    expect(matchesScheduleFile(new Uint8Array(await file.arrayBuffer()), file.type)).toBe(true);
    expect(matchesScheduleFile(new TextEncoder().encode("<svg/>"), "image/png")).toBe(false);

    const largeBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(scheduleFilePolicy.maxBytes + 64 * 1024 + 1));
        controller.close();
      },
    });
    const overflowing = new Request("https://example.com", {
      method: "POST", body: largeBody, headers: { "Content-Type": "multipart/form-data; boundary=x" },
    });
    expect(await readScheduleMultipart(overflowing)).toBe(413);
  });

  test("repeated upload identity is stable only for the same session, booking and request", () => {
    const id = scopedUploadId("session-a", "booking-a", "request-a");
    expect(scopedUploadId("session-a", "booking-a", "request-a")).toBe(id);
    expect(scopedUploadId("session-b", "booking-a", "request-a")).not.toBe(id);
    expect(scopedUploadId("session-a", "booking-b", "request-a")).not.toBe(id);
    expect(scopedUploadId("session-a", "booking-a", "request-b")).not.toBe(id);
  });

  test("group members can prepare a live booking and the assigned Tutor can publish a summary", () => {
    expect(writableSchedulePhase("murid", "scheduled")).toBe("pre");
    expect(writableSchedulePhase("murid", "rescheduled")).toBe("pre");
    expect(writableSchedulePhase("murid", "completed")).toBeNull();
    expect(writableSchedulePhase("tutor", "scheduled")).toBe("post");
    expect(writableSchedulePhase("tutor", "completed")).toBe("post");
    for (const role of ["murid", "tutor"] as const) expect(writableSchedulePhase(role, "cancelled")).toBeNull();
  });

  test("schedule attachments and summaries remain interactive and grant no MCP tools", () => {
    const entry = operationsCatalog.find(item => item.source === "app/api/native/schedule/[role]/[bookingId]/route.ts");
    expect(entry?.status).toBe("excluded");
    expect(entry?.actions).toEqual(["GET", "POST"]);
    expect(entry?.tools).toEqual([]);
  });
});
