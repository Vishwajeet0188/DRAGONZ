ALTER TABLE "events" ADD COLUMN "hosts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "events" SET "hosts" = jsonb_build_array(jsonb_build_object('memberId', organizer_member_id, 'streamUrl', stream_url)) WHERE organizer_member_id IS NOT NULL AND (hosts IS NULL OR hosts = '[]'::jsonb);
