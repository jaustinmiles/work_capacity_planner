// ESLint configuration for scripts directory
// Created to allow console.log usage in scripts (documented during PR #67 cleanup)
module.exports = {
  extends: '../.eslintrc.js',
  rules: {
    // Scripts are allowed to use console for output - this is their intended purpose
    // Console.log is appropriate for CLI scripts, unlike application code
    'no-console': 'off',
    // Scripts often need to handle various data types
    '@typescript-eslint/no-explicit-any': 'warn',
    // Scripts don't always need explicit return types for internal functions
    '@typescript-eslint/explicit-function-return-type': ['warn', {
      allowExpressions: true,
      allowTypedFunctionExpressions: true,
      allowHigherOrderFunctions: true,
      allowDirectConstAssertionInArrowFunctions: true,
    }],
  },
}

