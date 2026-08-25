import js from '@eslint/js'
import globals from 'globals'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

const PROSE_MESSAGE =
  'User-facing text belongs in src/i18n/messages/ and is rendered through t(). See AGENTS.md.'

/** A run of three or more letters: the signal for prose rather than a symbol. */
const PROSE_TEXT = '/[A-Za-zÀ-ɏ]{3,}/'

/**
 * Attributes an assistive technology reads aloud, or a tooltip. Listed by name
 * rather than excluded by name: className, id, type, href, role and the SVG
 * geometry attributes are not prose, and an allowlist cannot go stale into
 * false positives the way a denylist can.
 */
const PROSE_ATTRIBUTE =
  'JSXAttribute[name.name=/^(title|alt|placeholder|aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext)$/]'

/** Prose in child position, or behind one of those attribute names. */
const PROSE_HOLDERS = [
  // `<p>{'…'}</p>` renders exactly like text between tags. Scoped to a child of
  // an element or fragment, because the same node shape in attribute position
  // is a class name or an SVG transform.
  ':matches(JSXElement, JSXFragment) > JSXExpressionContainer',
  // `title="…"` -- the attribute holds the string directly.
  PROSE_ATTRIBUTE,
  // `title={'…'}` -- the same prose, one node deeper. Writing it this way is
  // unusual by hand but is what a mechanical edit produces, and the rule read
  // as though it covered these when it did not.
  `${PROSE_ATTRIBUTE} > JSXExpressionContainer`,
]

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
    /*
     * The hand-written accessibility here is careful -- a skip link, live
     * regions, a keyboard point editor, and a whole `KeyboardCalibration`
     * component written so keyboard users are not trapped by a canvas gesture
     * that needs two clicks. None of it was defended by anything, while
     * CONTRIBUTING.md invites contributions "improving keyboard accessibility"
     * with no gate to check them against.
     */
    files: ['src/**/*.tsx'],
    ignores: ['src/**/*.test.tsx'],
    ...jsxA11y.flatConfigs.strict,
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
        // Each holder, in both the plain-string and the template form. Written
        // as a product rather than by hand: the attribute list had been spelled
        // out once, so the expression form of the very same attributes was
        // silently uncovered.
        ...PROSE_HOLDERS.flatMap((holder) => [
          { selector: `${holder} > Literal[value=${PROSE_TEXT}]`, message: PROSE_MESSAGE },
          {
            // Without the element scope on the child-position holder this
            // flagged eleven `className={`badge ${kind}`}` and
            // `transform={`translate(...)`}` values, none of which are prose.
            selector: `${holder} > TemplateLiteral > TemplateElement[value.raw=${PROSE_TEXT}]`,
            message: PROSE_MESSAGE,
          },
        ]),
      ],
    },
  },
)
