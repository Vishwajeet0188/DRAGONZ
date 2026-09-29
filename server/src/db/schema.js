// Dragonz Central — PostgreSQL schema (Drizzle ORM)
// The full domain model is defined up-front (Phase 1) so later phases add behaviour, not table churn.
import { relations, sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, uuid, varchar, text, boolean, integer, bigint, timestamp, date, jsonb,
  uniqueIndex, index, primaryKey,
} from 'drizzle-orm/pg-core';

// ───────────────────────────── Enums ─────────────────────────────
export const roleEnum = pgEnum('role', ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CONTENT_MANAGER', 'USER']);
export const authTokenTypeEnum = pgEnum('auth_token_type', ['EMAIL_VERIFY', 'PASSWORD_RESET']);
export const memberStatusEnum = pgEnum('member_status', ['ACTIVE', 'INACTIVE', 'ALUMNI']);
export const PLATFORMS = ['YOUTUBE', 'KICK', 'TWITCH', 'INSTAGRAM', 'TIKTOK', 'X', 'DISCORD'];
export const platformEnum = pgEnum('platform', PLATFORMS);
export const contentSourceEnum = pgEnum('content_source', ['MANUAL', 'SYNC', 'MOCK']);
export const publishStatusEnum = pgEnum('publish_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const newsCategoryEnum = pgEnum('news_category', ['ANNOUNCEMENT', 'RECRUITMENT', 'COMMUNITY', 'NOTICE']);
export const eventStatusEnum = pgEnum('event_status', ['DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED']);
export const achievementCategoryEnum = pgEnum('achievement_category', ['TOURNAMENT', 'EVENT', 'MILESTONE', 'MOMENT', 'HISTORY']);
export const milestoneTypeEnum = pgEnum('milestone_type', ['SUBSCRIBERS', 'FOLLOWERS', 'VIEWS', 'RP_ACHIEVEMENT', 'CUSTOM']);
export const submissionTypeEnum = pgEnum('submission_type', ['CLIP', 'SCREENSHOT', 'FAN_ART', 'EDIT', 'MEME', 'VIDEO', 'MOMENT']);
export const submissionStatusEnum = pgEnum('submission_status', ['PENDING', 'APPROVED', 'REJECTED', 'FEATURED']);
export const supporterSourceEnum = pgEnum('supporter_source', ['ADMIN', 'SELF_CLAIM', 'CREATOR_APPROVED', 'PLATFORM_SYNC']);
export const supporterStatusEnum = pgEnum('supporter_status', ['PENDING', 'VERIFIED', 'REVOKED']);
export const notificationTypeEnum = pgEnum('notification_type', ['LIVE', 'EVENT_REMINDER', 'ANNOUNCEMENT', 'SYSTEM']);
export const emailStatusEnum = pgEnum('email_status', ['QUEUED', 'SENT', 'FAILED']);
export const pollStatusEnum = pgEnum('poll_status', ['OPEN', 'CLOSED']);
export const applicationStatusEnum = pgEnum('application_status', ['PENDING', 'REVIEWING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']);
export const socialTargetEnum = pgEnum('social_target', ['NEWS', 'EVENT', 'COMMUNITY', 'QUOTE']);
export const commentStatusEnum = pgEnum('comment_status', ['VISIBLE', 'HIDDEN']);
export const quoteStatusEnum = pgEnum('quote_status', ['PENDING', 'APPROVED', 'REJECTED']);

const ts = (name) => timestamp(name, { withTimezone: true, mode: 'date' });
const id = () => uuid('id').primaryKey().defaultRandom();
const timestamps = {
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
};

// ───────────────────────────── Identity ─────────────────────────────
export const users = pgTable('users', {
  id: id(),
  email: varchar('email', { length: 254 }).notNull(), // stored lower-cased
  passwordHash: text('password_hash').notNull(),
  displayName: varchar('display_name', { length: 40 }).notNull(),
  avatarUrl: text('avatar_url'),
  role: roleEnum('role').notNull().default('USER'),
  emailVerifiedAt: ts('email_verified_at'),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: ts('locked_until'),
  lastLoginAt: ts('last_login_at'),
  // Fan Zone: running XP total (sum of xp_events), leaderboard opt-out and daily check-in streak.
  xp: integer('xp').notNull().default(0),
  showOnLeaderboard: boolean('show_on_leaderboard').notNull().default(true),
  lastCheckinDay: date('last_checkin_day'),
  checkinStreak: integer('checkin_streak').notNull().default(0),
  ...timestamps,
  deletedAt: ts('deleted_at'),
}, (t) => [
  uniqueIndex('users_email_key').on(t.email),
  index('users_role_idx').on(t.role),
]);

export const sessions = pgTable('sessions', {
  id: id(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  userAgent: varchar('user_agent', { length: 255 }),
  expiresAt: ts('expires_at').notNull(),
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
  index('sessions_user_idx').on(t.userId),
  index('sessions_expires_idx').on(t.expiresAt),
]);

export const authTokens = pgTable('auth_tokens', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: authTokenTypeEnum('type').notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('auth_tokens_hash_key').on(t.tokenHash),
  index('auth_tokens_user_type_idx').on(t.userId, t.type),
]);

// ───────────────────────────── Members & creators ─────────────────────────────
// A "creator" is a member with isCreator = true and one or more platform accounts.
export const members = pgTable('members', {
  id: id(),
  slug: varchar('slug', { length: 80 }).notNull(),
  displayName: varchar('display_name', { length: 60 }).notNull(),
  rank: varchar('rank', { length: 40 }).notNull(), // Dragonz in-group role, e.g. "Boss"
  rankOrder: integer('rank_order').notNull().default(100), // lower = more senior
  rpCharacter: varchar('rp_character', { length: 80 }),
  tagline: varchar('tagline', { length: 140 }),
  bio: text('bio'),
  avatarUrl: text('avatar_url'),
  bannerUrl: text('banner_url'),
  accentColor: varchar('accent_color', { length: 7 }),
  isCreator: boolean('is_creator').notNull().default(false),
  isFeatured: boolean('is_featured').notNull().default(false),
  status: memberStatusEnum('status').notNull().default('ACTIVE'),
  joinedAt: ts('joined_at'),
  birthMonth: integer('birth_month'), // 1–12, optional; year deliberately not stored
  birthDay: integer('birth_day'),     // 1–31
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
  deletedAt: ts('deleted_at'),
}, (t) => [
  uniqueIndex('members_slug_key').on(t.slug),
  uniqueIndex('members_user_key').on(t.userId),
  index('members_status_rank_idx').on(t.status, t.rankOrder),
  index('members_creator_idx').on(t.isCreator),
  index('members_featured_idx').on(t.isFeatured),
]);

export const platformAccounts = pgTable('platform_accounts', {
  id: id(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  platform: platformEnum('platform').notNull(),
  handle: varchar('handle', { length: 100 }).notNull(),
  url: text('url').notNull(),
  externalId: varchar('external_id', { length: 100 }), // channel/broadcaster id from official API
  isPrimary: boolean('is_primary').notNull().default(false),
  followerCount: integer('follower_count'),
  syncEnabled: boolean('sync_enabled').notNull().default(true),
  lastSyncedAt: ts('last_synced_at'),
  syncError: varchar('sync_error', { length: 300 }), // last provider error for this account, shown in admin
  ...timestamps,
}, (t) => [
  uniqueIndex('platform_accounts_member_platform_key').on(t.memberId, t.platform),
  uniqueIndex('platform_accounts_external_key').on(t.platform, t.externalId),
]);

export const videos = pgTable('videos', {
  id: id(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  platformAccountId: uuid('platform_account_id').references(() => platformAccounts.id, { onDelete: 'set null' }),
  platform: platformEnum('platform').notNull(),
  externalId: varchar('external_id', { length: 100 }),
  title: varchar('title', { length: 200 }).notNull(),
  url: text('url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  durationSec: integer('duration_sec'),
  viewCount: integer('view_count'),
  publishedAt: ts('published_at').notNull(),
  isFeatured: boolean('is_featured').notNull().default(false),
  isHidden: boolean('is_hidden').notNull().default(false), // admins can hide synced videos (sync never un-hides)
  // Deleted by an admin. Row is kept as a tombstone so the sync never re-imports it; invisible everywhere.
  deletedAt: ts('deleted_at'),
  source: contentSourceEnum('source').notNull().default('MANUAL'),
  ...timestamps,
}, (t) => [
  uniqueIndex('videos_external_key').on(t.platform, t.externalId),
  index('videos_published_idx').on(t.publishedAt),
  index('videos_member_published_idx').on(t.memberId, t.publishedAt),
]);

export const liveStreams = pgTable('live_streams', {
  id: id(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  platformAccountId: uuid('platform_account_id').references(() => platformAccounts.id, { onDelete: 'set null' }),
  platform: platformEnum('platform').notNull(),
  externalId: varchar('external_id', { length: 100 }),
  title: varchar('title', { length: 200 }).notNull(),
  url: text('url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  viewerCount: integer('viewer_count'),
  isLive: boolean('is_live').notNull().default(true),
  startedAt: ts('started_at').notNull(),
  endedAt: ts('ended_at'),
  source: contentSourceEnum('source').notNull().default('MANUAL'),
  ...timestamps,
}, (t) => [
  uniqueIndex('live_streams_external_key').on(t.platform, t.externalId),
  index('live_streams_live_idx').on(t.isLive),
  index('live_streams_member_live_idx').on(t.memberId, t.isLive),
]);

export const milestones = pgTable('milestones', {
  id: id(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  platform: platformEnum('platform'),
  type: milestoneTypeEnum('type').notNull(),
  value: bigint('value', { mode: 'number' }),
  title: varchar('title', { length: 120 }).notNull(),
  achievedAt: ts('achieved_at').notNull(),
  isFeatured: boolean('is_featured').notNull().default(false),
  ...timestamps,
}, (t) => [
  index('milestones_member_idx').on(t.memberId),
  index('milestones_achieved_idx').on(t.achievedAt),
]);

// ───────────────────────────── Following & notifications ─────────────────────────────
export const follows = pgTable('follows', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  notifyLive: boolean('notify_live').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.memberId] }),
  index('follows_member_idx').on(t.memberId),
]);

export const notificationPreferences = pgTable('notification_preferences', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emailLiveAlerts: boolean('email_live_alerts').notNull().default(false), // opt-in
  emailEventReminders: boolean('email_event_reminders').notNull().default(false),
  emailAnnouncements: boolean('email_announcements').notNull().default(false),
  inAppEnabled: boolean('in_app_enabled').notNull().default(true),
  unsubscribeToken: varchar('unsubscribe_token', { length: 64 }).notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('notification_prefs_user_key').on(t.userId),
  uniqueIndex('notification_prefs_unsub_key').on(t.unsubscribeToken),
]);

export const notifications = pgTable('notifications', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull(),
  title: varchar('title', { length: 160 }).notNull(),
  body: varchar('body', { length: 500 }),
  url: text('url'),
  imageUrl: text('image_url'),
  dedupeKey: varchar('dedupe_key', { length: 200 }).notNull(), // e.g. live:<streamId>
  readAt: ts('read_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('notifications_user_dedupe_key').on(t.userId, t.dedupeKey),
  index('notifications_user_created_idx').on(t.userId, t.createdAt),
]);

export const emailOutbox = pgTable('email_outbox', {
  id: id(),
  toAddress: varchar('to_address', { length: 254 }).notNull(),
  template: varchar('template', { length: 60 }).notNull(),
  subject: varchar('subject', { length: 200 }).notNull(),
  payload: jsonb('payload').notNull(),
  dedupeKey: varchar('dedupe_key', { length: 200 }).notNull(),
  status: emailStatusEnum('status').notNull().default('QUEUED'),
  attempts: integer('attempts').notNull().default(0),
  lastError: varchar('last_error', { length: 500 }),
  nextAttemptAt: ts('next_attempt_at').notNull().defaultNow(),
  sentAt: ts('sent_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('email_outbox_dedupe_key').on(t.dedupeKey),
  index('email_outbox_status_next_idx').on(t.status, t.nextAttemptAt),
]);

// ───────────────────────────── Content ─────────────────────────────
export const newsPosts = pgTable('news_posts', {
  id: id(),
  slug: varchar('slug', { length: 120 }).notNull(),
  title: varchar('title', { length: 160 }).notNull(),
  excerpt: varchar('excerpt', { length: 300 }),
  content: text('content').notNull(), // markdown, sanitised on render
  featuredImageUrl: text('featured_image_url'),
  category: newsCategoryEnum('category').notNull().default('ANNOUNCEMENT'),
  status: publishStatusEnum('status').notNull().default('DRAFT'),
  isPinned: boolean('is_pinned').notNull().default(false),
  publishedAt: ts('published_at'),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
  deletedAt: ts('deleted_at'),
}, (t) => [
  uniqueIndex('news_posts_slug_key').on(t.slug),
  index('news_posts_status_published_idx').on(t.status, t.publishedAt),
]);

export const events = pgTable('events', {
  id: id(),
  slug: varchar('slug', { length: 120 }).notNull(),
  title: varchar('title', { length: 160 }).notNull(),
  description: text('description').notNull(),
  category: varchar('category', { length: 40 }).notNull(),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at'),
  bannerUrl: text('banner_url'),
  streamUrl: text('stream_url'),
  externalUrl: text('external_url'),
  status: eventStatusEnum('status').notNull().default('SCHEDULED'),
  organizerMemberId: uuid('organizer_member_id').references(() => members.id, { onDelete: 'set null' }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
  deletedAt: ts('deleted_at'),
}, (t) => [
  uniqueIndex('events_slug_key').on(t.slug),
  index('events_status_starts_idx').on(t.status, t.startsAt),
]);

export const eventReminders = pgTable('event_reminders', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  sentAt: ts('sent_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.eventId] }),
  index('event_reminders_event_idx').on(t.eventId),
]);

// Hall of Fame = achievements with inHallOfFame = true (single source of truth).
export const achievements = pgTable('achievements', {
  id: id(),
  title: varchar('title', { length: 160 }).notNull(),
  description: text('description'),
  category: achievementCategoryEnum('category').notNull(),
  achievedAt: ts('achieved_at').notNull(),
  imageUrl: text('image_url'),
  memberId: uuid('member_id').references(() => members.id, { onDelete: 'set null' }),
  isFeatured: boolean('is_featured').notNull().default(false),
  inHallOfFame: boolean('in_hall_of_fame').notNull().default(true),
  ...timestamps,
}, (t) => [
  index('achievements_achieved_idx').on(t.achievedAt),
  index('achievements_hof_idx').on(t.inHallOfFame, t.achievedAt),
  index('achievements_member_idx').on(t.memberId),
]);

export const communitySubmissions = pgTable('community_submissions', {
  id: id(),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  featuredMemberId: uuid('featured_member_id').references(() => members.id, { onDelete: 'set null' }),
  type: submissionTypeEnum('type').notNull(),
  title: varchar('title', { length: 120 }).notNull(),
  description: varchar('description', { length: 1000 }),
  externalUrl: text('external_url'),
  status: submissionStatusEnum('status').notNull().default('PENDING'),
  rejectionReason: varchar('rejection_reason', { length: 300 }),
  moderatedById: uuid('moderated_by_id').references(() => users.id, { onDelete: 'set null' }),
  moderatedAt: ts('moderated_at'),
  ...timestamps,
  deletedAt: ts('deleted_at'),
}, (t) => [
  index('community_status_created_idx').on(t.status, t.createdAt),
  index('community_author_idx').on(t.authorId),
]);

export const communityMedia = pgTable('community_media', {
  id: id(),
  submissionId: uuid('submission_id').notNull().references(() => communitySubmissions.id, { onDelete: 'cascade' }),
  storageKey: varchar('storage_key', { length: 200 }).notNull(),
  mimeType: varchar('mime_type', { length: 60 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('community_media_key').on(t.storageKey),
  index('community_media_submission_idx').on(t.submissionId),
]);

export const supporters = pgTable('supporters', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  tier: varchar('tier', { length: 60 }),
  since: ts('since'),
  source: supporterSourceEnum('source').notNull(),
  status: supporterStatusEnum('status').notNull().default('PENDING'),
  isPublic: boolean('is_public').notNull().default(false),
  ...timestamps,
}, (t) => [
  uniqueIndex('supporters_user_member_key').on(t.userId, t.memberId),
  index('supporters_member_status_idx').on(t.memberId, t.status),
]);

// ───────────────────────────── Operations ─────────────────────────────
export const auditLogs = pgTable('audit_logs', {
  id: id(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 80 }).notNull(), // e.g. member.update
  entityType: varchar('entity_type', { length: 40 }).notNull(),
  entityId: varchar('entity_id', { length: 40 }),
  metadata: jsonb('metadata'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  index('audit_logs_created_idx').on(t.createdAt),
  index('audit_logs_entity_idx').on(t.entityType, t.entityId),
  index('audit_logs_actor_idx').on(t.actorId),
]);

// Privacy-friendly analytics: aggregated daily counters only — no IPs, no user ids.
export const pageViewsDaily = pgTable('page_views_daily', {
  id: id(),
  day: date('day', { mode: 'string' }).notNull(),
  path: varchar('path', { length: 200 }).notNull(),
  entityType: varchar('entity_type', { length: 40 }),
  entityId: varchar('entity_id', { length: 40 }),
  count: integer('count').notNull().default(0),
}, (t) => [
  uniqueIndex('page_views_day_path_key').on(t.day, t.path),
  index('page_views_entity_idx').on(t.entityType, t.entityId),
]);

export const siteSettings = pgTable('site_settings', {
  key: varchar('key', { length: 80 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

// ───────────────────────────── Fan Zone ─────────────────────────────
export const polls = pgTable('polls', {
  id: id(),
  question: varchar('question', { length: 200 }).notNull(),
  description: varchar('description', { length: 500 }),
  status: pollStatusEnum('status').notNull().default('OPEN'),
  closesAt: ts('closes_at'),
  isPinned: boolean('is_pinned').notNull().default(false),
  memberId: uuid('member_id').references(() => members.id, { onDelete: 'set null' }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
  deletedAt: ts('deleted_at'),
}, (t) => [index('polls_status_idx').on(t.status, t.createdAt)]);

export const pollOptions = pgTable('poll_options', {
  id: id(),
  pollId: uuid('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 120 }).notNull(),
  position: integer('position').notNull().default(0),
}, (t) => [index('poll_options_poll_idx').on(t.pollId)]);

export const pollVotes = pgTable('poll_votes', {
  pollId: uuid('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
  optionId: uuid('option_id').notNull().references(() => pollOptions.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.pollId, t.userId] }), index('poll_votes_option_idx').on(t.optionId)]);

/** Every XP grant is a row; (user, reason, refKey) is unique so the same action can never pay twice. */
export const xpEvents = pgTable('xp_events', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason: varchar('reason', { length: 40 }).notNull(),
  refKey: varchar('ref_key', { length: 120 }).notNull().default(''),
  points: integer('points').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('xp_events_once').on(t.userId, t.reason, t.refKey), index('xp_events_user_idx').on(t.userId, t.createdAt)]);

export const userBadges = pgTable('user_badges', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  badge: varchar('badge', { length: 40 }).notNull(),
  awardedAt: ts('awarded_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.badge] })]);

export const crewApplications = pgTable('crew_applications', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  rpName: varchar('rp_name', { length: 80 }).notNull(),
  discordTag: varchar('discord_tag', { length: 60 }).notNull(),
  ageConfirmed: boolean('age_confirmed').notNull().default(false), // "I am 18 or older" — no birth date collected
  experience: varchar('experience', { length: 2000 }).notNull(),
  whyDrz: varchar('why_drz', { length: 2000 }).notNull(),
  availability: varchar('availability', { length: 200 }),
  clipUrl: text('clip_url'),
  status: applicationStatusEnum('status').notNull().default('PENDING'),
  messageToApplicant: varchar('message_to_applicant', { length: 500 }),
  internalNote: varchar('internal_note', { length: 1000 }),
  reviewedById: uuid('reviewed_by_id').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: ts('reviewed_at'),
  ...timestamps,
}, (t) => [index('crew_applications_status_idx').on(t.status, t.createdAt), index('crew_applications_user_idx').on(t.userId)]);

export const reactions = pgTable('reactions', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetType: socialTargetEnum('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  emoji: varchar('emoji', { length: 12 }).notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.targetType, t.targetId, t.emoji] }), index('reactions_target_idx').on(t.targetType, t.targetId)]);

export const comments = pgTable('comments', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetType: socialTargetEnum('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  body: varchar('body', { length: 500 }).notNull(),
  status: commentStatusEnum('status').notNull().default('VISIBLE'),
  ...timestamps,
  deletedAt: ts('deleted_at'),
}, (t) => [index('comments_target_idx').on(t.targetType, t.targetId, t.createdAt), index('comments_created_idx').on(t.createdAt)]);

/** One vote per user per week (weekKey like "2026-W40", India time). */
export const clipVotes = pgTable('clip_votes', {
  weekKey: varchar('week_key', { length: 10 }).notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  submissionId: uuid('submission_id').notNull().references(() => communitySubmissions.id, { onDelete: 'cascade' }),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.weekKey, t.userId] }), index('clip_votes_week_sub_idx').on(t.weekKey, t.submissionId)]);

export const clipWinners = pgTable('clip_winners', {
  weekKey: varchar('week_key', { length: 10 }).primaryKey(),
  submissionId: uuid('submission_id').notNull().references(() => communitySubmissions.id, { onDelete: 'cascade' }),
  votes: integer('votes').notNull(),
  decidedAt: ts('decided_at').notNull().defaultNow(),
});

export const quotes = pgTable('quotes', {
  id: id(),
  text: varchar('text', { length: 280 }).notNull(),
  memberId: uuid('member_id').references(() => members.id, { onDelete: 'set null' }),
  characterName: varchar('character_name', { length: 80 }),
  context: varchar('context', { length: 140 }),
  submittedById: uuid('submitted_by_id').references(() => users.id, { onDelete: 'set null' }),
  status: quoteStatusEnum('status').notNull().default('PENDING'),
  isFeatured: boolean('is_featured').notNull().default(false),
  moderatedById: uuid('moderated_by_id').references(() => users.id, { onDelete: 'set null' }),
  moderatedAt: ts('moderated_at'),
  ...timestamps,
  deletedAt: ts('deleted_at'),
}, (t) => [index('quotes_status_idx').on(t.status, t.createdAt)]);

// ───────────────────────────── Relations (for relational queries) ─────────────────────────────
export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  member: one(members, { fields: [users.id], references: [members.userId] }),
  follows: many(follows),
}));
export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
export const membersRelations = relations(members, ({ many, one }) => ({
  user: one(users, { fields: [members.userId], references: [users.id] }),
  platforms: many(platformAccounts),
  videos: many(videos),
  liveStreams: many(liveStreams),
  milestones: many(milestones),
  achievements: many(achievements),
  followers: many(follows),
}));
export const platformAccountsRelations = relations(platformAccounts, ({ one }) => ({
  member: one(members, { fields: [platformAccounts.memberId], references: [members.id] }),
}));
export const videosRelations = relations(videos, ({ one }) => ({
  member: one(members, { fields: [videos.memberId], references: [members.id] }),
}));
export const liveStreamsRelations = relations(liveStreams, ({ one }) => ({
  member: one(members, { fields: [liveStreams.memberId], references: [members.id] }),
}));
export const milestonesRelations = relations(milestones, ({ one }) => ({
  member: one(members, { fields: [milestones.memberId], references: [members.id] }),
}));
export const achievementsRelations = relations(achievements, ({ one }) => ({
  member: one(members, { fields: [achievements.memberId], references: [members.id] }),
}));
export const followsRelations = relations(follows, ({ one }) => ({
  user: one(users, { fields: [follows.userId], references: [users.id] }),
  member: one(members, { fields: [follows.memberId], references: [members.id] }),
}));
export const eventsRelations = relations(events, ({ one }) => ({
  organizer: one(members, { fields: [events.organizerMemberId], references: [members.id] }),
}));
export const newsPostsRelations = relations(newsPosts, ({ one }) => ({
  author: one(users, { fields: [newsPosts.authorId], references: [users.id] }),
}));
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
}));

export { sql };
