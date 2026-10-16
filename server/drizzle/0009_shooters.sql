CREATE TABLE "shooter_povs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"title" varchar(140) NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "is_shooter" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "shooter_stats" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "shooter_povs" ADD CONSTRAINT "shooter_povs_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shooter_povs_member_idx" ON "shooter_povs" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "members_shooter_idx" ON "members" USING btree ("is_shooter");