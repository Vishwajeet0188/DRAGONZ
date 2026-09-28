// Platform metadata. Adding a platform = add to PLATFORMS enum (schema.js + migration) and an entry here.
// Host allowlists prevent admins (or a compromised admin account) from storing phishing links as "YouTube" etc.
export const PLATFORM_HOSTS = {
  YOUTUBE: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
  KICK: ['kick.com', 'www.kick.com'],
  TWITCH: ['twitch.tv', 'www.twitch.tv'],
  INSTAGRAM: ['instagram.com', 'www.instagram.com'],
  TIKTOK: ['tiktok.com', 'www.tiktok.com'],
  X: ['x.com', 'twitter.com', 'www.x.com'],
  DISCORD: ['discord.gg', 'discord.com', 'www.discord.com'],
};

export function isPlatformUrl(platform, url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (PLATFORM_HOSTS[platform] ?? []).includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const PLATFORM_LABELS = { YOUTUBE: 'YouTube', KICK: 'Kick', TWITCH: 'Twitch', INSTAGRAM: 'Instagram', TIKTOK: 'TikTok', X: 'X', DISCORD: 'Discord' };
