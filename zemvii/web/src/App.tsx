import { useEffect, type ReactNode } from 'react';
import { SessionProvider, useSession } from './lib/session.tsx';
import { match, navigate, savedScroll, useRoute } from './lib/router.tsx';
import { Spinner, ToastProvider } from './components/ui.tsx';
import { Shell } from './components/Shell.tsx';
import { Landing, Login, PublicFrame, Recover, Signup, WhyPage } from './pages/Public.tsx';
import { Onboarding } from './pages/Onboarding.tsx';
import { ComposePage, DialsPage, Home, SavedPage } from './pages/Home.tsx';
import { Clips } from './pages/Clips.tsx';
import { Discover, SearchPage, TopicPage } from './pages/Discover.tsx';
import { PostPage } from './pages/PostPage.tsx';
import { CirclesPage, Connections, Profile } from './pages/Profile.tsx';
import { Conversation, Messages, NewMessage } from './pages/Messages.tsx';
import { Notifications } from './pages/Notifications.tsx';
import { NewPlan, NewSpace, PlanPage, Plans, SpacePage, Spaces } from './pages/Community.tsx';
import { CreatorPage, WalletPage } from './pages/Creator.tsx';
import { WellbeingPage } from './pages/Wellbeing.tsx';
import { AccountStatus, MenuPage, Moderation, SettingsPage } from './pages/Settings.tsx';
import { NotFound } from './pages/NotFound.tsx';

type Render = (params: Record<string, string>) => ReactNode;

/** Routes for logged-in people. `wide` pages use the full width (no tools rail). */
const ROUTES: Array<[string, Render, { wide?: boolean }?]> = [
  ['/home', () => <Home />],
  ['/dials', () => <DialsPage />],
  ['/compose', () => <ComposePage />],
  ['/saved', () => <SavedPage />],
  ['/clips', () => <Clips />, { wide: true }],
  ['/discover', () => <Discover />],
  ['/search', () => <SearchPage />],
  ['/t/:tag', (p) => <TopicPage tag={p.tag} />],
  ['/p/:id', (p) => <PostPage id={p.id} />],
  ['/u/:handle', (p) => <Profile handle={p.handle} />],
  ['/u/:handle/followers', (p) => <Connections handle={p.handle} direction="followers" />],
  ['/u/:handle/following', (p) => <Connections handle={p.handle} direction="following" />],
  ['/circles', () => <CirclesPage />],
  ['/messages', () => <Messages />],
  ['/messages/new', () => <NewMessage />],
  ['/messages/:id', (p) => <Conversation id={p.id} />],
  ['/notifications', () => <Notifications />],
  ['/spaces', () => <Spaces />],
  ['/spaces/new', () => <NewSpace />],
  ['/spaces/:slug', (p) => <SpacePage slug={p.slug} />],
  ['/plans', () => <Plans />],
  ['/plans/new', () => <NewPlan />],
  ['/plans/:id', (p) => <PlanPage id={p.id} />],
  ['/creator', () => <CreatorPage />],
  ['/wallet', () => <WalletPage />],
  ['/wellbeing', () => <WellbeingPage />],
  ['/settings', () => <SettingsPage section={null} />],
  ['/settings/:section', (p) => <SettingsPage section={p.section} />],
  ['/status', () => <AccountStatus />],
  ['/moderation', () => <Moderation />, { wide: true }],
  ['/why', () => <WhyPage />],
  ['/menu', () => <MenuPage />],
  ['/welcome', () => <Onboarding />],
];

const PUBLIC: Array<[string, Render]> = [
  ['/', () => <Landing />],
  ['/login', () => <Login />],
  ['/signup', () => <Signup />],
  ['/recover', () => <Recover />],
  ['/why', () => <WhyPage />],
];

function Router() {
  const { me, ready } = useSession();
  const route = useRoute();

  useEffect(() => {
    const y = savedScroll(route.key);
    requestAnimationFrame(() => window.scrollTo(0, y ?? 0));
  }, [route.key]);

  useEffect(() => {
    if (!ready) return;
    if (me && (route.path === '/' || route.path === '/login' || route.path === '/signup')) navigate('/home', { replace: true });
  }, [me, ready, route.path]);

  if (!ready) return <Spinner label="Loading Zemvii" />;

  if (!me) {
    for (const [pattern, render] of PUBLIC) {
      const params = match(pattern, route.path);
      if (params) return <>{render(params)}</>;
    }
    // Shared links to posts and profiles work for logged-out visitors too.
    for (const pattern of ['/p/:id', '/u/:handle', '/t/:tag', '/spaces/:slug', '/plans/:id']) {
      const params = match(pattern, route.path);
      if (params) {
        const found = ROUTES.find(([p]) => p === pattern)!;
        return (
          <PublicFrame>
            <div className="public-page">{found[1](params)}</div>
          </PublicFrame>
        );
      }
    }
    return <Landing />;
  }

  for (const [pattern, render, opts] of ROUTES) {
    const params = match(pattern, route.path);
    if (params) return <Shell wide={opts?.wide}>{render(params)}</Shell>;
  }
  return (
    <Shell>
      <NotFound />
    </Shell>
  );
}

export function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <Router />
      </SessionProvider>
    </ToastProvider>
  );
}
