// Provider registry. A provider implements:
//   platform: 'YOUTUBE' | 'KICK' | …      (matches the platform enum)
//   label: string
//   configured: boolean                    (credentials present)
//   sync(accounts) → { accounts[], videos[], live[], checkedAccountIds[], unitsUsed? }
// Adding Twitch later = one new file here + an entry below. Nothing else changes.
import { env } from '../../config/env.js';
import { createYouTubeProvider } from './youtube.js';
import { createKickProvider } from './kick.js';

export function buildProviders(overrides = {}) {
  return [
    overrides.YOUTUBE ?? createYouTubeProvider({ apiKey: env.YOUTUBE_API_KEY }),
    overrides.KICK ?? createKickProvider({ clientId: env.KICK_CLIENT_ID, clientSecret: env.KICK_CLIENT_SECRET }),
  ];
}
