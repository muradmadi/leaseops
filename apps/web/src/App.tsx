import React from 'react';
import { Route, Switch } from 'wouter';
import DashboardView from './views/DashboardView.tsx';
import OnboardingView from './views/OnboardingView.tsx';
import ApartmentDetailView from './views/ApartmentDetailView.tsx';
import ChatView from './views/ChatView.tsx';
import LoginView from './views/LoginView.tsx';
import SettingsView from './views/SettingsView.tsx';
import { useAuth } from './lib/useAuth';
import { useProfile } from './lib/useProfile';
import { useHousehold } from './lib/useHousehold';
import AboutYouView from './views/AboutYouView.tsx';

function FullScreenLoader({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 font-sans antialiased">
      <div className="w-10 h-10 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
      <p className="text-sm font-medium text-zinc-400 animate-pulse">{message}</p>
    </div>
  );
}

/**
 * Everything behind the login gate.
 *
 * A household with no profile has no criteria, so nothing downstream can work:
 * the MCDA engine would score against defaults the user never chose, and the
 * outreach draft would have no persona. Onboarding is therefore mandatory rather
 * than a prompt that can be dismissed — this covers a brand new household and
 * equally someone who joined a household whose partner had not onboarded yet.
 *
 * `useProfile` lives here rather than in `App` so it only ever runs for an
 * authenticated caller; mounted higher it would fire a guaranteed 401.
 */
function AuthenticatedApp() {
  const { data: profile, isLoading, isError } = useProfile();
  const { data: auth } = useAuth();
  const { data: household, isLoading: householdLoading } = useHousehold();

  if (isLoading) {
    return <FullScreenLoader message="Loading your criteria..." />;
  }

  // On a failed profile fetch, fall through to onboarding rather than the
  // dashboard: showing an unscored pipeline would be worse than asking again.
  if (isError || !profile?.exists) {
    return <OnboardingView />;
  }

  /**
   * A member who has never answered the work question is stopped here.
   *
   * The criteria are the household's and were filled in once, so someone who
   * joined an established household reached the dashboard without ever being
   * asked anything about themselves — and their outreach was then written from
   * the other member's job. `workProfile === null` is exactly "never asked";
   * having answered, even with every box blank, they are never stopped again.
   *
   * A household that cannot be loaded does not block: an unanswerable question
   * is not a reason to lock someone out of their own pipeline.
   */
  if (householdLoading) {
    return <FullScreenLoader message="Loading your household..." />;
  }
  const me = household?.members.find((member) => member.id === auth?.user?.id);
  if (me && !me.workProfile?.employmentStatus) {
    return <AboutYouView required />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans antialiased selection:bg-emerald-500/20 selection:text-emerald-400">
      <Switch>
        <Route path="/" component={DashboardView} />
        <Route path="/onboarding" component={OnboardingView} />
        <Route path="/about-you">
          <AboutYouView required={false} />
        </Route>
        {/* The gate asks for both halves; these edit one at a time from Settings. */}
        <Route path="/profile">
          <AboutYouView required={false} section="work" />
        </Route>
        <Route path="/household">
          <AboutYouView required={false} section="household" />
        </Route>
        <Route path="/apartments/:id/chat" component={ChatView} />
        <Route path="/apartments/:id" component={ApartmentDetailView} />
        <Route path="/settings" component={SettingsView} />
        <Route>
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-2xl font-bold text-zinc-200 mb-2">404 — Page Not Found</h1>
            <p className="text-sm text-zinc-400 mb-6">The requested pipeline view does not exist.</p>
            <a href="/" className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all min-h-[44px] flex items-center">
              Return to Command Center
            </a>
          </div>
        </Route>
      </Switch>
    </div>
  );
}

export default function App() {
  const { data: authState, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenLoader message="Initializing RevOps Session..." />;
  }

  if (!authState?.authenticated) {
    return <LoginView />;
  }

  return <AuthenticatedApp />;
}
