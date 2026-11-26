import { z } from "zod";

/** Hidden, optional metadata appended to an Ops AI answer or returned in the structured followups field. */
export const OPS_FOLLOWUPS_OPEN = "<ops-followups>";
export const OPS_FOLLOWUPS_CLOSE = "</ops-followups>";

export const OPS_FOLLOWUPS_GUIDANCE = `Sertakan blok tersembunyi ${OPS_FOLLOWUPS_OPEN}[...]${OPS_FOLLOWUPS_CLOSE} pada baris paling akhir HANYA jika ada 1 sampai 3 langkah tindak lanjut satu klik yang benar-benar konkret dan dapat langsung dijalankan (misalnya pemeriksaan data lanjutan, drill-down entitas spesifik, atau aksi admin konkret). Setiap item berbentuk objek JSON dengan: "label" singkat (2 sampai 5 kata, maks 48 karakter), "prompt" instruksi lengkap yang dikirim jika diklik (maks 240 karakter), "icon" ("search" | "check" | "compass" | "refresh" | "arrow"), dan opsional "mode" ("ask" | "edit"). JANGAN menyertakan blok ini bila Anda hanya meminta admin mengetik input bebas (seperti nama siswa, email, ID, judul kustom, atau detail form) karena kotak ketik sudah tersedia di bawah. JANGAN menyertakan blok ini bila kartu persetujuan aksi sudah ditampilkan pada respons yang sama. Jangan pernah membocorkan nama token internal (UPPER_SNAKE_CASE) atau UUID mentah pada label maupun prompt.`;

export const OpsFollowupIconSchema = z.enum([
  "search",
  "check",
  "compass",
  "refresh",
  "arrow",
]);

export const OpsFollowupModeSchema = z.enum(["ask", "edit"]);

export const OpsFollowupSchema = z
  .object({
    label: z.string().trim().min(1).max(48),
    prompt: z.string().trim().min(1).max(240),
    icon: OpsFollowupIconSchema.default("arrow"),
    mode: OpsFollowupModeSchema.optional(),
  })
  .strict();

export type OpsFollowupIcon = z.infer<typeof OpsFollowupIconSchema>;
export type OpsFollowupMode = z.infer<typeof OpsFollowupModeSchema>;

export interface OpsFollowup {
  label: string;
  prompt: string;
  icon: OpsFollowupIcon;
  mode?: OpsFollowupMode;
}

const CONTROL_OR_ANGLE_REGEX = /[\u0000-\u001f\u007f<>]/;
const UUID_REGEX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const UPPER_SNAKE_REGEX = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
const LEGACY_QUICK_ACTIONS_REGEX =
  /```(?:quick-actions|actions|quick_actions|options)\s*([\s\S]*?)```/gi;
const MAX_OPS_FOLLOWUPS = 3;
const MAX_METADATA_BYTES = 4096;

function containsLeakedInternalToken(text: string): boolean {
  if (UUID_REGEX.test(text)) return true;
  const matches = text.match(UPPER_SNAKE_REGEX);
  if (!matches) return false;
  return matches.some((token) => token.length > 6);
}

/**
 * Strictly validates Ops AI follow-up chips.
 * Rejects control characters, angle brackets, duplicate labels/prompts,
 * leaked internal tokens (UPPER_SNAKE_CASE > 6 chars or raw UUIDs),
 * and caps the result at 3 items.
 */
export function validateOpsFollowups(value: unknown): OpsFollowup[] {
  if (!Array.isArray(value)) return [];

  const result: OpsFollowup[] = [];
  const seenLabels = new Set<string>();
  const seenPrompts = new Set<string>();

  for (const item of value) {
    if (result.length >= MAX_OPS_FOLLOWUPS) break;

    const parsed = OpsFollowupSchema.safeParse(item);
    if (!parsed.success) continue;

    const { label, prompt, icon, mode } = parsed.data;
    const combined = `${label} ${prompt}`;

    if (CONTROL_OR_ANGLE_REGEX.test(combined)) continue;
    if (containsLeakedInternalToken(combined)) continue;

    const labelKey = label.toLowerCase();
    const promptKey = prompt.toLowerCase();
    if (seenLabels.has(labelKey) || seenPrompts.has(promptKey)) continue;

    seenLabels.add(labelKey);
    seenPrompts.add(promptKey);

    result.push({
      label,
      prompt,
      icon,
      ...(mode ? { mode } : {}),
    });
  }

  return result;
}

