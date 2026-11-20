CREATE TABLE "gamification_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"base_xp_micro" bigint DEFAULT 0 NOT NULL,
	"bonus_xp_micro" bigint DEFAULT 0 NOT NULL,
	"course_credits_micro" bigint DEFAULT 0 NOT NULL,
	"lp_balance" bigint DEFAULT 0 NOT NULL,
	"rank_key" text DEFAULT 'rakyat' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gamification_badges" (
	"user_id" text NOT NULL,
	"family" text NOT NULL,
	"count" bigint DEFAULT 0 NOT NULL,
	"tier" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gamification_badges_user_id_family_pk" PRIMARY KEY("user_id","family")
);
--> statement-breakpoint
CREATE TABLE "gamification_blocks" (
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gamification_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "gamification_blocks_not_self" CHECK ("gamification_blocks"."blocker_id" <> "gamification_blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE "gamification_checklist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"checklist_id" text NOT NULL,
	"category" text NOT NULL,
	"source_id" text NOT NULL,
	"content_version" text NOT NULL,
	"base_xp_micro" bigint NOT NULL,
	CONSTRAINT "gamification_checklist_items_identity" UNIQUE("checklist_id","category","source_id")
);
--> statement-breakpoint
CREATE TABLE "gamification_checklists" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"version" bigint NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"total_xp_micro" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "gamification_checklists_course_version" UNIQUE("course_id","version")
);
--> statement-breakpoint
CREATE TABLE "gamification_cosmetics" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slot" text NOT NULL,
	"price_lp" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "gamification_cosmetics_price_check" CHECK ("gamification_cosmetics"."price_lp" >= 0)
);
--> statement-breakpoint
CREATE TABLE "gamification_course_starts" (
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"checklist_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "gamification_course_starts_user_id_course_id_pk" PRIMARY KEY("user_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "gamification_event_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"evidence_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error_code" text,
	CONSTRAINT "gamification_event_evidence_unique" UNIQUE("user_id","source","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "gamification_follows" (
	"follower_id" text NOT NULL,
	"following_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gamification_follows_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id"),
	CONSTRAINT "gamification_follows_not_self" CHECK ("gamification_follows"."follower_id" <> "gamification_follows"."following_id")
);
--> statement-breakpoint
CREATE TABLE "gamification_inventory" (
	"user_id" text NOT NULL,
	"cosmetic_id" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gamification_inventory_user_id_cosmetic_id_pk" PRIMARY KEY("user_id","cosmetic_id")
);
--> statement-breakpoint
CREATE TABLE "gamification_leaderboard_periods" (
	"user_id" text NOT NULL,
	"period_key" text NOT NULL,
	"base_xp_micro" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gamification_leaderboard_periods_user_id_period_key_pk" PRIMARY KEY("user_id","period_key")
);
--> statement-breakpoint
CREATE TABLE "gamification_lp_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"reward_key" text NOT NULL,
	"amount" bigint NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gamification_lp_reward_unique" UNIQUE("user_id","reward_key")
);
--> statement-breakpoint
CREATE TABLE "gamification_missions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"window_key" text NOT NULL,
	"target" bigint NOT NULL,
	"progress" bigint DEFAULT 0 NOT NULL,
	"reward_lp" bigint NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "gamification_mission_window_unique" UNIQUE("user_id","kind","window_key")
);
--> statement-breakpoint
CREATE TABLE "gamification_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"display_name" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"show_major" boolean DEFAULT false NOT NULL,
	"show_faculty" boolean DEFAULT false NOT NULL,
	"allow_follows" boolean DEFAULT false NOT NULL,
	"leaderboard_opt_in" boolean DEFAULT false NOT NULL,
	"avatar_badge_id" text,
	"featured_badge_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"equipped_frame_id" text,
	"equipped_theme_id" text,
	"equipped_title_id" text,
	"follower_count" bigint DEFAULT 0 NOT NULL,
	"following_count" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gamification_profiles_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "gamification_profiles_visibility_check" CHECK ("gamification_profiles"."visibility" in ('private', 'members')),
	CONSTRAINT "gamification_profiles_featured_limit" CHECK (jsonb_typeof("gamification_profiles"."featured_badge_ids") = 'array' and jsonb_array_length("gamification_profiles"."featured_badge_ids") <= 3)
);
--> statement-breakpoint
CREATE TABLE "gamification_qualified_days" (
	"user_id" text NOT NULL,
	"day_key" text NOT NULL,
	"week_key" text NOT NULL,
	CONSTRAINT "gamification_qualified_days_user_id_day_key_pk" PRIMARY KEY("user_id","day_key")
);
--> statement-breakpoint
CREATE TABLE "gamification_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gamification_xp_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_id" text NOT NULL,
	"reward_key" text NOT NULL,
	"base_xp_micro" bigint NOT NULL,
	"bonus_xp_micro" bigint NOT NULL,
	"rank_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gamification_xp_award_unique" UNIQUE("user_id","reward_key"),
	CONSTRAINT "gamification_xp_event_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "gamification_accounts" ADD CONSTRAINT "gamification_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_badges" ADD CONSTRAINT "gamification_badges_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_blocks" ADD CONSTRAINT "gamification_blocks_blocker_id_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_blocks" ADD CONSTRAINT "gamification_blocks_blocked_id_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_checklist_items" ADD CONSTRAINT "gamification_checklist_items_checklist_id_gamification_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."gamification_checklists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_checklists" ADD CONSTRAINT "gamification_checklists_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_course_starts" ADD CONSTRAINT "gamification_course_starts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_course_starts" ADD CONSTRAINT "gamification_course_starts_checklist_id_gamification_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."gamification_checklists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_event_outbox" ADD CONSTRAINT "gamification_event_outbox_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_follows" ADD CONSTRAINT "gamification_follows_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_follows" ADD CONSTRAINT "gamification_follows_following_id_user_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_inventory" ADD CONSTRAINT "gamification_inventory_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_inventory" ADD CONSTRAINT "gamification_inventory_cosmetic_id_gamification_cosmetics_id_fk" FOREIGN KEY ("cosmetic_id") REFERENCES "public"."gamification_cosmetics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_leaderboard_periods" ADD CONSTRAINT "gamification_leaderboard_periods_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_lp_ledger" ADD CONSTRAINT "gamification_lp_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_missions" ADD CONSTRAINT "gamification_missions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_profiles" ADD CONSTRAINT "gamification_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_qualified_days" ADD CONSTRAINT "gamification_qualified_days_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_reports" ADD CONSTRAINT "gamification_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_reports" ADD CONSTRAINT "gamification_reports_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_xp_ledger" ADD CONSTRAINT "gamification_xp_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_xp_ledger" ADD CONSTRAINT "gamification_xp_ledger_event_id_gamification_event_outbox_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."gamification_event_outbox"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gamification_blocks_blocked_idx" ON "gamification_blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "gamification_event_pending_idx" ON "gamification_event_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "gamification_follows_following_idx" ON "gamification_follows" USING btree ("following_id");--> statement-breakpoint
CREATE INDEX "gamification_leaderboard_score_idx" ON "gamification_leaderboard_periods" USING btree ("period_key","base_xp_micro");--> statement-breakpoint
CREATE INDEX "gamification_mission_user_end_idx" ON "gamification_missions" USING btree ("user_id","ends_at");--> statement-breakpoint
CREATE INDEX "gamification_qualified_week_idx" ON "gamification_qualified_days" USING btree ("user_id","week_key");--> statement-breakpoint
CREATE INDEX "gamification_reports_status_idx" ON "gamification_reports" USING btree ("status","created_at");