CREATE TABLE "ai_model_settings" (
	"feature" text PRIMARY KEY NOT NULL,
	"models" jsonb NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
