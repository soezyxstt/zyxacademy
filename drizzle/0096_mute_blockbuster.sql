CREATE TABLE `course_video_playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_course_video_playlists_course` ON `course_video_playlists` (`course_id`);--> statement-breakpoint
CREATE TABLE `course_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`playlist_id` text NOT NULL,
	`chapter_id` text,
	`title` text NOT NULL,
	`description` text,
	`video_url` text NOT NULL,
	`thumbnail_url` text,
	`duration` integer,
	`file_size` integer,
	`order_index` integer DEFAULT 0 NOT NULL,
	`uploaded_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`playlist_id`) REFERENCES `course_video_playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_course_videos_course` ON `course_videos` (`course_id`);--> statement-breakpoint
CREATE INDEX `idx_course_videos_playlist` ON `course_videos` (`playlist_id`);--> statement-breakpoint
CREATE INDEX `idx_course_videos_chapter` ON `course_videos` (`chapter_id`);