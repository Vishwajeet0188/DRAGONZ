import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router';
import {
  ArrowLeft, BarChart3, Bell, Calendar, Image as ImageIcon, LayoutDashboard, Menu, Newspaper, Radio, ScrollText, Settings,
  Heart, MessageCircle, Quote, Sparkles, Swords, Trophy, UserCog, Users, Video, Vote, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Logo } from '../components/ui/Logo.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import AdminDashboard from './AdminDashboard.jsx';
import AdminMembers from './AdminMembers.jsx';
import AdminMemberEdit from './AdminMemberEdit.jsx';
import AdminUsers from './AdminUsers.jsx';
import AdminAudit from './AdminAudit.jsx';
import AdminIntegrations from './AdminIntegrations.jsx';
import AdminSoon from './AdminSoon.jsx';
import { AdminEventEdit, AdminEventsList, AdminNewsEdit, AdminNewsList } from './AdminContent.jsx';
import { AdminCommunity, AdminHallOfFame, AdminSupporters, AdminVideos } from './AdminModeration.jsx';
import { AdminApplications, AdminComments, AdminPolls, AdminQuotes } from './AdminFanZone.jsx';
import { AdminAnalytics, AdminNotifications, AdminSettings } from './AdminPlatform.jsx';

// `perm` hides items the user can't use. The API enforces the same permissions server-side.
const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, perm: 'stats:read', end: true },
  { to: '/admin/members', label: 'Members', icon: Users, perm: 'members:manage' },
  { to: '/admin/creators', label: 'Creators', icon: Sparkles, perm: 'creators:manage' },
  { to: '/admin/videos', label: 'Videos', icon: Video, perm: 'videos:manage' },
  { to: '/admin/live', label: 'Live integrations', icon: Radio, perm: 'live:manage' },
  { to: '/admin/news', label: 'News', icon: Newspaper, perm: 'news:manage' },
  { to: '/admin/events', label: 'Events', icon: Calendar, perm: 'events:manage' },
  { to: '/admin/community', label: 'Community', icon: ImageIcon, perm: 'community:moderate' },
  { to: '/admin/comments', label: 'Comments', icon: MessageCircle, perm: 'community:moderate' },
  { to: '/admin/polls', label: 'Polls', icon: Vote, perm: 'fanzone:manage' },
  { to: '/admin/quotes', label: 'Quote Wall', icon: Quote, perm: 'community:moderate' },
  { to: '/admin/applications', label: 'Applications', icon: Swords, perm: 'recruitment:manage' },
  { to: '/admin/achievements', label: 'Hall of Fame', icon: Trophy, perm: 'achievements:manage' },
  { to: '/admin/supporters', label: 'Supporters', icon: Heart, perm: 'supporters:manage' },
  { to: '/admin/users', label: 'Users', icon: UserCog, perm: 'users:read' },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell, perm: 'notifications:manage' },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, perm: 'analytics:read' },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText, perm: 'audit:read' },
  { to: '/admin/settings', label: 'Settings', icon: Settings, perm: 'settings:manage' },
];

function Sidebar({ onNavigate }) {
  const { can, user } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo to="/admin" />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Admin">
        {NAV.filter((n) => can(n.perm)).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-dragon-500/15 text-white' : 'text-ink-300 hover:bg-ink-800 hover:text-white'}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="flex-1">{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-ink-700 p-4">
        <div className="flex items-center gap-3">
          <Avatar src={user.avatarUrl} name={user.displayName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-100">{user.displayName}</p>
            <p className="text-xs text-ink-400">{user.role.replace('_', ' ')}</p>
          </div>
        </div>
        <Link to="/" className="mt-3 flex items-center gap-2 text-xs text-ink-400 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Back to site</Link>
      </div>
    </div>
  );
}

export default function AdminApp() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => { document.title = 'Admin · Dragonz Central'; }, []);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-ink-700 bg-ink-950/70 lg:block"><Sidebar /></aside>

      {/* Mobile top bar + drawer */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-ink-700 bg-ink-900/90 px-4 backdrop-blur lg:hidden">
        <Logo to="/admin" compact />
        <span className="font-display text-sm font-bold uppercase tracking-widest text-ink-300">Admin</span>
        <button type="button" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-ink-800" aria-label="Open admin menu"><Menu className="h-5 w-5" /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 w-72 animate-fade-up border-r border-ink-700 bg-ink-900">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-lg hover:bg-ink-800" aria-label="Close menu"><X className="h-5 w-5" /></button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main className="min-w-0 px-4 py-8 sm:px-8">
        <Routes>
          <Route index element={<AdminDashboard />} />
          <Route path="members" element={<AdminMembers />} />
          <Route path="members/new" element={<AdminMemberEdit />} />
          <Route path="members/:id" element={<AdminMemberEdit />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="live" element={<AdminIntegrations />} />
          <Route path="creators" element={<AdminMembers creatorsOnly />} />
          <Route path="videos" element={<AdminVideos />} />
          <Route path="news" element={<AdminNewsList />} />
          <Route path="news/new" element={<AdminNewsEdit />} />
          <Route path="news/:id" element={<AdminNewsEdit />} />
          <Route path="events" element={<AdminEventsList />} />
          <Route path="events/new" element={<AdminEventEdit />} />
          <Route path="events/:id" element={<AdminEventEdit />} />
          <Route path="community" element={<AdminCommunity />} />
          <Route path="polls" element={<AdminPolls />} />
          <Route path="quotes" element={<AdminQuotes />} />
          <Route path="comments" element={<AdminComments />} />
          <Route path="applications" element={<AdminApplications />} />
          <Route path="achievements" element={<AdminHallOfFame />} />
          <Route path="supporters" element={<AdminSupporters />} />
          <Route path="notifications" element={<AdminNotifications />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="*" element={<AdminSoon title="Not found" />} />
        </Routes>
      </main>
    </div>
  );
}
