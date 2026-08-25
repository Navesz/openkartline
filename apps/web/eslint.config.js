import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // AGENTS.md: never write a literal string into a component. The rule was
    // unenforced, and four real-track names had already drifted from the data
    // they select.
    //
    // A run of three or more letters is the signal for prose. SI unit symbols
    // (kg, km/h, m, s) are internationally standardised and are not translated
    // -- routing them through t() would be theatre -- and they are all shorter
    // than that, so the threshold separates the two without an allowlist.
    files: ['src/**/*.tsx'],
    ignores: ['src/**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/[A-Za-zÀ-ɏ]{3,}/]',
          message:
            'User-facing text belongs in src/i18n/messages/ and is rendered through t(). See AGENTS.md.',
        },
      ],
    },
  },
)
