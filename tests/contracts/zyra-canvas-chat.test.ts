import { describe, expect, test } from "bun:test";
import {
  deserializeTutorMessageSources,
  isZyraCanvasFeatureEnabled,
  serializeTutorMessageSources,
} from "@/lib/zyra/canvas";

const source = {
  type: "ko",
  id: "v2:idea:limit:1",
  label: "Definisi limit",
  href: "/courses/kalkulus/material",
};

const canvas = {
  version: "zyra-learning-canvas-v1" as const,
  type: "table" as const,
  title: "Ringkasan limit",
  purpose: "Membandingkan nilai fungsi pada titik yang didekati.",
  variables: [],
  controls: [],
  claimRefs: [source.id],
  altText: "Tabel ringkasan nilai fungsi.",
  fallback: {
    summary: "Nilai fungsi pada beberapa titik.",
    columns: [{ id: "x", label: "x" }, { id: "f", label: "f(x)" }],
    rows: [["1", "2"]],
  },
  rows: [["1", "2"]],
};

describe("Zyra canvas chat persistence", () => {
  test("round-trips a validated canvas with its source citations", () => {
    const serialized = serializeTutorMessageSources([source], canvas);
    const decoded = deserializeTutorMessageSources(serialized);

    expect(decoded.sources).toEqual([source]);
    expect(decoded.canvasSpec).toEqual(canvas);
  });

  test("keeps legacy source arrays compatible", () => {
    const decoded = deserializeTutorMessageSources([source]);

    expect(decoded.sources).toEqual([source]);
    expect(decoded.canvasSpec).toBeUndefined();
  });

  test("does not persist an invalid canvas", () => {
    const serialized = serializeTutorMessageSources([source], {
      ...canvas,
      rows: [],
    });

    expect(serialized).toEqual([source]);
    expect(deserializeTutorMessageSources(serialized).canvasSpec).toBeUndefined();
  });

  test("keeps the public feature flag explicit", () => {
    expect(isZyraCanvasFeatureEnabled("0")).toBe(false);
    expect(isZyraCanvasFeatureEnabled(undefined)).toBe(false);
    expect(isZyraCanvasFeatureEnabled("1")).toBe(true);
  });
});
