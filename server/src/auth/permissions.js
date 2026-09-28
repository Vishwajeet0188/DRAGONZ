// Role → permission map. Authorization is always decided server-side from the role stored in the DB.
// Permissions are granular strings "<resource>:<action>". Add new ones here and reference them in routes.

export const PERMISSIONS = Object.freeze({
  ADMIN_ACCESS: 'admin:access',
  STATS_READ: 'stats:read',
  MEMBERS_MANAGE: 'members:manage',
  CREATORS_MANAGE: 'creators:manage',
  VIDEOS_MANAGE: 'videos:manage',
  LIVE_MANAGE: 'live:manage',
  NEWS_MANAGE: 'news:manage',
  EVENTS_MANAGE: 'events:manage',
  ACHIEVEMENTS_MANAGE: 'achievements:manage',
  COMMUNITY_MODERATE: 'community:moderate',
  REPORTS_MANAGE: 'reports:manage',
  USERS_READ: 'users:read',
  USERS_MANAGE_ROLES: 'users:manage_roles',
  NOTIFICATIONS_MANAGE: 'notifications:manage',
  ANALYTICS_READ: 'analytics:read',
  SETTINGS_MANAGE: 'settings:manage',
  AUDIT_READ: 'audit:read',
  SUPPORTERS_MANAGE: 'supporters:manage',
});

const P = PERMISSIONS;
const ALL = Object.values(P);

export const ROLE_PERMISSIONS = Object.freeze({
  SUPER_ADMIN: ALL,
  ADMIN: [
    P.ADMIN_ACCESS, P.STATS_READ, P.MEMBERS_MANAGE, P.CREATORS_MANAGE, P.VIDEOS_MANAGE, P.LIVE_MANAGE,
    P.NEWS_MANAGE, P.EVENTS_MANAGE, P.ACHIEVEMENTS_MANAGE, P.COMMUNITY_MODERATE, P.USERS_READ,
    P.NOTIFICATIONS_MANAGE, P.ANALYTICS_READ, P.AUDIT_READ, P.SUPPORTERS_MANAGE,
  ],
  MODERATOR: [P.ADMIN_ACCESS, P.STATS_READ, P.COMMUNITY_MODERATE, P.REPORTS_MANAGE],
  CONTENT_MANAGER: [P.ADMIN_ACCESS, P.STATS_READ, P.VIDEOS_MANAGE, P.NEWS_MANAGE, P.EVENTS_MANAGE],
  USER: [],
});

export const ROLES = Object.keys(ROLE_PERMISSIONS);

export const permissionsFor = (role) => ROLE_PERMISSIONS[role] ?? [];
export const can = (role, permission) => permissionsFor(role).includes(permission);
