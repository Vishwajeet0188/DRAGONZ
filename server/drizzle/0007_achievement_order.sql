ALTER TABLE "achievements" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "achievements" a SET "sort_order" = s.rn FROM (SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM "achievements") s WHERE a.id = s.id;
