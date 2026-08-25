import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

const PROSE_MESSAGE =
  'User-facing text belongs in src/i18n/messages/ and is rendered through t(). See AGENTS.md.'

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
          // Text between tags.
          selector: 'JSXText[value=/[A-Za-zÀ-ɏ]{3,}/]',
          message: PROSE_MESSAGE,
        },
        {
          // Text an assistive technology reads aloud, or a tooltip. Listed by
          // name rather than excluded by name: className, id, type, href, role
          // and the SVG geometry attributes are not prose, and an allowlist
          // cannot go stale into false positives the way a denylist does.
          selector:
            'JSXAttribute[name.name=/^(title|alt|placeholder|aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext)$/] > Literal[value=/[A-Za-zÀ-ɏ]{3,}/]',
          message: PROSE_MESSAGE,
        },
        {
          // `{'…'}` in child position renders exactly like text between tags.
          // Scoped to a child of an element or fragment, because the same node
          // shape in attribute position is a class name or an SVG transform.
          selector:
            ':matches(JSXElement, JSXFragment) > JSXExpressionContainer > Literal[value=/[A-Za-zÀ-ɏ]{3,}/]',
          message: PROSE_MESSAGE,
        },
        {
          // `{`…`}` in child position too. Without the element scope this
          // flagged eleven `className={`badge ${kind}`}` and
          // `transform={`translate(...)`}` values, none of which are prose.
          selector:
            ':matches(JSXElement, JSXFragment) > JSXExpressionContainer > TemplateLiteral > TemplateElement[value.raw=/[A-Za-zÀ-ɏ]{3,}/]',
          message: PROSE_MESSAGE,
        },
      ],
    },
  },
)
