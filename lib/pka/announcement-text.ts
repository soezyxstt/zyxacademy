import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pkaAnnouncements } from "@/db/schema";
import type { PkaAnnouncementText } from "@/packages/academic/pka-announcement-edit";

export function updatePkaAnnouncementText(id: string, text: PkaAnnouncementText, connection: Pick<typeof db, "update"> = db) {
  return connection.update(pkaAnnouncements).set({ title: text.title, body: text.body }).where(eq(pkaAnnouncements.id, id));
}
