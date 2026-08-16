import React, { useState } from 'react';
import { useAuth, useLogin, useSignup } from '../lib/useAuth';
import ImportDatabasePanel from '../components/ImportDatabasePanel';
import Segmented, {
  GENDER_OPTIONS,
  FORM_OPTIONS,
  type Gender,
  type GrammaticalForm,
} from '../components/Segmented';
import { Lock, User, ArrowRight, AlertCircle, ShieldCheck, KeyRound, Home, Users } from 'lucide-react';

type Mode = 'login' | 'create' | 'join';

const INPUT_CLASS =
  'w-full pl-11 sm:pl-10 pr-4 py-3.5 sm:py-3 bg-zinc-900/90 sm:bg-zinc-950/80 border border-zinc-800 rounded-2xl text-[16px] sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60 focus:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/20 transition-all min-h-[52px] sm:min-h-[48px]';

const MIN_PASSWORD_LENGTH = 12;

export default function LoginView() {
  const [mode, setMode] = useState<Mode>('login');
  const [importing, setImporting] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [grammaticalForm, setGrammaticalForm] = useState<GrammaticalForm | ''>('');

  const loginMutation = useLogin();
  const signupMutation = useSignup();
  const active = mode === 'login' ? loginMutation : signupMutation;

  // Only a brand-new instance can adopt a database, so the entry point simply
  // is not rendered anywhere else — there is nothing to hide or explain away
  // once an account exists.
  const { data: authState } = useAuth();
  const canImport = authState?.canImport === true;

  const passwordTooShort = mode !== 'login' && password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const canSubmit =
    username.trim().length > 0 &&
    password.length > 0 &&
    !passwordTooShort &&
    (mode !== 'join' || joinCode.trim().length > 0);

  // Unanswered must travel as undefined, not '' — the API enum would reject it.
  const identity = {
    gender: gender || undefined,
    grammaticalForm: gender === 'other' ? grammaticalForm || undefined : undefined,
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || active.isPending) return;

    if (mode === 'login') {
      loginMutation.mutate({ username, password });
    } else if (mode === 'create') {
      signupMutation.mutate({ mode: 'create', username, password, displayName, householdName, ...identity });
    } else {
      signupMutation.mutate({ mode: 'join', username, password, displayName, joinCode, ...identity });
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    loginMutation.reset();
    signupMutation.reset();
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col justify-between sm:justify-center items-center px-6 py-8 sm:p-6 relative overflow-x-hidden font-sans selection:bg-emerald-500/20 selection:text-emerald-400">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full sm:hidden" />

      <div className="w-full max-w-md my-auto sm:my-0 sm:bg-zinc-900/80 sm:backdrop-blur-2xl sm:border sm:border-zinc-800/80 sm:rounded-3xl sm:p-8 sm:shadow-2xl sm:shadow-emerald-950/30 relative z-10 transition-all py-2">
        {importing ? (
          <ImportDatabasePanel onBack={() => setImporting(false)} />
        ) : (
        <>
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-14 h-14 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-5 border border-emerald-400/20">
            <Lock className="w-7 h-7 sm:w-6 sm:h-6 text-zinc-950 font-extrabold stroke-[2.5]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-100">
            {mode === 'login' ? 'Sign in to LeaseOps' : mode === 'create' ? 'Start a household' : 'Join a household'}
          </h1>
          <p className="text-sm text-zinc-400 mt-2 max-w-xs leading-relaxed">
            {mode === 'login'
              ? 'Autonomous apartment hunting pipeline and mathematical lead scoring engine.'
              : mode === 'create'
              ? 'Your criteria, pipeline and outreach live in a household. Invite a partner later with its code.'
              : 'Enter the code from your partner’s Settings screen to share their search.'}
          </p>
        </div>

        {/* Mode switcher */}
        <div className="grid grid-cols-3 gap-1.5 bg-zinc-900/60 sm:bg-zinc-950/60 p-1.5 rounded-2xl border border-zinc-800/80 mb-6">
          {([
            ['login', 'Sign in'],
            ['create', 'New'],
            ['join', 'Join'],
          ] as [Mode, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => switchMode(value)}
              className={`py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer min-h-[44px] ${
                mode === value
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'login' && (
          <div className="mb-6 p-4 sm:p-3.5 bg-zinc-900/60 sm:bg-zinc-950/60 border border-zinc-800/80 rounded-2xl flex items-start gap-3.5 text-xs text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-zinc-300">Self-hosted instance</p>
              <p className="leading-relaxed text-zinc-400">
                Accounts live in your own database. Nothing is sent to a third party, and no
                internet connection is needed to sign in.
              </p>
            </div>
          </div>
        )}

        {active.isError && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-sm text-red-400 animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
            <span>{active.error?.message || 'Something went wrong. Please try again.'}</span>
          </div>
        )}

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
                autoCapitalize="none"
                spellCheck={false}
                placeholder={mode === 'login' ? 'Enter your username' : 'Pick a username'}
                className={INPUT_CLASS}
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
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="••••••••••••"
                className={INPUT_CLASS}
              />
            </div>
            {mode !== 'login' && (
              <p className={`text-xs leading-relaxed ${passwordTooShort ? 'text-amber-400' : 'text-zinc-500'}`}>
                At least {MIN_PASSWORD_LENGTH} characters. There is no password reset email —
                if you lose it, make a new account and rejoin with the household code.
              </p>
            )}
          </div>

          {mode !== 'login' && (
            <div className="space-y-2 sm:space-y-1.5">
              <label htmlFor="displayName" className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                Your name <span className="text-zinc-600 normal-case font-medium">(optional)</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 sm:pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <Users className="w-4 h-4" />
                </div>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Shown to your household"
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          )}

          {mode !== 'login' && (
            <div className="space-y-2 sm:space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                Gender <span className="text-zinc-600 normal-case font-medium">(optional)</span>
              </label>
              <Segmented name="Gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} />
              {gender === 'other' && (
                <div className="pt-2 space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                    How should we write about you?
                  </label>
                  <Segmented
                    name="Writing form"
                    value={grammaticalForm}
                    onChange={setGrammaticalForm}
                    options={FORM_OPTIONS}
                  />
                </div>
              )}
              <p className="text-xs leading-relaxed text-zinc-500">
                Outreach is written in the landlord's language. Spanish, German and French
                need this to say "I live alone" correctly. Skip it and we word around it.
              </p>
            </div>
          )}

          {mode === 'create' && (
            <div className="space-y-2 sm:space-y-1.5">
              <label htmlFor="householdName" className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                Household name <span className="text-zinc-600 normal-case font-medium">(optional)</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 sm:pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <Home className="w-4 h-4" />
                </div>
                <input
                  id="householdName"
                  type="text"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="e.g. Madrid search"
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          )}

          {mode === 'join' && (
            <div className="space-y-2 sm:space-y-1.5">
              <label htmlFor="joinCode" className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                Household code
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 sm:pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <Home className="w-4 h-4" />
                </div>
                <input
                  id="joinCode"
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  required
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="7F3K-92QX"
                  className={`${INPUT_CLASS} font-mono tracking-widest`}
                />
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Your partner finds this in Settings. It gives full access to the household’s
                pipeline, so share it directly rather than posting it anywhere.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={active.isPending || !canSubmit}
            className="w-full mt-3 sm:mt-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-500 text-zinc-950 font-bold py-4 sm:py-3.5 px-6 rounded-2xl text-[15px] sm:text-sm transition-all min-h-[52px] sm:min-h-[48px] flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:shadow-none active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed"
          >
            {active.isPending ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
                <span>{mode === 'login' ? 'Authenticating...' : 'Creating account...'}</span>
              </div>
            ) : (
              <>
                <span>
                  {mode === 'login' ? 'Launch LeaseOps' : mode === 'create' ? 'Create household' : 'Join household'}
                </span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </>
            )}
          </button>
        </form>

        {canImport && (
          <div className="mt-6 pt-5 border-t border-zinc-800/70 text-center">
            <p className="text-xs text-zinc-500 mb-2">Already running LeaseOps somewhere else?</p>
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="text-xs font-semibold text-zinc-400 hover:text-emerald-400 underline underline-offset-4 decoration-zinc-700 hover:decoration-emerald-500/60 transition-colors min-h-[44px] px-4 cursor-pointer"
            >
              Migrate an existing database
            </button>
          </div>
        )}
        </>
        )}
      </div>

      <div className="py-6 sm:mt-8 text-center text-xs text-zinc-600 font-mono">
        LeaseOps PWA v1.0.0 • Bun Runtime • SQLite Embedded
      </div>
    </div>
  );
}
