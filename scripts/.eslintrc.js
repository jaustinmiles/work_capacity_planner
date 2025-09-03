module.exports = {
  extends: '../.eslintrc.js',
  rules: {
    // Scripts are allowed to use console for output
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

