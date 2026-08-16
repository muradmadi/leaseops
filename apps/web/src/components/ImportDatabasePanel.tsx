import React, { useRef, useState } from 'react';
import { useImportDatabase, useInspectDatabase } from '../lib/useAuth';
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, Database, Upload } from 'lucide-react';

/**
 * Adopting an existing instance's database on a brand-new install.
 *
 * Three steps on purpose — choose, then review, then commit.
 *
 * The review step is not ceremony. The one failure no validation can catch is a
 * `.db` copied without its `-wal`: SQLite keeps recent writes in that sibling
 * file, so the database alone can be a structurally perfect, fully consistent,
 * *stale* snapshot. It passes every check there is. What catches it is a person
 * reading "2 households — Move to Alicante, Test household scraper" and knowing
 * that is not their data. So the names go on screen before anything is replaced.
 */

const ROW_LABELS: Record<string, string> = {
  households: 'Households',
  users: 'Accounts',
  user_profiles: 'Criteria profiles',
  apartments: 'Listings',
  messages: 'Messages',
};

function CountTable({ counts }: { counts: Record<string, number> }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 divide-y divide-zinc-800/80">
      {Object.entries(counts).map(([table, count]) => (
        <div key={table} className="flex items-center justify-between px-4 py-2.5">
          <span className="text-sm text-zinc-400">{ROW_LABELS[table] ?? table}</span>
          <span className="text-sm font-semibold text-zinc-200 tabular-nums">{count}</span>
        </div>
      ))}
    </div>
  );
}

