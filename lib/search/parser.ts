import type { ParsedSearchQuery, SearchPrefixType } from "@/lib/search/contracts";

interface PrefixDefinition {
  type: SearchPrefixType;
  entityType: string;
  label: string;
  aliases: string[];
}

const PREFIX_DEFINITIONS: PrefixDefinition[] = [
  {
    type: "group",
    entityType: "group",
    label: "Kelompok Belajar",
    aliases: ["group", "grup", "kelompok"],
  },
  {
    type: "meet",
    entityType: "meet",
    label: "Google Meet & Sesi",
    aliases: ["meet", "meeting", "sesi"],
  },
  {
    type: "user",
    entityType: "user",
    label: "Akun Pengguna",
    aliases: ["user", "pengguna", "murid", "tutor", "admin"],
  },
  {
    type: "form",
    entityType: "form",
    label: "Formulir",
    aliases: ["form", "formulir"],
  },
  {
    type: "token",
    entityType: "token",
    label: "Token Aktivasi",
    aliases: ["token", "voucher"],
  },
  {
    type: "schedule",
    entityType: "schedule",
    label: "Jadwal & Agenda",
    aliases: ["schedule", "jadwal", "agenda"],
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

  const matchedDef = PREFIX_DEFINITIONS.find((def) =>
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
