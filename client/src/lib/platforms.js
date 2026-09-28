import { Play, Tv, Zap, Camera, Music2, AtSign, MessagesSquare } from 'lucide-react';

// Generic glyphs + brand colours. Official brand marks can be swapped in here per each platform's brand guidelines.
export const PLATFORM_META = {
  YOUTUBE: { label: 'YouTube', color: '#ff3b30', Icon: Play, noun: 'subscribers' },
  KICK: { label: 'Kick', color: '#53fc18', Icon: Zap, noun: 'followers' },
  TWITCH: { label: 'Twitch', color: '#a970ff', Icon: Tv, noun: 'followers' },
  INSTAGRAM: { label: 'Instagram', color: '#f56040', Icon: Camera, noun: 'followers' },
  TIKTOK: { label: 'TikTok', color: '#25f4ee', Icon: Music2, noun: 'followers' },
  X: { label: 'X', color: '#e7e9ea', Icon: AtSign, noun: 'followers' },
  DISCORD: { label: 'Discord', color: '#5865f2', Icon: MessagesSquare, noun: 'members' },
};

export const PLATFORMS = Object.keys(PLATFORM_META);
export const STREAM_PLATFORMS = ['YOUTUBE', 'KICK', 'TWITCH'];
