CREATE TABLE "pricing_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"discounts" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_settings_singleton" CHECK ("pricing_settings"."id" = 'default')
);
