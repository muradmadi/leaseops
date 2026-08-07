import React from 'react';
import { Route, Switch } from 'wouter';
import DashboardView from './views/DashboardView.tsx';
import OnboardingView from './views/OnboardingView.tsx';
import ApartmentDetailView from './views/ApartmentDetailView.tsx';
import ChatView from './views/ChatView.tsx';
import LoginView from './views/LoginView.tsx';
import SettingsView from './views/SettingsView.tsx';
import { useAuth } from './lib/useAuth';

export default function App() {
  const { data: authState, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 font-sans antialiased">
        <div className="w-10 h-10 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-zinc-400 animate-pulse">Initializing RevOps Session...</p>
      </div>
    );
  }

  if (!authState?.authenticated) {
    return <LoginView />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans antialiased selection:bg-emerald-500/20 selection:text-emerald-400">
      <Switch>
        <Route path="/" component={DashboardView} />
        <Route path="/onboarding" component={OnboardingView} />
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
