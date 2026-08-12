import { describe, expect, test } from "bun:test";
import { parseZyraOperationalEvent } from "@/lib/zyra/ops";

const event = {
  version: "zyra-ops-event-v1",
  eventType: "image_preprocessing",
  actorRole: "murid",
  routeClass: "premium-visual",
  modelClass: "gemini-visual",
  projectFingerprint: "0123456789abcdef",
  courseFingerprint: null,
  resultCode: "SANITIZED",
  latencyBucket: "250ms_1s",
  sizeBucket: "256kb_1mb",
  cacheResult: "bypass",
  attachmentCount: 1,
  sanitizerVersion: "zyra-image-sanitizer-v1",
};

describe("Zyra telemetry privacy contract", () => {
  test("accepts fixed privacy-safe fields", () => expect(parseZyraOperationalEvent(event).attachmentCount).toBe(1));
  test("rejects prompt, response, and unknown fields", () => {
    expect(() => parseZyraOperationalEvent({ ...event, prompt: "secret" })).toThrow();
    expect(() => parseZyraOperationalEvent({ ...event, response: "raw" })).toThrow();
  });
});
