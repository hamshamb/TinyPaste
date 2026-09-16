'use client';

import { loader } from '@monaco-editor/react';

/**
 * Point Monaco at the copy of itself this project serves from its own origin
 * (see scripts/copy-monaco-assets.mjs) instead of @monaco-editor/react's
 * default, which fetches the AMD loader from a jsdelivr CDN. That CDN is not
 * on this app's script-src allow-list — see lib/security/headers.ts — and
 * this project does not add one just to make an editor work.
 *
 * Monaco's language services run in a Web Worker, and the AMD/no-bundler build
 * used here does not know how to locate its own worker scripts on its own; it
 * asks `MonacoEnvironment.getWorkerUrl` for one. The classic recipe for that
 * without cross-origin access (see the monaco-editor-samples
 * "browser-esm-vite-react" and "electron" cross-origin examples) is a tiny
 * worker, built as a same-origin Blob, whose only job is to `importScripts`
 * the real worker file — which keeps everything inside `worker-src 'self'
 * blob:'`, already present in the CSP, with no change to it required.
 */

let configured = false;

export function ensureMonacoEnvironment(): void {
  if (configured || typeof window === 'undefined') return;
  configured = true;

  const base = `${window.location.origin}/monaco-editor`;

  loader.config({ paths: { vs: `${base}/vs` } });

  const environment: { getWorkerUrl: (moduleId: string, label: string) => string } = {
    getWorkerUrl: () => {
      const blob = new Blob(
        [
          `self.MonacoEnvironment = { baseUrl: '${base}/' };`,
          `importScripts('${base}/vs/base/worker/workerMain.js');`,
        ],
        { type: 'text/javascript' },
      );
      return URL.createObjectURL(blob);
    },
  };
  (window as unknown as { MonacoEnvironment: typeof environment }).MonacoEnvironment = environment;
}
