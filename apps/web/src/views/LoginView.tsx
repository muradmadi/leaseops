import React, { useState } from 'react';
import { useLogin } from '../lib/useAuth';
import { Lock, User, ArrowRight, AlertCircle, ShieldCheck, KeyRound } from 'lucide-react';

export default function LoginView() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const loginMutation = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    loginMutation.mutate({ username, password });
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col justify-between sm:justify-center items-center px-6 py-8 sm:p-6 relative overflow-x-hidden font-sans selection:bg-emerald-500/20 selection:text-emerald-400">
      {/* Decorative ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Top spacer on mobile for visual balance */}
      <div className="w-full sm:hidden" />

      <div className="w-full max-w-md my-auto sm:my-0 sm:bg-zinc-900/80 sm:backdrop-blur-2xl sm:border sm:border-zinc-800/80 sm:rounded-3xl sm:p-8 sm:shadow-2xl sm:shadow-emerald-950/30 relative z-10 transition-all py-2">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8 sm:mb-8">
          <div className="w-14 h-14 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-5 border border-emerald-400/20">
            <Lock className="w-7 h-7 sm:w-6 sm:h-6 text-zinc-950 font-extrabold stroke-[2.5]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-100">
            Sign in to LeaseOps
          </h1>
          <p className="text-sm text-zinc-400 mt-2 max-w-xs leading-relaxed">
            Autonomous apartment hunting pipeline and mathematical lead scoring engine.
          </p>
        </div>

        {/* Self-Hosted Configuration Notice */}
        <div className="mb-6 p-4 sm:p-3.5 bg-zinc-900/60 sm:bg-zinc-950/60 border border-zinc-800/80 rounded-2xl flex items-start gap-3.5 text-xs text-zinc-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-zinc-300">Self-Hosted Instance</p>
            <p className="leading-relaxed text-zinc-400">
              Login credentials are configured in your <code className="text-zinc-200 bg-zinc-950 sm:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 font-mono">.env</code> or <code className="text-zinc-200 bg-zinc-950 sm:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 font-mono">docker-compose.yml</code>.
            </p>
            <p className="text-zinc-500 text-[11px] pt-1">
              Default fallback: <span className="text-zinc-300 font-mono font-medium">admin</span> / <span className="text-zinc-300 font-mono font-medium">leaseops</span>
            </p>
          </div>
        </div>

        {/* Error Notification Banner */}
        {loginMutation.isError && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-sm text-red-400 animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
            <span>
              {loginMutation.error?.message || 'Invalid username or password. Please try again.'}
            </span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-4">
          <div className="space-y-2 sm:space-y-1.5">
            <label htmlFor="username" className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 sm:pl-3.5 flex items-center pointer-events-none text-zinc-500">
                <User className="w-4 h-4" />
              </div>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder="Enter your username"
                className="w-full pl-11 sm:pl-10 pr-4 py-3.5 sm:py-3 bg-zinc-900/90 sm:bg-zinc-950/80 border border-zinc-800 rounded-2xl text-[16px] sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60 focus:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/20 transition-all min-h-[52px] sm:min-h-[48px]"
              />
            </div>
          </div>

          <div className="space-y-2 sm:space-y-1.5">
            <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 sm:pl-3.5 flex items-center pointer-events-none text-zinc-500">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
                className="w-full pl-11 sm:pl-10 pr-4 py-3.5 sm:py-3 bg-zinc-900/90 sm:bg-zinc-950/80 border border-zinc-800 rounded-2xl text-[16px] sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60 focus:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/20 transition-all min-h-[52px] sm:min-h-[48px]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loginMutation.isPending || !username.trim() || !password.trim()}
            className="w-full mt-3 sm:mt-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-500 text-zinc-950 font-bold py-4 sm:py-3.5 px-6 rounded-2xl text-[15px] sm:text-sm transition-all min-h-[52px] sm:min-h-[48px] flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:shadow-none active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed"
          >
            {loginMutation.isPending ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
                <span>Authenticating...</span>
              </div>
            ) : (
              <>
                <span>Launch LeaseOps</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Footer copyright / system version */}
      <div className="py-6 sm:mt-8 text-center text-xs text-zinc-600 font-mono">
        LeaseOps PWA v1.0.0 • Bun Runtime • SQLite Embedded
      </div>
    </div>
  );
}
