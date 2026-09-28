CREATE TYPE "public"."achievement_category" AS ENUM('TOURNAMENT', 'EVENT', 'MILESTONE', 'MOMENT', 'HISTORY');--> statement-breakpoint
CREATE TYPE "public"."auth_token_type" AS ENUM('EMAIL_VERIFY', 'PASSWORD_RESET');--> statement-breakpoint
CREATE TYPE "public"."content_source" AS ENUM('MANUAL', 'SYNC', 'MOCK');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('QUEUED', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('ACTIVE', 'INACTIVE', 'ALUMNI');--> statement-breakpoint
CREATE TYPE "public"."milestone_type" AS ENUM('SUBSCRIBERS', 'FOLLOWERS', 'VIEWS', 'RP_ACHIEVEMENT', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."news_category" AS ENUM('ANNOUNCEMENT', 'RECRUITMENT', 'COMMUNITY', 'NOTICE');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('LIVE', 'EVENT_REMINDER', 'ANNOUNCEMENT', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('YOUTUBE', 'KICK', 'TWITCH', 'INSTAGRAM', 'TIKTOK', 'X', 'DISCORD');--> statement-breakpoint
CREATE TYPE "public"."publish_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CONTENT_MANAGER', 'USER');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'FEATURED');--> statement-breakpoint
CREATE TYPE "public"."submission_type" AS ENUM('CLIP', 'SCREENSHOT', 'FAN_ART', 'EDIT', 'MEME', 'VIDEO', 'MOMENT');--> statement-breakpoint
CREATE TYPE "public"."supporter_source" AS ENUM('ADMIN', 'SELF_CLAIM', 'CREATOR_APPROVED', 'PLATFORM_SYNC');--> statement-breakpoint
CREATE TYPE "public"."supporter_status" AS ENUM('PENDING', 'VERIFIED', 'REVOKED');--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"category" "achievement_category" NOT NULL,
	"achieved_at" timestamp with time zone NOT NULL,
	"image_url" text,
	"member_id" uuid,
	"is_featured" boolean DEFAULT false NOT NULL,
	"in_hall_of_fame" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" varchar(40),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "auth_token_type" NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"storage_key" varchar(200) NOT NULL,
	"mime_type" varchar(60) NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"featured_member_id" uuid,
	"type" "submission_type" NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" varchar(1000),
	"external_url" text,
	"status" "submission_status" DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" varchar(300),
	"moderated_by_id" uuid,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_address" varchar(254) NOT NULL,
	"template" varchar(60) NOT NULL,
	"subject" varchar(200) NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" varchar(200) NOT NULL,
	"status" "email_status" DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" varchar(500),
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_reminders" (
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_reminders_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(120) NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(40) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"banner_url" text,
	"stream_url" text,
	"external_url" text,
	"status" "event_status" DEFAULT 'SCHEDULED' NOT NULL,
	"organizer_member_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"user_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"notify_live" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_user_id_member_id_pk" PRIMARY KEY("user_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "live_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"platform_account_id" uuid,
	"platform" "platform" NOT NULL,
	"external_id" varchar(100),
	"title" varchar(200) NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"viewer_count" integer,
	"is_live" boolean DEFAULT true NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"source" "content_source" DEFAULT 'MANUAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"display_name" varchar(60) NOT NULL,
	"rank" varchar(40) NOT NULL,
	"rank_order" integer DEFAULT 100 NOT NULL,
	"rp_character" varchar(80),
	"tagline" varchar(140),
	"bio" text,
	"avatar_url" text,
	"banner_url" text,
	"accent_color" varchar(7),
	"is_creator" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"status" "member_status" DEFAULT 'ACTIVE' NOT NULL,
	"joined_at" timestamp with time zone,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"platform" "platform",
	"type" "milestone_type" NOT NULL,
	"value" bigint,
	"title" varchar(120) NOT NULL,
	"achieved_at" timestamp with time zone NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(120) NOT NULL,
	"title" varchar(160) NOT NULL,
	"excerpt" varchar(300),
	"content" text NOT NULL,
	"featured_image_url" text,
	"category" "news_category" DEFAULT 'ANNOUNCEMENT' NOT NULL,
	"status" "publish_status" DEFAULT 'DRAFT' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email_live_alerts" boolean DEFAULT false NOT NULL,
	"email_event_reminders" boolean DEFAULT false NOT NULL,
	"email_announcements" boolean DEFAULT false NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"unsubscribe_token" varchar(64) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" varchar(500),
	"url" text,
	"image_url" text,
	"dedupe_key" varchar(200) NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_views_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"path" varchar(200) NOT NULL,
	"entity_type" varchar(40),
	"entity_id" varchar(40),
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"handle" varchar(100) NOT NULL,
	"url" text NOT NULL,
	"external_id" varchar(100),
	"is_primary" boolean DEFAULT false NOT NULL,
	"follower_count" integer,
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_id" uuid NOT NULL,
	"user_agent" varchar(255),
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supporters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"tier" varchar(60),
	"since" timestamp with time zone,
	"source" "supporter_source" NOT NULL,
	"status" "supporter_status" DEFAULT 'PENDING' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" varchar(40) NOT NULL,
	"avatar_url" text,
	"role" "role" DEFAULT 'USER' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"platform_account_id" uuid,
	"platform" "platform" NOT NULL,
	"external_id" varchar(100),
	"title" varchar(200) NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"duration_sec" integer,
	"view_count" integer,
	"published_at" timestamp with time zone NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"source" "content_source" DEFAULT 'MANUAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_media" ADD CONSTRAINT "community_media_submission_id_community_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."community_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_submissions" ADD CONSTRAINT "community_submissions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_submissions" ADD CONSTRAINT "community_submissions_featured_member_id_members_id_fk" FOREIGN KEY ("featured_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_submissions" ADD CONSTRAINT "community_submissions_moderated_by_id_users_id_fk" FOREIGN KEY ("moderated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_member_id_members_id_fk" FOREIGN KEY ("organizer_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_streams" ADD CONSTRAINT "live_streams_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_streams" ADD CONSTRAINT "live_streams_platform_account_id_platform_accounts_id_fk" FOREIGN KEY ("platform_account_id") REFERENCES "public"."platform_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_posts" ADD CONSTRAINT "news_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supporters" ADD CONSTRAINT "supporters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supporters" ADD CONSTRAINT "supporters_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_platform_account_id_platform_accounts_id_fk" FOREIGN KEY ("platform_account_id") REFERENCES "public"."platform_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievements_achieved_idx" ON "achievements" USING btree ("achieved_at");--> statement-breakpoint
CREATE INDEX "achievements_hof_idx" ON "achievements" USING btree ("in_hall_of_fame","achieved_at");--> statement-breakpoint
CREATE INDEX "achievements_member_idx" ON "achievements" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_hash_key" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_type_idx" ON "auth_tokens" USING btree ("user_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "community_media_key" ON "community_media" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "community_media_submission_idx" ON "community_media" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "community_status_created_idx" ON "community_submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "community_author_idx" ON "community_submissions" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_outbox_dedupe_key" ON "email_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "email_outbox_status_next_idx" ON "email_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "event_reminders_event_idx" ON "event_reminders" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_key" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_status_starts_idx" ON "events" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "follows_member_idx" ON "follows" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_streams_external_key" ON "live_streams" USING btree ("platform","external_id");--> statement-breakpoint
CREATE INDEX "live_streams_live_idx" ON "live_streams" USING btree ("is_live");--> statement-breakpoint
CREATE INDEX "live_streams_member_live_idx" ON "live_streams" USING btree ("member_id","is_live");--> statement-breakpoint
CREATE UNIQUE INDEX "members_slug_key" ON "members" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "members_user_key" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "members_status_rank_idx" ON "members" USING btree ("status","rank_order");--> statement-breakpoint
CREATE INDEX "members_creator_idx" ON "members" USING btree ("is_creator");--> statement-breakpoint
CREATE INDEX "members_featured_idx" ON "members" USING btree ("is_featured");--> statement-breakpoint
CREATE INDEX "milestones_member_idx" ON "milestones" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "milestones_achieved_idx" ON "milestones" USING btree ("achieved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "news_posts_slug_key" ON "news_posts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "news_posts_status_published_idx" ON "news_posts" USING btree ("status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_prefs_user_key" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_prefs_unsub_key" ON "notification_preferences" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_key" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "page_views_day_path_key" ON "page_views_daily" USING btree ("day","path");--> statement-breakpoint
CREATE INDEX "page_views_entity_idx" ON "page_views_daily" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_accounts_member_platform_key" ON "platform_accounts" USING btree ("member_id","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_accounts_external_key" ON "platform_accounts" USING btree ("platform","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "supporters_user_member_key" ON "supporters" USING btree ("user_id","member_id");--> statement-breakpoint
CREATE INDEX "supporters_member_status_idx" ON "supporters" USING btree ("member_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "videos_external_key" ON "videos" USING btree ("platform","external_id");--> statement-breakpoint
CREATE INDEX "videos_published_idx" ON "videos" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "videos_member_published_idx" ON "videos" USING btree ("member_id","published_at");