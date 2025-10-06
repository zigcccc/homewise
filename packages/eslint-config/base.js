import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import eslintPluginImport from 'eslint-plugin-import';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';
import eslintPluginReact from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintPluginUnusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      react: eslintPluginReact,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'unused-imports': eslintPluginUnusedImports,
      import: eslintPluginImport,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': 'off',
      'prettier/prettier': 'error',
      'react/jsx-sort-props': ['error', { reservedFirst: true }],
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'import/order': [
        'error',
        {
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
          pathGroups: [
            {
              pattern: '@e2e/**',
              group: 'internal',
              position: 'before',
            },
            {
              pattern: '@/**',
              group: 'internal',
            },
          ],
          pathGroupsExcludedImportTypes: ['@e2e/**'],
          groups: ['object', 'builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        },
      ],
    },
  },
  {
    files: ['e2e/**/*.{js,ts,jsx,tsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  eslintPluginPrettier
);
