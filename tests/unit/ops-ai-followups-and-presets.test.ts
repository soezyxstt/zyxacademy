import { afterEach, describe, expect, it } from "bun:test";
import {
  OPS_FOLLOWUPS_CLOSE,
  OPS_FOLLOWUPS_OPEN,
  OpsFollowupParser,
  parseOpsFollowups,
  validateOpsFollowups,
} from "@/lib/admin-ops-ai/followups";
import {
  createOpsAiRuntimeResponse,
} from "@/lib/admin-ops-ai/runtime";
import { setOpsAiModelStreamMock } from "@/lib/admin-ops-ai/model-factory";
import { consumeOpsAiStream } from "@/components/admin/ops-ai/use-ops-ai-chat";
import {
  resolveDynamicOpsPresets,
} from "@/components/admin/ops-ai/ops-ai-presets";

describe("Ops AI deterministic follow-ups parser and validator", () => {
  afterEach(() => {
    setOpsAiModelStreamMock(null);
  });

  it("strips <ops-followups> incrementally across split chunks and returns validated chips", () => {
    const parser = new OpsFollowupParser();
    const chunks = [
      "Ringkasan formulir aktif sudah siap.\n\n<ops-",
      "followups>[{\"label\":\"Cek respons terbaru\",\"prompt\":\"Ringkas respons formulir terbaru\",\"icon\":\"search\",\"mode\":\"ask\"},",
      "{\"label\":\"Buat formulir baru\",\"prompt\":\"Siapkan formulir pendaftaran baru\",\"icon\":\"arrow\",\"mode\":\"edit\"}]</ops-",
      "followups>",
    ];

    let visible = "";
    for (const chunk of chunks) {
      visible += parser.push(chunk);
    }
    const tail = parser.finish();
    const fullVisible = visible + tail.text;

    expect(fullVisible).toBe("Ringkasan formulir aktif sudah siap.\n\n");
    expect(fullVisible).not.toContain(OPS_FOLLOWUPS_OPEN);
    expect(fullVisible).not.toContain(OPS_FOLLOWUPS_CLOSE);
    expect(tail.followups).toEqual([
      {
        label: "Cek respons terbaru",
        prompt: "Ringkas respons formulir terbaru",
        icon: "search",
        mode: "ask",
      },
      {
        label: "Buat formulir baru",
        prompt: "Siapkan formulir pendaftaran baru",
        icon: "arrow",
        mode: "edit",
      },
    ]);
  });

  it("rejects control chars, angle brackets, duplicates, leaked internal tokens, raw UUIDs, and excess items", () => {
    const validated = validateOpsFollowups([
      { label: "Valid satu", prompt: "Cek status job aktif", icon: "search" },
      { label: "valid satu", prompt: "Prompt beda tapi label duplikat", icon: "arrow" },
      { label: "Label beda", prompt: "cek status job aktif", icon: "arrow" },
      { label: "Bad <tag>", prompt: "Cek data", icon: "arrow" },
      { label: "Control\nchar", prompt: "Cek data lain", icon: "arrow" },
      {
        label: "Leaked token",
        prompt: "Gunakan INTERNAL_ADMIN_TOKEN untuk membuka akses",
        icon: "check",
      },
      {
        label: "Leaked UUID",
        prompt: "Periksa user 550e8400-e29b-41d4-a716-446655440000 sekarang",
        icon: "check",
      },
      { label: "Valid dua", prompt: "Ringkas aktivitas tutor 24 jam terakhir" },
      { label: "Valid tiga", prompt: "Cek siswa dengan status pending terbaru", icon: "compass", mode: "ask" },
      { label: "Excess empat", prompt: "Item keempat harus ditolak karena batas 3", icon: "refresh" },
    ]);

    expect(validated).toEqual([
      { label: "Valid satu", prompt: "Cek status job aktif", icon: "search" },
      { label: "Valid dua", prompt: "Ringkas aktivitas tutor 24 jam terakhir", icon: "arrow" },
      { label: "Valid tiga", prompt: "Cek siswa dengan status pending terbaru", icon: "compass", mode: "ask" },
    ]);
  });

  it("strips legacy ```quick-actions``` blocks and converts valid items safely", () => {
    const legacy = [
      "Berikut 2 mata kuliah yang ditemukan.",
      "",
      "```quick-actions",
      '["Audit Matematika 1A", "Cek kuis Matematika 1A"]',
      "```",
    ].join("\n");

    const parsed = parseOpsFollowups(legacy);
    expect(parsed.text).toBe("Berikut 2 mata kuliah yang ditemukan.");
    expect(parsed.followups).toEqual([
      { label: "Audit Matematika 1A", prompt: "Audit Matematika 1A", icon: "arrow" },
      { label: "Cek kuis Matematika 1A", prompt: "Cek kuis Matematika 1A", icon: "arrow" },
    ]);

    const malformed = "Teks utama.\n\n```quick-actions\n{not-valid-json}\n```";
    const parsedMalformed = parseOpsFollowups(malformed);
    expect(parsedMalformed.text).toBe("Teks utama.");
    expect(parsedMalformed.followups).toEqual([]);
  });

  it("streams clean text and emits validated data-followups over SSE in runtime + consumer", async () => {
    setOpsAiModelStreamMock(async function* () {
      yield { type: "text-delta", textDelta: "Status sistem normal.\n\n<ops-" };
      yield {
        type: "text-delta",
        textDelta:
          'followups>[{"label":"Cek job aktif","prompt":"Periksa status job latar belakang terbaru","icon":"search","mode":"ask"}]</ops-followups>',
      };
      yield { type: "finish", finishReason: "stop" };
    });

    const response = createOpsAiRuntimeResponse({
      messages: [{ role: "user", content: "Cek status sistem" }],
    });

    expect(response.body).not.toBeNull();
    const parts = [];
    for await (const part of consumeOpsAiStream(response.body!)) {
      parts.push(part);
    }

    const visibleText = parts
      .filter((p) => p.type === "text-delta")
      .map((p) => (p.type === "text-delta" ? p.textDelta : ""))
      .join("");
    expect(visibleText).toBe("Status sistem normal.\n\n");
    expect(visibleText).not.toContain("<ops-followups>");

    const followupEvents = parts.filter((p) => p.type === "data-followups");
    expect(followupEvents).toHaveLength(1);
    expect(followupEvents[0]).toEqual({
      type: "data-followups",
      followups: [
        {
          label: "Cek job aktif",
          prompt: "Periksa status job latar belakang terbaru",
          icon: "search",
          mode: "ask",
        },
      ],
    });
  });
});

