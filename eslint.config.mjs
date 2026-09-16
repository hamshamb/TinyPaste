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
      // Monaco's own prebuilt bundle, copied here by
      // scripts/copy-monaco-assets.mjs — not this project's source.
      'public/monaco-editor/**',
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
    // Tests, config and build scripts run outside the app runtime.
    files: ['tests/**/*.ts', '*.config.ts', '*.config.mjs', 'scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
