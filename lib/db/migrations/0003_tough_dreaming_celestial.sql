CREATE TABLE "platform_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"clear_other_tenants_on_upload" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rate_limit_config" ADD COLUMN "requests_per_hour" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "session_started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;