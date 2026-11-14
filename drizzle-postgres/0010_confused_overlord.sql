CREATE TABLE "gamification_social_rate_limits" (
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"window_key" text NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "gamification_social_rate_limits_user_id_action_window_key_pk" PRIMARY KEY("user_id","action","window_key"),
	CONSTRAINT "gamification_social_rate_limits_attempts_check" CHECK ("gamification_social_rate_limits"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "gamification_social_rate_limits" ADD CONSTRAINT "gamification_social_rate_limits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gamification_social_rate_limits_expiry_idx" ON "gamification_social_rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "gamification_profiles_leaderboard_eligibility_idx" ON "gamification_profiles" USING btree ("visibility","leaderboard_opt_in","user_id");--> statement-breakpoint
CREATE INDEX "gamification_reports_reporter_created_idx" ON "gamification_reports" USING btree ("reporter_id","created_at");