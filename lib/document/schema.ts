import { z } from 'zod';
import { isSafeCssColor } from './css-color';
import { isSafeHref } from './safe-link';

/**
 * The document format.
 *
 * This is deliberately a closed subset of ProseMirror/Tiptap JSON — exactly
 * the node and mark types the DOCUMENT_EXTENSIONS in lib/document/editor.ts
 * register, nothing more. A paste is never trusted HTML and never trusted
 * arbitrary JSON: every node type, every mark type and every attribute value
 * (a link's href, a colour) is validated here before a document paste is ever
 * written, and the reader (components/paste/document-renderer.tsx) walks this
 * same validated shape directly into React elements — there is no
 * dangerouslySetInnerHTML anywhere in the read path.
 */

const MAX_TEXT_LENGTH = 100_000;
const MAX_ARRAY_LENGTH = 5_000;

/** Node/attribute limits enforced structurally, before Zod ever recurses. */
export const DOCUMENT_MAX_DEPTH = 64;
export const DOCUMENT_MAX_NODES = 20_000;

const TEXT_ALIGN_VALUES = ['left', 'center', 'right', 'justify'] as const;
const alignAttr = z.enum(TEXT_ALIGN_VALUES).nullish();

const hrefSchema = z
  .string()
  .min(1)
  .max(4_096)
  .refine(isSafeHref, 'Link uses an unsupported or unsafe address scheme.');

const colorSchema = z.string().refine(isSafeCssColor, 'Unsupported colour value.').nullish();

// ---------------------------------------------------------------------------
// Marks — never recursive, so these can be plain, eagerly-built schemas.
// ---------------------------------------------------------------------------

const boldMark = z.object({ type: z.literal('bold') }).strict();
const italicMark = z.object({ type: z.literal('italic') }).strict();
const underlineMark = z.object({ type: z.literal('underline') }).strict();
const strikeMark = z.object({ type: z.literal('strike') }).strict();
const codeMark = z.object({ type: z.literal('code') }).strict();

const linkMark = z
  .object({
    type: z.literal('link'),
    attrs: z
      .object({
        href: hrefSchema,
        target: z.string().max(32).nullish(),
        rel: z.string().max(128).nullish(),
        class: z.string().max(128).nullish(),
        // Tiptap's Link mark carries this as a plain HTML title/tooltip — not
        // to be confused with the paste's own title field.
        title: z.string().max(256).nullish(),
      })
      .strict(),
  })
  .strict();

const textStyleMark = z
  .object({ type: z.literal('textStyle'), attrs: z.object({ color: colorSchema }).strict().optional() })
  .strict();

const highlightMark = z
  .object({ type: z.literal('highlight'), attrs: z.object({ color: colorSchema }).strict().optional() })
  .strict();

const markSchema = z.discriminatedUnion('type', [
  boldMark,
  italicMark,
  underlineMark,
  strikeMark,
  codeMark,
  linkMark,
  textStyleMark,
  highlightMark,
]);

export type DocumentMark = z.infer<typeof markSchema>;

// ---------------------------------------------------------------------------
// Inline content.
// ---------------------------------------------------------------------------

const textNode = z
  .object({
    type: z.literal('text'),
    text: z.string().min(1).max(MAX_TEXT_LENGTH),
    marks: z.array(markSchema).max(16).optional(),
  })
  .strict();

const hardBreakNode = z.object({ type: z.literal('hardBreak') }).strict();

const inlineNode = z.union([textNode, hardBreakNode]);
const inlineContent = z.array(inlineNode).max(MAX_ARRAY_LENGTH);

/** Code blocks carry plain text only — no marks, matching Tiptap's own schema. */
const codeBlockTextNode = z.object({ type: z.literal('text'), text: z.string().min(1).max(MAX_TEXT_LENGTH) }).strict();

// ---------------------------------------------------------------------------
// Block content. bulletList / orderedList / blockquote / listItem recurse
// into each other and back into the general block union, so they are the
// only schemas that need to be declared with z.lazy — see the module-level
// note below for why declaration order among them does not matter.
// ---------------------------------------------------------------------------

const paragraphNode = z
  .object({
    type: z.literal('paragraph'),
    attrs: z.object({ textAlign: alignAttr }).strict().partial().optional(),
    content: inlineContent.optional(),
  })
  .strict();

const headingNode = z
  .object({
    type: z.literal('heading'),
    attrs: z.object({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]), textAlign: alignAttr }).strict(),
    content: inlineContent.optional(),
  })
  .strict();

const horizontalRuleNode = z.object({ type: z.literal('horizontalRule') }).strict();

