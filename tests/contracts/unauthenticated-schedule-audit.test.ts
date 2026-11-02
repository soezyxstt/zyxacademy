import { expect, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { recordUnauthenticatedRejectAudit } from "../../lib/schedule/tutor-audit";
import { auditMutasi } from "../../db/schema";

test("rejection audits persist without inventing a foreign-key user", async () => {
  const { client, testDb } = await createPostgresTestDb();
  try {
    await recordUnauthenticatedRejectAudit({
      action: "tutor.ticket.decide", entityType: "reschedule_ticket", entityId: "fixture-ticket",
      courseId: "unknown", requestId: "fixture-request", reason: "FORBIDDEN_NOT_A_TUTOR",
      input: { ticketId: "fixture-ticket" }, executor: testDb,
    });
    const rows = await testDb.select().from(auditMutasi);
    expect(rows).toHaveLength(1);
    expect(rows[0].actorId).toBeNull();
    expect(rows[0].outcome).toBe("rejected");
    expect(rows[0].reason).toBe("FORBIDDEN_NOT_A_TUTOR");
  } finally { await client.close(); }
}, 60_000);
