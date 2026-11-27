/**
 * lib/discussions/draft-persistence.ts
 *
 * User-scoped localStorage persistence for unsent discussion question and
 * reply drafts (text, mentions, and reply target) so OS WebView reloads or
 * brief app backgrounding never wipe out in-progress writing.
 */

import {
  readPersistentDraft,
  removePersistentDraft,
  writePersistentDraft,
} from "@/hooks/use-persistent-draft";
import type { ComposerDraft } from "@/components/discussions/composer";
import type { DiscussionMention } from "@/components/discussions/view-model";

import { DISCUSSION_DRAFT_MAX_ENTRIES, DISCUSSION_DRAFT_TTL_MS } from "./draft-policy";

export { DISCUSSION_DRAFT_TTL_MS } from "./draft-policy";

const STORAGE_VERSION = 1;

export interface PersistedDiscussionDraft {
  body: string;
  mentionedPeople: Array<DiscussionMention & { channelId: string }>;
  replyTo?: {
    id: string;
    authorName: string;
    excerpt: string;
    imageOnly?: boolean;
  };
  updatedAt: number;
}

export type PersistedDiscussionDraftMap = Record<string, PersistedDiscussionDraft>;

export function getDiscussionDraftStorageKey(viewerId: string): string {
  return `zyx:discussion-drafts:v${STORAGE_VERSION}:${viewerId}`;
}

function isValidMention(raw: unknown): raw is DiscussionMention & { channelId: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const item = raw as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.name === "string" &&
    typeof item.mention === "string" &&
    (item.role === "student" || item.role === "tutor" || item.role === "admin") &&
    typeof item.channelId === "string"
  );
}

function isValidReplyTo(
  raw: unknown,
): raw is NonNullable<PersistedDiscussionDraft["replyTo"]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const item = raw as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.authorName === "string" &&
    typeof item.excerpt === "string" &&
    (item.imageOnly === undefined || typeof item.imageOnly === "boolean")
  );
}

export function extractPersistableDiscussionDrafts(
  drafts: Record<string, ComposerDraft>,
  now = Date.now(),
): PersistedDiscussionDraftMap {
  const entries: Array<[string, PersistedDiscussionDraft]> = [];

  for (const [key, draft] of Object.entries(drafts)) {
    if (!key || key === "none") continue;
    const hasBody = typeof draft.body === "string" && draft.body.trim().length > 0;
    const hasReplyTo = Boolean(draft.replyTo);
    if (!hasBody && !hasReplyTo) continue;

    entries.push([
      key,
      {
        body: draft.body,
        mentionedPeople: draft.mentionedPeople.filter(isValidMention),
        ...(draft.replyTo && isValidReplyTo(draft.replyTo) ? { replyTo: draft.replyTo } : {}),
        updatedAt: now,
      },
    ]);
  }

  return Object.fromEntries(entries.slice(-DISCUSSION_DRAFT_MAX_ENTRIES));
}

export function validatePersistedDiscussionDrafts(
  raw: unknown,
  now = Date.now(),
): PersistedDiscussionDraftMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const result: PersistedDiscussionDraftMap = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || key === "none" || !value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.body !== "string") continue;
    const updatedAt =
      typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
        ? record.updatedAt
        : now;
    if (now - updatedAt > DISCUSSION_DRAFT_TTL_MS || now - updatedAt < -60_000) {
      continue;
    }

    const replyTo = isValidReplyTo(record.replyTo) ? record.replyTo : undefined;
    if (!record.body.trim() && !replyTo) continue;

    const mentionedPeople = Array.isArray(record.mentionedPeople)
      ? record.mentionedPeople.filter(isValidMention)
      : [];

    result[key] = {
      body: record.body,
      mentionedPeople,
      ...(replyTo ? { replyTo } : {}),
      updatedAt,
    };
  }

  return Object.keys(result).length > 0 ? result : null;
}

export function mergePersistedDiscussionDrafts(
  current: Record<string, ComposerDraft>,
  persisted: PersistedDiscussionDraftMap,
  createEmpty: () => ComposerDraft,
): Record<string, ComposerDraft> {
  let changed = false;
  const next: Record<string, ComposerDraft> = { ...current };

  for (const [key, saved] of Object.entries(persisted)) {
    const existing = next[key];
    // Never overwrite a draft that already has live user edits or restored camera images.
    if (
      existing &&
      (existing.body.trim().length > 0 ||
        existing.images.length > 0 ||
        existing.replyTo !== undefined ||
        existing.sending)
    ) {
      continue;
    }

    const base = existing ?? createEmpty();
    next[key] = {
      ...base,
      body: saved.body,
      mentionedPeople: saved.mentionedPeople,
      replyTo: saved.replyTo,
    };
    changed = true;
  }

  return changed ? next : current;
}

export function loadPersistedDiscussionDrafts(
  viewerId: string,
  now = Date.now(),
): PersistedDiscussionDraftMap | null {
  if (!viewerId) return null;
  const envelope = readPersistentDraft<PersistedDiscussionDraftMap>(
    getDiscussionDraftStorageKey(viewerId),
    STORAGE_VERSION,
    "local",
    (raw) => validatePersistedDiscussionDrafts(raw, now),
  );
  return envelope?.data ?? null;
}

export function savePersistedDiscussionDrafts(
  viewerId: string,
  drafts: Record<string, ComposerDraft>,
  now = Date.now(),
): void {
  if (!viewerId) return;
  const key = getDiscussionDraftStorageKey(viewerId);
  const payload = extractPersistableDiscussionDrafts(drafts, now);
  if (Object.keys(payload).length === 0) {
    removePersistentDraft(key, "local");
    return;
  }
  writePersistentDraft(key, STORAGE_VERSION, payload, "local");
}
