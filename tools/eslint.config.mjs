import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'coverage/**', 'reports/**', 'target/**', '.metrics/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
    rules: {
      complexity: ['error', 9],
      'max-depth': ['error', 4],
      'max-lines': ['error', { max: 350 }],
      'no-nested-ternary': 'error',
      'no-unused-vars': ['error', { args: 'after-used' }],
      'prefer-const': 'error'
    }
  }
];
