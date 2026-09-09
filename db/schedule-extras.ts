import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { groups, tutorSlots, user } from "@/db/schema";

/**
 * Tutor-authored context that belongs to availability itself, before a student
 * books the slot. Keep this separate from booking notes, which belong to a
 * concrete tutorial session.
 */
export const tutorSlotNotes = sqliteTable("tutor_slot_notes", {
  slotId: text("slot_id")
    .primaryKey()
    .references(() => tutorSlots.id, { onDelete: "cascade" }),
  notes: text("notes").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Immutable history used to enforce the 30-day student group-name cooldown.
 * The cooldown is checked against the latest row for the group on every write.
 */
export const groupNameChangeAudit = sqliteTable(
  "group_name_change_audit",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    changedById: text("changed_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    oldName: text("old_name").notNull(),
    newName: text("new_name").notNull(),
    changedAt: integer("changed_at", { mode: "timestamp" }).defaultNow().notNull(),
  },
  (table) => [
    index("group_name_change_group_time_idx").on(table.groupId, table.changedAt),
    index("group_name_change_actor_idx").on(table.changedById),
  ],
);
