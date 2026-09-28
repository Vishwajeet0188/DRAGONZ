import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Menu, X, LayoutDashboard, Settings, Shield, LogOut, ChevronDown } from 'lucide-react';
import { Logo } from '../ui/Logo.jsx';
import { Button } from '../ui/Button.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { LiveDot } from '../ui/Bits.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { SearchPalette } from '../search/Search.jsx';
import { useSiteSettings } from '../../lib/site.js';
import { safeUrl } from '../../lib/format.js';

const NAV = [
  { to: '/members', label: 'Members' },
  { to: '/live', label: 'Live', live: true },
  { to: '/videos', label: 'Videos' },
  { to: '/events', label: 'Events' },
  { to: '/news', label: 'News' },
  { to: '/community', label: 'Community' },
  { to: '/hall-of-fame', label: 'Hall of Fame' },
];


const navCls = ({ isActive }) =>
  `relative inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'text-white' : 'text-ink-300 hover:text-white'}`;

function UserMenu() {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, []);
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-200 hover:bg-ink-700 hover:text-white';
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-ink-800" aria-haspopup="menu" aria-expanded={open}>
        <Avatar src={user.avatarUrl} name={user.displayName} size="sm" />
        <span className="hidden max-w-28 truncate text-sm font-medium text-ink-100 lg:block">{user.displayName}</span>
        <ChevronDown className="h-4 w-4 text-ink-400" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 z-50 mt-2 w-56 animate-fade-up p-1.5" onClick={() => setOpen(false)}>
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink-100">{user.displayName}</p>
            <p className="truncate text-xs text-ink-400">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-ink-700" />
          <Link role="menuitem" to="/dashboard" className={item}><LayoutDashboard className="h-4 w-4" /> Dashboard</Link>
          <Link role="menuitem" to="/settings" className={item}><Settings className="h-4 w-4" /> Settings</Link>
          {can('admin:access') && <Link role="menuitem" to="/admin" className={item}><Shield className="h-4 w-4" /> Admin panel</Link>}
          <div className="my-1 h-px bg-ink-700" />
          <button role="menuitem" type="button" className={item} onClick={async () => { await logout(); navigate('/'); }}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Header() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; }, [open]);

  // Header is always painted (never transparent): the sticky header is its own compositing group,
  // and the DRZ mark's lighten-blend needs a background inside that group to hide its black square.
  return (
    <header className={`sticky top-0 z-40 border-b transition-colors ${scrolled || open ? 'border-ink-700 bg-ink-900/90 backdrop-blur-xl' : 'border-transparent bg-ink-950'}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-dragon-400 focus:px-3 focus:py-2 focus:text-ink-950">Skip to content</a>
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav className="hidden items-center lg:flex" aria-label="Primary">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={navCls}>
              {({ isActive }) => (
                <>
                  {n.live && <LiveDot />}
                  {n.label}
                  {isActive && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-dragon-500" aria-hidden="true" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <SearchPalette />
          {!loading && (user ? <UserMenu /> : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button to="/login" variant="ghost" size="sm">Sign in</Button>
              <Button to="/register" size="sm">Join Dragonz Central</Button>
            </div>
          ))}
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl text-ink-200 hover:bg-ink-800 lg:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? 'Close menu' : 'Open menu'}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" className="container-page h-[calc(100dvh-4rem)] animate-fade-up overflow-y-auto pb-10 pt-2 lg:hidden" aria-label="Mobile">
          <ul className="divide-y divide-ink-700/70">
            {[{ to: '/', label: 'Home' }, ...NAV, { to: '/about', label: 'About' }].map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => `flex items-center gap-2 py-4 font-display text-2xl font-bold ${isActive ? 'text-dragon-400' : 'text-ink-100'}`}>
                  {n.live && <LiveDot />} {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
          {!user && (
            <div className="mt-6 grid gap-3">
              <Button to="/register" size="lg">Join Dragonz Central</Button>
              <Button to="/login" variant="secondary" size="lg">Sign in</Button>
            </div>
          )}
        </nav>
      )}
    </header>
  );
}

function Footer() {
  const { discordUrl } = useSiteSettings();
  const cols = [
    ['Explore', [['/members', 'Members'], ['/live', 'Live now'], ['/videos', 'Videos'], ['/hall-of-fame', 'Hall of Fame']]],
    ['Community', [['/events', 'Events'], ['/news', 'News'], ['/community', 'Showcase'], ['/about', 'About Dragonz']]],
    ['Account', [['/register', 'Create account'], ['/login', 'Sign in'], ['/dashboard', 'Dashboard'], ['/settings', 'Settings']]],
  ];
  return (
    <footer className="mt-24 border-t border-ink-700/80 bg-ink-950/60">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-ink-400">The centralized digital home of the Dragonz — members, creators, streams and the stories we tell together.</p>
          {safeUrl(discordUrl) && <a href={discordUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-ink-600 px-3 py-1.5 text-sm text-ink-200 hover:border-[#5865f2] hover:text-white">Join our Discord</a>}
        </div>
        {cols.map(([title, links]) => (
          <div key={title}>
            <h3 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-ink-100">{title}</h3>
            <ul className="mt-4 space-y-2.5">
              {links.map(([to, label]) => <li key={to}><Link to={to} className="text-sm text-ink-400 hover:text-white">{label}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-ink-800">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-ink-500 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Dragonz. Fan community platform — not affiliated with Rockstar Games.</p>
          <p>Built for the Dragonz community.</p>
        </div>
      </div>
    </footer>
  );
}

function SiteBanner() {
  const { bannerText, bannerUrl } = useSiteSettings();
  if (!bannerText) return null;
  const text = <span className="font-semibold">{bannerText}</span>;
  const href = bannerUrl?.startsWith('/') ? bannerUrl : safeUrl(bannerUrl);
  return (
    <div className="bg-dragon-400 px-4 py-2 text-center text-sm text-ink-950">
      {href ? (href.startsWith('/') ? <Link to={href} className="underline-offset-2 hover:underline">{text} →</Link> : <a href={href} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{text} →</a>) : text}
    </div>
  );
}

export function SiteLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteBanner />
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
