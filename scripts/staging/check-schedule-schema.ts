import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL?.trim();
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (!url) {
  console.error("SCHEDULE_SCHEMA_PREFLIGHT_BLOCKED: DATABASE_URL is required");
  process.exit(1);
}

const requiredTables = [
  "tutor_slots",
  "bookings",
  "booking_reschedule_tickets",
  "tutor_slot_notes",
  "group_name_change_audit",
] as const;

const client = createClient({ url, authToken });

try {
  const result = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${requiredTables.map(() => "?").join(",")})`,
    [...requiredTables],
  );
  const found = new Set(
    result.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string"),
  );
  const missing = requiredTables.filter((name) => !found.has(name));

  if (missing.length > 0) {
    console.error(JSON.stringify({
      status: "failed",
      code: "SCHEDULE_SCHEMA_NOT_READY",
      missingTables: missing,
    }));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      status: "passed",
      requiredTables: [...requiredTables],
    }));
  }
} finally {
  client.close();
}