const codeBlockNode = z
  .object({
    type: z.literal('codeBlock'),
    attrs: z.object({ language: z.string().max(64).nullish() }).strict().partial().optional(),
    content: z.array(codeBlockTextNode).max(MAX_ARRAY_LENGTH).optional(),
  })
  .strict();

/**
 * z.lazy defers evaluating its callback until the schema is actually used to
 * parse something, by which point every `const` below has finished
 * initialising — so these five can reference each other regardless of the
 * order they are declared in. That is what breaks the
 * blockNode -> {bulletList, orderedList, blockquote} -> listItem -> blockNode
 * cycle without a "used before its declaration" error.
 */
const blockNode: z.ZodType<unknown> = z.lazy(() =>
  z.union([paragraphNode, headingNode, bulletListNode, orderedListNode, blockquoteNode, codeBlockNode, horizontalRuleNode]),
);

const listItemNode: z.ZodType<unknown> = z.lazy(() =>
  z.object({ type: z.literal('listItem'), content: z.array(blockNode).min(1).max(MAX_ARRAY_LENGTH) }).strict(),
);

const bulletListNode: z.ZodType<unknown> = z.lazy(() =>
  z.object({ type: z.literal('bulletList'), content: z.array(listItemNode).min(1).max(MAX_ARRAY_LENGTH) }).strict(),
);

const orderedListNode: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      type: z.literal('orderedList'),
      attrs: z
        .object({
          start: z.number().int().min(0).max(1_000_000).nullish(),
          // The HTML <ol type="…"> marker style (1/a/A/i/I) — set when typed
          // via markdown-style input rules (e.g. "a." or "i)").
          type: z.enum(['1', 'a', 'A', 'i', 'I']).nullish(),
        })
        .strict()
        .partial()
        .optional(),
      content: z.array(listItemNode).min(1).max(MAX_ARRAY_LENGTH),
    })
    .strict(),
);

const blockquoteNode: z.ZodType<unknown> = z.lazy(() =>
  z.object({ type: z.literal('blockquote'), content: z.array(blockNode).min(1).max(MAX_ARRAY_LENGTH) }).strict(),
);

export const documentSchema = z
  .object({
    type: z.literal('doc'),
    content: z.array(blockNode).max(MAX_ARRAY_LENGTH),
  })
  .strict();

export type TinyPasteDoc = z.infer<typeof documentSchema>;
export type TinyPasteNode = TinyPasteDoc['content'][number];

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentValidationError';
  }
}

/**
 * Iterative (non-recursive) shape check, run before the schema is ever asked
 * to parse anything.
 *
 * Zod validates a nested union by recursing in plain JS call frames, so a
 * document with thousands of nesting levels could exhaust the call stack
 * before our own size limits ever get a chance to reject it cleanly. Walking
 * the raw, untrusted JSON with an explicit stack costs one array instead of
 * one stack frame per level, so it can safely enforce a depth and node-count
 * ceiling ahead of the real validation.
 */
function assertBoundedShape(raw: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: raw, depth: 0 }];
  let nodeCount = 0;

  while (stack.length > 0) {
    const { value, depth } = stack.pop()!;
    if (depth > DOCUMENT_MAX_DEPTH) {
      throw new DocumentValidationError(`Document is nested more than ${DOCUMENT_MAX_DEPTH} levels deep.`);
    }
    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_LENGTH) {
        throw new DocumentValidationError('A list inside the document has too many items.');
      }
      for (const item of value) stack.push({ value: item, depth: depth + 1 });
      continue;
    }
    if (value !== null && typeof value === 'object') {
      nodeCount += 1;
      if (nodeCount > DOCUMENT_MAX_NODES) {
        throw new DocumentValidationError('Document has too many nodes.');
      }
      for (const child of Object.values(value as Record<string, unknown>)) {
        stack.push({ value: child, depth: depth + 1 });
      }
    }
  }
}

/**
 * Parse and validate a document paste's stored string.
 *
 * Throws `DocumentValidationError` for anything that is not well-formed JSON
 * or does not match the closed node/mark set above — including a node type
 * this application has simply never heard of. There is no lenient mode: an
 * unrecognised shape is a rejected write, never a best-effort render.
 */
export function parseDocumentJson(raw: string): TinyPasteDoc {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new DocumentValidationError('Document content is not valid JSON.');
  }

  assertBoundedShape(candidate);

  const result = documentSchema.safeParse(candidate);
  if (!result.success) {
    throw new DocumentValidationError('Document content does not match the supported document format.');
  }
  return result.data;
}

/** Non-throwing variant for call sites that already branch on success/failure. */
export function isValidDocumentJson(raw: string): boolean {
  try {
    parseDocumentJson(raw);
    return true;
  } catch {
    return false;
  }
}