/**
 * Incremental streaming parser that buffers possible `<ops-followups>` prefixes
 * so raw delimiter tags never stream into visible text, while collecting and
 * validating structured follow-ups upon finish.
 */
export class OpsFollowupParser {
  private pending = "";
  private metadata = "";
  private hidden = false;
  private overflow = false;

  push(chunk: string): string {
    if (!chunk) return "";
    if (this.hidden) {
      this.collect(chunk);
      return "";
    }

    this.pending += chunk;
    const start = this.pending.indexOf(OPS_FOLLOWUPS_OPEN);
    if (start >= 0) {
      const visible = this.pending.slice(0, start);
      this.hidden = true;
      this.collect(this.pending.slice(start + OPS_FOLLOWUPS_OPEN.length));
      this.pending = "";
      return visible;
    }

    let keep = Math.min(this.pending.length, OPS_FOLLOWUPS_OPEN.length - 1);
    while (keep > 0 && !OPS_FOLLOWUPS_OPEN.startsWith(this.pending.slice(-keep))) {
      keep--;
    }

    const visible = this.pending.slice(0, this.pending.length - keep);
    this.pending = this.pending.slice(this.pending.length - keep);
    return visible;
  }

  private collect(chunk: string): void {
    if (this.metadata.length + chunk.length > MAX_METADATA_BYTES) {
      this.overflow = true;
      this.metadata = "";
    } else if (!this.overflow) {
      this.metadata += chunk;
    }
  }

  finish(): { text: string; followups: OpsFollowup[] } {
    if (!this.hidden) {
      return {
        text: this.pending.length < 2 ? this.pending : "",
        followups: [],
      };
    }

    const end = this.metadata.indexOf(OPS_FOLLOWUPS_CLOSE);
    if (
      this.overflow ||
      end < 0 ||
      this.metadata.slice(end + OPS_FOLLOWUPS_CLOSE.length).trim()
    ) {
      return { text: "", followups: [] };
    }

    try {
      const raw = JSON.parse(this.metadata.slice(0, end));
      return { text: "", followups: validateOpsFollowups(raw) };
    } catch {
      return { text: "", followups: [] };
    }
  }
}

function parseLegacyQuickActionsPayload(rawBody: string): OpsFollowup[] {
  try {
    const parsed = JSON.parse(rawBody.trim());
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed.map((entry) => {
      if (typeof entry === "string") {
        const trimmed = entry.trim();
        return { label: trimmed, prompt: trimmed, icon: "arrow" as const };
      }
      return entry;
    });
    return validateOpsFollowups(normalized);
  } catch {
    return [];
  }
}

/**
 * Parses a completed Ops AI answer, stripping `<ops-followups>...</ops-followups>`
 * and any legacy ```quick-actions [...]``` blocks while returning validated follow-ups.
 */
export function parseOpsFollowups(text: string): {
  text: string;
  followups: OpsFollowup[];
} {
  if (!text) return { text: "", followups: [] };

  const parser = new OpsFollowupParser();
  const visible = parser.push(text);
  const finished = parser.finish();
  let cleaned = visible + finished.text;
  let followups = finished.followups;

  LEGACY_QUICK_ACTIONS_REGEX.lastIndex = 0;
  let legacyMatch: RegExpExecArray | null;
  let legacyFollowups: OpsFollowup[] = [];
  while ((legacyMatch = LEGACY_QUICK_ACTIONS_REGEX.exec(cleaned)) !== null) {
    if (legacyFollowups.length === 0 && legacyMatch[1]) {
      legacyFollowups = parseLegacyQuickActionsPayload(legacyMatch[1]);
    }
  }

  cleaned = cleaned.replace(LEGACY_QUICK_ACTIONS_REGEX, "").trimEnd();
  if (followups.length === 0 && legacyFollowups.length > 0) {
    followups = legacyFollowups;
  }

  return { text: cleaned, followups };
}

/**
 * Strips `<ops-followups>` and legacy `quick-actions` markup from message text.
 */
export function stripOpsFollowupMarkup(text: string): string {
  return parseOpsFollowups(text).text;
}

export function opsFollowupEvent(
  value: unknown
): { type: "data-followups"; followups: OpsFollowup[] } | null {
  const followups = validateOpsFollowups(value);
  return followups.length > 0 ? { type: "data-followups", followups } : null;
}
