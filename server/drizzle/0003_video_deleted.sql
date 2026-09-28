ALTER TABLE "videos" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
-- Deleted synced videos used to be only hidden; mark them deleted.
UPDATE "videos" SET "deleted_at" = now() WHERE "source" = 'SYNC' AND "is_hidden" = true AND "deleted_at" IS NULL;--> statement-breakpoint
-- Manually added YouTube videos without a thumbnail: use YouTube's public thumbnail.
UPDATE "videos" SET "thumbnail_url" = 'https://i.ytimg.com/vi/' || substring("url" from '(?:v=|youtu\.be/|shorts/|live/|embed/)([A-Za-z0-9_-]{11})') || '/hqdefault.jpg'
WHERE "platform" = 'YOUTUBE' AND ("thumbnail_url" IS NULL OR "thumbnail_url" = '') AND substring("url" from '(?:v=|youtu\.be/|shorts/|live/|embed/)([A-Za-z0-9_-]{11})') IS NOT NULL;
