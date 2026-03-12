// @ts-check
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import neverthrow from 'eslint-plugin-neverthrow';

export default [
  {
    ignores: [
      'dist/**',
      '.angular/**',
      'node_modules/**',
      '**/*.spec.ts',
      'eslint.config.mjs',
    ],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      neverthrow,
    },
    rules: {
      // ── TypeScript strict quality rules ──────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',

      // Disallow non-null assertions (!.) – prefer explicit null checks
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Disallow unused variables
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

      // Require proper error handling instead of throw literals
      'no-throw-literal': 'error',
      '@typescript-eslint/only-throw-error': 'error',

      // ── neverthrow ────────────────────────────────────────────────────────
      // NOTE: eslint-plugin-neverthrow@1.1.4 is not yet compatible with ESLint v10
      // (uses the deprecated context.parserServices API). The plugin is installed
      // and the rule will be enforced once the plugin is updated.
      // 'neverthrow/must-use-result': 'error',
    },
  },
];