export default function ImportDatabasePanel({ onBack }: { onBack: () => void }) {
  const [database, setDatabase] = useState<File | null>(null);
  const [wal, setWal] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const inspect = useInspectDatabase();
  const importDb = useImportDatabase();
  const preview = inspect.data;
  const result = importDb.data?.imported;

  const reset = () => {
    inspect.reset();
    importDb.reset();
  };

  /**
   * One picker for both files. Selecting the `.db` and its `.db-wal` together is
   * far more reliable than asking for them in two steps, and picking only the
   * `.db` still works when there is no log beside it.
   */
  const handleFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    setDatabase(files.find((f) => !f.name.endsWith('-wal') && !f.name.endsWith('-shm')) ?? null);
    setWal(files.find((f) => f.name.endsWith('-wal')) ?? null);
    reset();
  };

  // ---- Done ---------------------------------------------------------------
  if (result) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-zinc-100">Database adopted</h2>
          <p className="text-sm text-zinc-400 leading-relaxed max-w-xs">
            Sign in with the same username and password you used before — they came across with
            everything else.
          </p>
        </div>

        <CountTable counts={result} />

        <button
          type="button"
          onClick={onBack}
          className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-zinc-950 font-bold py-4 sm:py-3.5 px-6 rounded-2xl text-[15px] sm:text-sm transition-all min-h-[52px] sm:min-h-[48px] flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
        >
          Continue to sign in
        </button>
      </div>
    );
  }

  // ---- Review -------------------------------------------------------------
  if (preview) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-zinc-100">Is this your data?</h2>
          <p className="text-sm text-zinc-400 leading-relaxed max-w-xs">
            Nothing has changed yet. Check this matches what you expect before continuing.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 space-y-2">
          <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">Households</p>
          <ul className="space-y-1">
            {preview.households.map((name) => (
              <li key={name} className="text-sm text-zinc-200 break-words">
                {name}
              </li>
            ))}
          </ul>
          <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold pt-2">Accounts</p>
          <p className="text-sm text-zinc-200 break-words">{preview.accounts.join(', ')}</p>
        </div>

        <CountTable counts={preview.counts} />

        {!wal && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/90 leading-relaxed">
              No <code className="font-mono">-wal</code> file was included. If this shows households
              or listings you do not recognise, the database was copied while the other instance was
              running and this is an old snapshot. Go back and add the{' '}
              <code className="font-mono">.db-wal</code> file too, or run{' '}
              <code className="font-mono">just prepare-db</code> there and upload that instead.
            </p>
          </div>
        )}

        {importDb.isError && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300 leading-relaxed">{importDb.error.message}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={reset}
            disabled={importDb.isPending}
            className="flex-1 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-semibold py-4 sm:py-3.5 px-4 rounded-2xl text-[15px] sm:text-sm transition-all min-h-[52px] sm:min-h-[48px] flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            Not this
          </button>
          <button
            type="button"
            disabled={!database || importDb.isPending}
            onClick={() => database && importDb.mutate({ database, wal })}
            className="flex-[2] bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-500 text-zinc-950 font-bold py-4 sm:py-3.5 px-4 rounded-2xl text-[15px] sm:text-sm transition-all min-h-[52px] sm:min-h-[48px] flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed"
          >
            {importDb.isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
                <span>Importing...</span>
              </>
            ) : (
              <span>Yes, import it</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ---- Choose -------------------------------------------------------------
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
          <Database className="w-6 h-6 text-blue-400" />
        </div>
        <h2 className="text-xl font-bold text-zinc-100">Migrate an existing instance</h2>
        <p className="text-sm text-zinc-400 leading-relaxed max-w-xs">
          Households, listings, scores, criteria, outreach threads and your stored API key all come
          across. You will see what is in the file before anything is replaced.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
        <p className="text-xs text-zinc-400 leading-relaxed">
          Best: run <code className="font-mono text-zinc-300">just prepare-db</code> on the other
          machine and upload the <code className="font-mono text-zinc-300">leaseops-transfer.db</code>{' '}
          it writes.
        </p>
        <p className="text-xs text-zinc-500 leading-relaxed mt-2">
          Otherwise select <code className="font-mono">local_leaseops.db</code>{' '}
          <strong className="text-zinc-400">and</strong> the{' '}
          <code className="font-mono">local_leaseops.db-wal</code> beside it — the{' '}
          <code className="font-mono">.db</code> on its own can be missing recent changes.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full border border-dashed border-zinc-700 hover:border-zinc-600 bg-zinc-950/60 rounded-2xl px-4 py-6 flex flex-col items-center gap-2 transition-all active:scale-[0.98] cursor-pointer min-h-[52px]"
      >
        <Upload className="w-5 h-5 text-zinc-500" />
        {database ? (
          <>
            <span className="text-sm font-medium text-zinc-200 break-all">{database.name}</span>
            <span className="text-xs text-zinc-500 tabular-nums">
              {(database.size / 1024 / 1024).toFixed(2)} MB
              {wal ? ` + ${wal.name}` : ' — no -wal selected'}
            </span>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-zinc-300">Choose your database file(s)</span>
            <span className="text-xs text-zinc-500">Nothing is changed until you confirm</span>
          </>
        )}
      </button>

      {inspect.isError && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300 leading-relaxed">{inspect.error.message}</p>
        </div>
      )}

      <p className="text-xs text-zinc-500 leading-relaxed">
        Importing replaces everything on this instance, and is only possible while no account exists
        here. Afterwards it is closed permanently.
      </p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={inspect.isPending}
          className="flex-1 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-semibold py-4 sm:py-3.5 px-4 rounded-2xl text-[15px] sm:text-sm transition-all min-h-[52px] sm:min-h-[48px] flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer disabled:opacity-50"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          disabled={!database || inspect.isPending}
          onClick={() => database && inspect.mutate({ database, wal })}
          className="flex-[2] bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-500 text-white font-bold py-4 sm:py-3.5 px-4 rounded-2xl text-[15px] sm:text-sm transition-all min-h-[52px] sm:min-h-[48px] flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed"
        >
          {inspect.isPending ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Reading...</span>
            </>
          ) : (
            <span>Check this file</span>
          )}
        </button>
      </div>
    </div>
  );
}
