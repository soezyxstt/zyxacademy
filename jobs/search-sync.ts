import { inngest } from "./client";
import { db } from "@/db";
import { searchDocuments } from "@/db/schema";
import { or, and, eq, ne, lt, inArray } from "drizzle-orm";
import { mapConcurrent } from "./vector-sync";

const LEASE_DURATION_MS = 5 * 60 * 1000;
const BATCH_SIZE = process.env.VECTOR_SYNC_BATCH_SIZE
  ? parseInt(process.env.VECTOR_SYNC_BATCH_SIZE, 10)
  : 50;

/**
 * Background worker synchronizing unsynced search documents into Vectorize.
 */
export const syncSearchDocuments = inngest.createFunction(
  {
    id: "sync-search-documents",
    name: "Sync Search Documents",
    triggers: [{ event: "search.documents.sync" }],
    concurrency: {
      limit: 1,
    },
  },
  async ({ step }) => {
    const pending = await step.run("claim-unsynced-search-docs", async () => {
      const workerId = crypto.randomUUID();
      const now = new Date();
      const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

      const candidates = await db
        .select({ id: searchDocuments.id })
        .from(searchDocuments)
        .where(
          or(
            and(eq(searchDocuments.isSynced, false), ne(searchDocuments.syncStatus, "processing")),
            and(eq(searchDocuments.syncStatus, "processing"), lt(searchDocuments.leaseExpiresAt, now))
          )
        )
        .limit(BATCH_SIZE);

      if (candidates.length === 0) return [];

      const candidateIds = candidates.map((d) => d.id);

      await db
        .update(searchDocuments)
        .set({
          syncStatus: "processing",
          leaseId: workerId,
          leaseExpiresAt,
          updatedAt: now,
        })
        .where(
          and(
            inArray(searchDocuments.id, candidateIds),
            or(
              ne(searchDocuments.syncStatus, "processing"),
              lt(searchDocuments.leaseExpiresAt, now)
            )
          )
        );

      return await db
        .select()
        .from(searchDocuments)
        .where(and(inArray(searchDocuments.id, candidateIds), eq(searchDocuments.leaseId, workerId)));
    });

    if (pending.length === 0) {
      return { synced: 0, message: "No unsynced search documents to process." };
    }

    try {
      await step.run("embed-and-upsert-search-docs", async () => {
        const { embedSearchDocument, upsertSearchVectors } = await import("@/lib/search/service");

        const vectors = await mapConcurrent(pending, 5, async (doc) => {
          const textContent = doc.searchableText?.trim() || doc.title;
          const values = await embedSearchDocument(doc.title, textContent);

          let category = "Navigasi";
          if (doc.entityType === "course") {
            category = "Course & Modul";
          } else if (
            doc.entityType === "chapter" ||
            doc.entityType === "material" ||
            doc.entityType === "blog"
          ) {
            category = "Materi & Artikel";
          } else if (doc.entityType === "quiz" || doc.entityType === "exam") {
            category = "Kuis & Evaluasi";
          }

          return {
            id: doc.id,
            values,
            metadata: {
              title: doc.title,
              href: doc.path,
              category,
              entity_type: doc.entityType,
              entity_id: doc.entityId ?? "",
              course_id: doc.courseId ?? "",
              min_role: doc.minRole ?? 0,
            },
          };
        });

        if (vectors.length > 0) {
          await upsertSearchVectors(vectors);
        }
      });

      await step.run("mark-search-docs-synced", async () => {
        const ids = pending.map((doc) => doc.id);
        await db
          .update(searchDocuments)
          .set({
            isSynced: true,
            syncStatus: "completed",
            leaseId: null,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(inArray(searchDocuments.id, ids));
      });

      return { synced: pending.length, message: `Successfully synced ${pending.length} search documents.` };
    } catch (err: any) {
      await step.run("mark-search-docs-failed", async () => {
        const ids = pending.map((doc) => doc.id);
        await db
          .update(searchDocuments)
          .set({
            syncStatus: "failed",
            leaseId: null,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(inArray(searchDocuments.id, ids));
      });
      throw err;
    }
  }
);
