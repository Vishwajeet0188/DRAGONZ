import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router';
import { SiteLayout } from './components/layout/SiteLayout.jsx';
import { PageLoader } from './components/ui/States.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { usePageViewTracking } from './lib/site.js';

// Route-level code splitting.
const Home = lazy(() => import('./pages/Home.jsx'));
const Members = lazy(() => import('./pages/Members.jsx'));
const MemberProfile = lazy(() => import('./pages/MemberProfile.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const Live = lazy(() => import('./pages/Live.jsx'));
const Videos = lazy(() => import('./pages/Videos.jsx'));
const NewsList = lazy(() => import('./pages/News.jsx').then((m) => ({ default: m.NewsList })));
const NewsPost = lazy(() => import('./pages/News.jsx').then((m) => ({ default: m.NewsPost })));
const EventsList = lazy(() => import('./pages/Events.jsx').then((m) => ({ default: m.EventsList })));
const EventDetail = lazy(() => import('./pages/Events.jsx').then((m) => ({ default: m.EventDetail })));
const Community = lazy(() => import('./pages/Community.jsx'));
const HallOfFame = lazy(() => import('./pages/HallOfFame.jsx'));
const SearchPage = lazy(() => import('./components/search/Search.jsx').then((m) => ({ default: m.SearchPage })));
const Login = lazy(() => import('./pages/auth/Login.jsx'));
const Register = lazy(() => import('./pages/auth/Register.jsx'));
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail.jsx'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const FanZoneHub = lazy(() => import('./pages/FanZone.jsx').then((m) => ({ default: m.FanZoneHub })));
const QuotesPage = lazy(() => import('./pages/FanZone.jsx').then((m) => ({ default: m.QuotesPage })));
const ClipOfTheWeek = lazy(() => import('./pages/FanZone.jsx').then((m) => ({ default: m.ClipOfTheWeek })));
const JoinCrew = lazy(() => import('./pages/FanZone.jsx').then((m) => ({ default: m.JoinCrew })));
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

function ScrollToTop() {
  const { pathname } = useLocation();
  usePageViewTracking();
  // Braces matter: an effect must return nothing or a cleanup function (some browser extensions make scrollTo return a value).
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

function RequireAdmin({ children }) {
  const { user, loading, can } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login?next=/admin" replace />;
  if (!can('admin:access')) return <Navigate to="/dashboard" replace />;
  return children;
}


export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/admin/*" element={<RequireAdmin><AdminApp /></RequireAdmin>} />
          <Route element={<SiteLayout />}>
            <Route index element={<Home />} />
            <Route path="members" element={<Members />} />
            <Route path="members/:slug" element={<MemberProfile />} />
            <Route path="about" element={<About />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="live" element={<Live />} />
            <Route path="videos" element={<Videos />} />
            <Route path="community" element={<Community />} />
            <Route path="hall-of-fame" element={<HallOfFame />} />
            <Route path="fan-zone" element={<FanZoneHub />} />
            <Route path="polls" element={<Navigate to="/fan-zone" replace />} />
            <Route path="leaderboard" element={<Navigate to="/fan-zone" replace />} />
            <Route path="quotes" element={<QuotesPage />} />
            <Route path="clip-of-the-week" element={<ClipOfTheWeek />} />
            <Route path="join" element={<JoinCrew />} />
            <Route path="news" element={<NewsList />} />
            <Route path="news/:slug" element={<NewsPost />} />
            <Route path="events" element={<EventsList />} />
            <Route path="events/:slug" element={<EventDetail />} />
            <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
            <Route path="register" element={<GuestOnly><Register /></GuestOnly>} />
            <Route path="verify-email" element={<VerifyEmail />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="settings" element={<RequireAuth><Settings /></RequireAuth>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
