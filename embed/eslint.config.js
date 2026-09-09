import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2020, globals: globals.browser },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['*'], message: 'The embed has zero runtime dependencies.' }] },
      ],
    },
  },
  {
    // Relative imports inside src are fine; only package imports are forbidden above.
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['!./*', '!../*'], message: 'The embed has zero runtime dependencies.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.test.ts', 'vite.config.ts'],
    rules: { 'no-restricted-imports': 'off', 'no-console': 'off' },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
    rules: { 'no-console': 'off' },
  },
);
