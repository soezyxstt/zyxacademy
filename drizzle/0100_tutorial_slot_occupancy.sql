DROP INDEX `bookings_slot_id_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_occupied_slot_unique_idx` ON `bookings` (`slot_id`) WHERE "bookings"."status" <> 'cancelled';