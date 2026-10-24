import type { ParsedSearchQuery, SearchPrefixType } from "@/lib/search/contracts";

export interface SearchPrefixDefinition {
  type: SearchPrefixType;
  entityType: string;
  label: string;
  aliases: string[];
  example: string;
}

export const SEARCH_PREFIX_DEFINITIONS: SearchPrefixDefinition[] = [
  {
    type: "group",
    entityType: "group",
    label: "Kelompok Belajar",
    aliases: ["group", "groups", "studygroup", "grup", "kelompok"],
    example: "group: kimia",
  },
  {
    type: "meet",
    entityType: "meet",
    label: "Google Meet & Sesi",
    aliases: ["meet", "meeting", "session", "sessions", "sesi"],
    example: "meet: kalkulus",
  },
  {
    type: "user",
    entityType: "user",
    label: "Akun Pengguna",
    aliases: ["user", "users", "account", "student", "students", "pengguna", "murid", "tutor", "admin"],
    example: "user: nama atau email",
  },
  {
    type: "form",
    entityType: "form",
    label: "Formulir",
    aliases: ["form", "forms", "formulir"],
    example: "form: evaluasi",
  },
  {
    type: "token",
    entityType: "token",
    label: "Token Aktivasi",
    aliases: ["token", "tokens", "voucher", "vouchers"],
    example: "token: Zyx-XXXXXXXX-5-1",
  },
  {
    type: "schedule",
    entityType: "schedule",
    label: "Jadwal & Agenda",
    aliases: ["schedule", "schedules", "calendar", "agenda", "jadwal"],
    example: "schedule: UTS",
  },
];

/**
 * Parses a raw search query to detect any administrative prefix (e.g., group:, meet:, user:).
 * Returns the parsed query with clean query text and scope metadata.
 */
export function parseSearchQueryString(raw: string): ParsedSearchQuery {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      rawQuery: "",
      cleanQuery: "",
      isScoped: false,
    };
  }

  // Match prefix syntax: e.g. "group:kimia", "grup: kimia asik", "user: adi"
  const prefixMatch = trimmed.match(/^([a-zA-Z]+):\s*(.*)$/);
  if (!prefixMatch) {
    return {
      rawQuery: trimmed,
      cleanQuery: trimmed,
      isScoped: false,
    };
  }

  const [, rawPrefix, restQuery] = prefixMatch;
  const normalizedPrefix = rawPrefix.toLowerCase();

  const matchedDef = SEARCH_PREFIX_DEFINITIONS.find((def) =>
    def.aliases.includes(normalizedPrefix)
  );

  if (!matchedDef) {
    // If not a recognized prefix, treat as regular query
    return {
      rawQuery: trimmed,
      cleanQuery: trimmed,
      isScoped: false,
    };
  }

  const cleanQuery = restQuery.trim();

  return {
    rawQuery: trimmed,
    cleanQuery,
    isScoped: true,
    prefixType: matchedDef.type,
    entityType: matchedDef.entityType,
    prefixLabel: matchedDef.label,
  };
}
