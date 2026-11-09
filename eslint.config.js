import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'templates/**',
      'apps/**/unpackage/**',
      '.hydro-conflicts/**',
      '*.min.js',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
