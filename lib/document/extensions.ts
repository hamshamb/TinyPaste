import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extension-placeholder';
import type { AnyExtension } from '@tiptap/core';
import { isSafeHref } from './safe-link';

/**
 * The single source of truth for what a TinyPaste document is allowed to
 * contain — used to build the live editor, and again (client-side only) to
 * render a document paste's Export-as-HTML output via `@tiptap/html`'s
 * `generateHTML`. lib/document/schema.ts's Zod schema is the independent,
 * server-side description of the same shape; the two are kept in sync by
 * hand, and tests/unit/document-schema.test.ts is what would catch drift.
 *
 * `editable` toggles nothing about the schema, only whether the surface
 * accepts input — used to seed a read-only editor instance for HTML export
 * without duplicating this list.
 */
export function createDocumentExtensions(options: { placeholder?: string } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        autolink: true,
        defaultProtocol: 'https',
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        isAllowedUri: (url) => isSafeHref(url),
      },
    }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['paragraph', 'heading'] }),
    ...(options.placeholder
      ? [Placeholder.configure({ placeholder: options.placeholder, showOnlyWhenEditable: true })]
      : []),
  ];
}
