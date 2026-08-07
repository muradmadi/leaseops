import React from 'react';
import { Link } from 'wouter';
import { ArrowLeft, User, LogOut, Sparkles, Settings } from 'lucide-react';
import { useAuth, useLogout } from '../lib/useAuth';

export default function SettingsView() {
  const { data: authState } = useAuth();
  const logoutMutation = useLogout();

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/20 selection:text-emerald-400">
      {/* Top Navigation Bar */}
      <header className="border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="p-2 -ml-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-all active:scale-95 flex items-center gap-2 cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
              <span className="font-bold text-sm">Back</span>
            </button>
          </Link>
        </div>
        <div className="flex items-center gap-2 text-zinc-100">
          <Settings className="w-5 h-5 text-emerald-500" />
          <span className="font-extrabold tracking-tight text-lg">Settings</span>
        </div>
        {/* Invisible placeholder to balance the header (since Back is on the left) */}
        <div className="w-16" />
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto w-full px-4 py-8 flex flex-col gap-8">
        
        {/* User Account Section */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest pl-1">Account</h2>
          
          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl overflow-hidden divide-y divide-zinc-800/50">
            {/* User Profile */}
            <div className="p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center border border-zinc-700/50">
                  <User className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500 font-medium mb-0.5">Logged in as</p>
                  <p className="font-bold text-zinc-200 font-mono text-sm sm:text-base">
                    {authState?.user?.username || 'Loading...'}
                  </p>
                </div>
              </div>
            </div>

            {/* Logout Action */}
            <button
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-zinc-800/50 transition-colors group cursor-pointer text-left active:bg-zinc-800"
            >
              <div className="flex items-center gap-3 text-red-400 group-hover:text-red-300">
                <LogOut className="w-5 h-5" />
                <span className="font-bold text-sm">Sign Out</span>
              </div>
            </button>
          </div>
        </section>

        {/* Preferences Section */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest pl-1">Preferences</h2>
          
          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl overflow-hidden">
            <Link href="/onboarding">
              <button className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-zinc-800/50 transition-colors group cursor-pointer text-left active:bg-zinc-800">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="font-bold text-zinc-200 text-sm sm:text-base group-hover:text-white transition-colors">
                      Onboarding Wizard
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Update your must-have features and target rent
                    </p>
                  </div>
                </div>
              </button>
            </Link>
          </div>
        </section>

      </main>
    </div>
  );
}