describe("Dynamic deterministic Ops AI presets", () => {
  const routes = [
    "/admin/forms",
    "/admin/courses/matematika-1a",
    "/admin/courses/matematika-1a/materials",
    "/admin/courses/matematika-1a/quizzes",
    "/admin/ops/tutor-activity",
    "/admin/ops/ai-analytics",
    "/admin/users",
    "/admin/tokens",
    "/admin/groups",
    "/admin/schedules",
    "/admin/blog",
    "/admin/analytics",
    "/admin/ops",
    "/admin",
  ];

  it("produces deterministic 3 to 6 presets per route and mode with no em/en dashes or vague prompts", () => {
    for (const pathname of routes) {
      for (const mode of ["ask", "edit"] as const) {
        const first = resolveDynamicOpsPresets({ pathname, mode, hasMessages: false });
        const second = resolveDynamicOpsPresets({ pathname, mode, hasMessages: false });

        expect(first).toEqual(second);
        expect(first.presets.length).toBeGreaterThanOrEqual(3);
        expect(first.presets.length).toBeLessThanOrEqual(6);

        for (const preset of first.presets) {
          expect(preset.label).not.toMatch(/[—–!]/);
          expect(preset.prompt).not.toMatch(/[—–!]/);
          expect(preset.prompt.toLowerCase()).not.toContain("tanyakan nama");
          expect(preset.prompt.toLowerCase()).not.toContain("tanyakan mata kuliah");
          expect(preset.prompt.toLowerCase()).not.toContain("tanyakan mana yang");
        }
      }
    }
  });

  it("tailors presets to exact course slug and separates ask vs edit modes", () => {
    const courseAsk = resolveDynamicOpsPresets({
      pathname: "/admin/courses/matematika-1a",
      mode: "ask",
    });
    const courseEdit = resolveDynamicOpsPresets({
      pathname: "/admin/courses/matematika-1a",
      mode: "edit",
    });

    expect(courseAsk.entitySlug).toBe("matematika-1a");
    expect(courseAsk.presets.every((p) => p.category === "ask")).toBe(true);
    expect(courseAsk.presets[0].prompt).toContain("matematika-1a");

    expect(courseEdit.entitySlug).toBe("matematika-1a");
    expect(courseEdit.presets.some((p) => p.category === "action")).toBe(true);
    expect(courseEdit.presets[0].prompt).toContain("matematika-1a");
    expect(courseAsk.presets.map((p) => p.id)).not.toEqual(
      courseEdit.presets.map((p) => p.id)
    );
  });

  it("tailors presets for /admin/forms, /admin/ops/tutor-activity, and /admin/users", () => {
    const formsAsk = resolveDynamicOpsPresets({ pathname: "/admin/forms", mode: "ask" });
    const formsEdit = resolveDynamicOpsPresets({ pathname: "/admin/forms", mode: "edit" });
    expect(formsAsk.routeKey).toBe("forms");
    expect(formsAsk.presets.every((p) => p.category === "ask")).toBe(true);
    expect(formsEdit.presets.some((p) => p.id === "forms-edit-create")).toBe(true);

    const tutorAsk = resolveDynamicOpsPresets({
      pathname: "/admin/ops/tutor-activity",
      mode: "ask",
    });
    expect(tutorAsk.routeKey).toBe("ops-tutor-activity");
    expect(tutorAsk.presets[0].label).toContain("24 jam terakhir");

    const usersAsk = resolveDynamicOpsPresets({ pathname: "/admin/users", mode: "ask" });
    const usersEdit = resolveDynamicOpsPresets({ pathname: "/admin/users", mode: "edit" });
    expect(usersAsk.routeKey).toBe("users");
    expect(usersAsk.presets[0].prompt).toContain("pending");
    expect(usersEdit.presets.some((p) => p.category === "action")).toBe(true);
  });
});
