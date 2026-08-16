/**
 * Lint configuration for the whole workspace.
 *
 * This exists for one rule above all others: `react-hooks/rules-of-hooks`. A
 * conditional hook is a runtime-only crash — `bun run typecheck`, `bun test` and
 * `bun run build` all passed while a `useEffect` sat below an early return and
 * blanked the screen the moment the modal opened. Nothing else in the gate can
 * see that class of bug.
 *
 * Deliberately narrow otherwise. A linter that reports two hundred stylistic
 * opinions gets ignored, and then it is not catching the crash either.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dev-dist/**',
      'packages/db/drizzle/**',
      '**/*.config.js',
      '**/*.config.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, Bun: 'readonly' },
    },
    rules: {
      // The codebase uses `any` at the LLM and JSON-column boundaries, where the
      // shape genuinely is not known until it is validated. Flagging every one
      // would bury the rules that matter.
      '@typescript-eslint/no-explicit-any': 'off',
      // Unused function arguments are often documentation of a signature.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // React rules apply only to the PWA.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The reason this config exists. Not negotiable, not a warning.
      'react-hooks/rules-of-hooks': 'error',
      // Exhaustive deps stays a warning: several effects here intentionally key
      // on a stable id rather than a polled object, and each is commented.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Tests reach into internals and assert on loose shapes by design.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/test-support.ts'],
    rules: { '@typescript-eslint/no-unused-expressions': 'off' },
  }
);
