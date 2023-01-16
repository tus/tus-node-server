module.exports = {
  env: {es6: true, node: true, mocha: true},
  parser: '@typescript-eslint/parser',
  extends: [
    'turbo',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  plugins: ['@typescript-eslint', 'prettier'],
  rules: {
    'no-new': 'off',
    complexity: 'off',
    camelcase: 'off',
    'no-warning-comments': 'off',
    'prettier/prettier': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/ban-ts-comment': 'warn',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    'capitalized-comments': 'off',
  },
  ignorePatterns: ['eslint-config-custom', 'demo', 'dist', 'node_modules'],
}
