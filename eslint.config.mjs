import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

const baseConfigs = tseslint.configs.recommended.map((cfg) => {
  if (!cfg.rules) return cfg;
  const downgradedRules = {};
  for (const [key, val] of Object.entries(cfg.rules)) {
    if (val === 'error' || (Array.isArray(val) && val[0] === 'error')) {
      downgradedRules[key] = Array.isArray(val) ? ['warn', ...val.slice(1)] : 'warn';
    } else {
      downgradedRules[key] = val;
    }
  }
  return { ...cfg, rules: downgradedRules };
});

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**',
      'dist/**',
      'coverage/**',
      'tmp/**',
      'scratch/**',
      'sw.js',
    ],
  },
  ...baseConfigs,
  {
    plugins: {
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      '@next/next/no-html-link-for-pages': 'warn',
      '@next/next/no-img-element': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn',
    },
  },
];
