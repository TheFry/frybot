import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Only lint TypeScript source files
  { files: ['src/**/*.ts', 'test/**/*.ts'] },

  // Ignore compiled output and dependencies
  {
    ignores: [
      'built/**',
      'node_modules/**',
      'coverage/**',
      'src/helpers/stream-examples.ts', // reference-only, not active code
      'src/chat_bot/**',                // WIP, not yet implemented
      'scripts/**',                     // utility scripts, not part of the app
    ],
  },

  // ESLint's core recommended rules (catches common JS bugs)
  js.configs.recommended,

  // TypeScript-specific recommended rules (type-aware linting)
  ...tseslint.configs.recommended,

  {
    rules: {
      // ---------------------------------------------------------------
      // Correctness
      // ---------------------------------------------------------------

      // Enforce === over == to prevent silent type coercion bugs.
      // Example: 0 == '' is true, but 0 === '' is false.
      'eqeqeq': ['error', 'always'],

      // ---------------------------------------------------------------
      // Style / Consistency
      // ---------------------------------------------------------------

      // Require semicolons. Missing semicolons can cause hard-to-spot
      // issues due to JavaScript's Automatic Semicolon Insertion (ASI).
      'semi': ['error', 'always'],

      // Enforce single quotes throughout. Double quotes are allowed
      // only when the string itself contains a single quote (avoidEscape).
      'quotes': ['error', 'single', { avoidEscape: true }],

      // Forbid `x === y ? true : false` — just write `x === y`.
      // Applies to any `? true : false` or `? false : true` ternary.
      'no-unneeded-ternary': 'error',

      // ---------------------------------------------------------------
      // TypeScript-specific
      // ---------------------------------------------------------------

      // Flag variables or imports that are declared but never used.
      // Leading underscore (_) marks intentionally ignored params.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // Warn (not error) on explicit `any` type usage. Sometimes
      // unavoidable, but it defeats TypeScript's type checking.
      '@typescript-eslint/no-explicit-any': 'warn',

      // ---------------------------------------------------------------
      // Logging discipline
      // ---------------------------------------------------------------

      // Warn when code calls console.log/warn/error directly.
      // This project uses logConsole/logDiscord instead, which add
      // timestamps, log level filtering, and optional Discord forwarding.
      'no-console': 'warn',
    },
  },

  // logger.ts is the one place that legitimately calls console.*
  // (it IS the logging abstraction). Disable the rule there.
  {
    files: ['src/helpers/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
