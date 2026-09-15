import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/** Flat config. eslint-config-next 16 ships native flat arrays, so no FlatCompat. */
const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // Structured logging goes through lib/security/logger.ts; stray
      // console.log calls are the usual way paste content leaks into a log.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Tests and config files run outside the app runtime.
    files: ['tests/**/*.ts', '*.config.ts', '*.config.mjs'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
