CREATE TABLE `payment_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_order_id` text NOT NULL,
	`user_id` text NOT NULL,
	`product_code` text NOT NULL,
	`product_name` text NOT NULL,
	`product_description` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`persons` integer NOT NULL,
	`courses_count` integer NOT NULL,
	`selected_courses` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_phone` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`duitku_reference` text,
	`payment_url` text,
	`payment_method` text,
	`result_code` text,
	`paid_at` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_orders_merchant_order_id_unique` ON `payment_orders` (`merchant_order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_orders_duitku_reference_unique` ON `payment_orders` (`duitku_reference`);--> statement-breakpoint
CREATE INDEX `payment_orders_user_idx` ON `payment_orders` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payment_orders_status_idx` ON `payment_orders` (`status`,`created_at`);