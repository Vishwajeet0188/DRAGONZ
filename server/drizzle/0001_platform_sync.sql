ALTER TABLE "platform_accounts" ALTER COLUMN "sync_enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "platform_accounts" ADD COLUMN "sync_error" varchar(300);--> statement-breakpoint
-- Existing accounts opt in to auto-sync (new default).
UPDATE "platform_accounts" SET "sync_enabled" = true;
