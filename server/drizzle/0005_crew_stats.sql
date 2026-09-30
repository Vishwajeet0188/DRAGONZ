ALTER TABLE "live_streams" ADD COLUMN "peak_viewers" integer;--> statement-breakpoint
CREATE INDEX "live_streams_member_started_idx" ON "live_streams" USING btree ("member_id","started_at");--> statement-breakpoint
UPDATE "live_streams" SET "peak_viewers" = "viewer_count" WHERE "peak_viewers" IS NULL;
