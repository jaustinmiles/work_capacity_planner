const js = require('@eslint/js')
const typescript = require('@typescript-eslint/eslint-plugin')
const tsParser = require('@typescript-eslint/parser')
const react = require('eslint-plugin-react')
const reactHooks = require('eslint-plugin-react-hooks')

module.exports = [
  js.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        React: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        KeyboardEvent: 'readonly',
        File: 'readonly',
        Blob: 'readonly',
        MediaRecorder: 'readonly',
        navigator: 'readonly',
        NodeJS: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        HTMLElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        MouseEvent: 'readonly',
        DragEvent: 'readonly',
        WheelEvent: 'readonly',
        Touch: 'readonly',
        ErrorEvent: 'readonly',
        PromiseRejectionEvent: 'readonly',
        TouchEvent: 'readonly',
        Element: 'readonly',
        Event: 'readonly',
        FormData: 'readonly',
        AudioBuffer: 'readonly',
        crypto: 'readonly',
        Crypto: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      'react': react,
      'react-hooks': reactHooks,
    },
    rules: {
      // =====================================
      // TYPESCRIPT STRICT MODE RULES
      // =====================================
      // Goal: Enforce type safety throughout the codebase
      // Status: Gradually enabling stricter rules
      //
      // ACTIVE ENFORCEMENT:
      'no-unused-vars': 'off', // Must be off for TypeScript files to use @typescript-eslint/no-unused-vars
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      '@typescript-eslint/no-explicit-any': 'warn', // TODO: Upgrade to 'error' (~500 fixes needed)
      '@typescript-eslint/no-empty-function': ['warn', {
        allow: ['arrowFunctions'], // Allow empty arrow functions for noops/mocks
      }],
      '@typescript-eslint/explicit-function-return-type': ['warn', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
        allowDirectConstAssertionInArrowFunctions: true,
      }],
      '@typescript-eslint/no-non-null-assertion': 'warn', // TODO: Upgrade to 'error' (~200 fixes needed)
      //
      // PLANNED STRICTNESS (requires type-aware linting setup):
      // These rules require parserOptions.project = './tsconfig.json'
      // '@typescript-eslint/strict-boolean-expressions': ['warn', {
      //   allowString: true,
      //   allowNumber: true,
      //   allowNullableObject: true,
      // }],
      // '@typescript-eslint/no-floating-promises': 'error',
      // '@typescript-eslint/no-misused-promises': 'error',
      // '@typescript-eslint/await-thenable': 'error',
      // '@typescript-eslint/no-unnecessary-condition': 'warn',
      // '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      // '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      // '@typescript-eslint/prefer-optional-chain': 'warn',

      // React rules
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-key': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/no-children-prop': 'error',
      'react/no-string-refs': 'error',
      'react/no-unescaped-entities': 'error',
      'react/self-closing-comp': 'error',

      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // General code quality (simplified)
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'quotes': ['error', 'single', { avoidEscape: true }],
      'semi': ['error', 'never'],
      'comma-dangle': ['error', 'always-multiline'],
      'eol-last': 'error',
      'no-trailing-spaces': 'error',
      'eqeqeq': ['error', 'always'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },

  // Allow console in test files
  {
    files: ['**/__tests__/**/*.ts', '**/__tests__/**/*.tsx', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-console': 'off',
    },
  },

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-var': 'error',
      'prefer-const': 'error',
      'quotes': ['error', 'single', { avoidEscape: true }],
      'semi': ['error', 'never'],
      'comma-dangle': ['error', 'always-multiline'],
      'eol-last': 'error',
      'no-trailing-spaces': 'error',
    },
  },

  {
    files: ['**/database.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      globals: {
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },

  {
    ignores: [
      'node_modules/',
      'dist/',
      '**/dist/',
      'scripts/mcp/dist/',
      'build/',
      'coverage/',
      'docs/',
      'prisma/migrations/',
      'dev.db',
      '.env',
      '.env.*',
      'vite.config.ts',
      'electron-builder.yml',
    ],
  },
]
