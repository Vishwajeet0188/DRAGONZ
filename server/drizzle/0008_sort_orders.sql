ALTER TABLE "community_submissions" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_posts" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Curated lists: give existing rows a stable 1..N order reflecting how they already display,
-- so nothing jumps on deploy. New rows append to the end (max+1, handled in app code).
-- Featured videos (newest featured first today):
UPDATE "videos" v SET "sort_order" = s.rn FROM (
  SELECT id, row_number() OVER (ORDER BY published_at DESC, created_at DESC) AS rn FROM "videos"
) s WHERE v.id = s.id;--> statement-breakpoint
-- Community showcase (featured first, then most recently moderated):
UPDATE "community_submissions" c SET "sort_order" = s.rn FROM (
  SELECT id, row_number() OVER (ORDER BY (status = 'FEATURED') DESC, moderated_at DESC NULLS LAST, created_at DESC) AS rn FROM "community_submissions"
) s WHERE c.id = s.id;
-- news_posts and milestones intentionally stay at 0 (natural newest-first order; set a value to float an item up).