import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'playwright-report', 'test-results', '*.config.js', 'scripts/*.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The spec forbids `any`; `unknown` is fine after a narrowing check.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // The React Compiler rule flags the engine handle returned from `useFight`
      // (it carries a canvas ref inside a plain object), which is intentional:
      // the fight loop reads that ref outside render, never during it.
      'react-hooks/refs': 'off',
      // Reporting a failed WebGL context is a one-off state write from the
      // effect that owns the renderer; there is no cleaner place for it.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
);
