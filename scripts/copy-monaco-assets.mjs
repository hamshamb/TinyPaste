#!/usr/bin/env node
/**
 * Self-hosts Monaco's prebuilt AMD bundle under public/monaco-editor/vs.
 *
 * The strict CSP in lib/security/headers.ts allows scripts and workers only
 * from 'self' and blob: — no CDN origin is ever on the allow-list. Loading
 * Monaco from a CDN (the @monaco-editor/react default) would therefore be
 * silently blocked, so this project serves the same files monaco-editor ships
 * from its own origin instead. See lib/client/monaco-setup.ts for the loader
 * and worker configuration that points at this path.
 *
 * Runs as an npm "pre" hook (see package.json's predev/prebuild) rather than
 * a dependency postinstall, which some install pipelines refuse to execute.
 * public/monaco-editor is gitignored — this script regenerates it, and it is
 * idempotent and safe to run on every dev/build invocation.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const source = join(root, 'node_modules', 'monaco-editor', 'min', 'vs');
const destination = join(root, 'public', 'monaco-editor', 'vs');

if (!existsSync(source)) {
  console.warn('[copy-monaco-assets] monaco-editor is not installed yet; skipping.');
  process.exit(0);
}

mkdirSync(dirname(destination), { recursive: true });
cpSync(source, destination, { recursive: true });
console.log(`[copy-monaco-assets] copied ${source} -> ${destination}`);
