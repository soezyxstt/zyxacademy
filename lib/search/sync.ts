/**
 * Asynchronous search document synchronization helpers.
 */

import { after } from "next/server";
import { embedSearchDocument, upsertSearchVectors, deleteSearchVectors } from "@/lib/search/service";
import type { RoleLevel, SearchCategory } from "@/lib/search/contracts";

export interface SearchDocumentMutationInput {
  id: string;
  title: string;
  content: string;
  subtitle?: string;
  href: string;
  category: SearchCategory | string;
  entity_type: string;
  entity_id: string;
  course_id?: string | null;
  min_role?: RoleLevel;
  keywords?: string;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Embeds and upserts a single search document to Vectorize.
 */
export async function syncSingleSearchDocument(doc: SearchDocumentMutationInput): Promise<void> {
  const textContent = doc.content?.trim() || doc.title;
  const values = await embedSearchDocument(doc.title, textContent);

  await upsertSearchVectors([
    {
      id: doc.id,
      values,
      metadata: {
        title: doc.title,
        subtitle: doc.subtitle ?? "",
        href: doc.href,
        category: doc.category,
        entity_type: doc.entity_type,
        entity_id: doc.entity_id,
        course_id: doc.course_id ?? "",
        min_role: doc.min_role ?? 0,
        keywords: doc.keywords ?? "",
        ...(doc.metadata || {}),
      },
    },
  ]);
}

/**
 * Schedules asynchronous embedding and upsert of a search document using Next.js after()
 * without blocking the HTTP request lifecycle.
 */
export function syncSearchDocumentMutation(doc: SearchDocumentMutationInput): void {
  const task = async () => {
    try {
      await syncSingleSearchDocument(doc);
    } catch (error) {
      console.error(`[search-sync] Failed to sync search document ${doc.id}:`, error);
    }
  };

  try {
    after(task);
  } catch {
    // If after() is not available (e.g. outside request lifecycle or during background script), run floating task
    void task();
  }
}

/**
 * Schedules asynchronous deletion of a search document from Vectorize using Next.js after().
 */
export function syncSearchDocumentDeletion(id: string): void {
  const task = async () => {
    try {
      await deleteSearchVectors([id]);
    } catch (error) {
      console.error(`[search-sync] Failed to delete search document vector ${id}:`, error);
    }
  };

  try {
    after(task);
  } catch {
    void task();
  }
}
