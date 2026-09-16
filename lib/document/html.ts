'use client';

import { generateHTML } from '@tiptap/html';
import type { JSONContent } from '@tiptap/core';
import { createDocumentExtensions } from './extensions';
import type { TinyPasteDoc } from './schema';

/**
 * Render a validated document to standalone HTML — for the "Export as .html"
 * download only, built entirely in the browser from the same document the
 * page already has in memory (decrypted, if the paste is encrypted).
 *
 * This is the one export path the "never return stored arbitrary HTML"
 * requirement is really about: the HTML here is generated fresh from trusted,
 * schema-validated JSON using the exact extension set the editor itself
 * enforces, never lifted from anything a user could have submitted as markup.
 */
export function docToHtml(doc: TinyPasteDoc): string {
  // The Zod schema's node union is typed as `unknown` internally to break a
  // recursive-type cycle (see schema.ts) — already validated by the time
  // anything holds a TinyPasteDoc, so this cast is just recovering that shape
  // for Tiptap's own JSONContent type, not bypassing a real check.
  const body = generateHTML(doc as unknown as JSONContent, createDocumentExtensions());
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Document</title></head><body>${body}</body></html>\n`;
}
