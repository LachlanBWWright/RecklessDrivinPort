// @ts-check
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import neverthrow from './eslint-neverthrow-patched.mjs';

const tsEslintExtensionRules = {
  ...tseslint.configs['recommended-type-checked'].rules,
};

const neverthrowExtensionRules = neverthrow.configs?.recommended?.rules ?? {};

export default [
  {
    ignores: ['dist/**', '.angular/**', 'node_modules/**', '**/*.spec.ts', 'eslint.config.mjs'],
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
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      // Disallow non-null assertions (!.) – prefer explicit null checks
      '@typescript-eslint/no-non-null-assertion': 'error',

      // Disallow unused variables
      '@typescript-eslint/no-unused-vars': 'error',

      // Require proper error handling instead of throw literals
      'no-throw-literal': 'error',
      '@typescript-eslint/only-throw-error': 'error',

      // ── neverthrow ────────────────────────────────────────────────────────
      'neverthrow/must-use-result': 'error',
    },
  },
  {
    files: ['src/app/editor/sections/object-types/**/*.ts'],
    rules: {
      ...tsEslintExtensionRules,
      ...neverthrowExtensionRules,
    },
  },
];
