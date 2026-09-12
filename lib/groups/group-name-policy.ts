export const GROUP_NAME_CHANGE_COOLDOWN_DAYS = 30;
export const GROUP_NAME_CHANGE_COOLDOWN_MS =
  GROUP_NAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export type GroupNameChangePolicy = {
  canRename: boolean;
  nextRenameAt: Date | null;
  remainingMs: number;
};

export function getGroupNameChangePolicy(
  lastChangedAt: Date | null | undefined,
  now: Date = new Date(),
): GroupNameChangePolicy {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("INVALID_NOW");
  }

  if (!lastChangedAt) {
    return { canRename: true, nextRenameAt: null, remainingMs: 0 };
  }

  if (Number.isNaN(lastChangedAt.getTime())) {
    throw new RangeError("INVALID_LAST_CHANGED_AT");
  }

  const nextRenameAt = new Date(
    lastChangedAt.getTime() + GROUP_NAME_CHANGE_COOLDOWN_MS,
  );
  const remainingMs = Math.max(0, nextRenameAt.getTime() - now.getTime());

  return {
    canRename: remainingMs === 0,
    nextRenameAt,
    remainingMs,
  };
}

export function normalizeGroupName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validateGroupName(value: string): string | null {
  const normalized = normalizeGroupName(value);

  if (normalized.length < 3) {
    return "Nama kelompok minimal 3 karakter.";
  }

  if (normalized.length > 80) {
    return "Nama kelompok maksimal 80 karakter.";
  }

  return null;
}
