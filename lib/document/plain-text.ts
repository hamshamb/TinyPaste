import type { TinyPasteDoc, TinyPasteNode } from './schema';

type AnyNode = { type: string; text?: string; content?: unknown[] };

function inlineText(node: AnyNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return '';
}

/**
 * Flatten a validated document to plain text — block boundaries become blank
 * lines, list items get a marker, everything else keeps only its text.
 *
 * Used for the "Copy" plain-text fallback, the .txt export, and as the size
 * counter shown in the editor toolbar.
 */
export function docToPlainText(doc: TinyPasteDoc): string {
  const lines: string[] = [];

  function renderInline(nodes: unknown[] | undefined): string {
    return (nodes as AnyNode[] | undefined)?.map(inlineText).join('') ?? '';
  }

  function renderBlocks(nodes: unknown[], indent: string, ordered: { n: number } | null): void {
    for (const raw of nodes as AnyNode[]) {
      switch (raw.type) {
        case 'paragraph':
          lines.push(indent + renderInline(raw.content));
          break;
        case 'heading':
          lines.push(indent + renderInline(raw.content));
          break;
        case 'blockquote':
          renderBlocks(raw.content ?? [], `${indent}> `, null);
          break;
        case 'codeBlock':
          for (const line of renderInline(raw.content).split('\n')) lines.push(`${indent}    ${line}`);
          break;
        case 'horizontalRule':
          lines.push(`${indent}---`);
          break;
        case 'bulletList':
          for (const item of (raw.content ?? []) as AnyNode[]) {
            renderBlocks(item.content ?? [], `${indent}- `, null);
          }
          break;
        case 'orderedList': {
          const counter = { n: 1 };
          for (const item of (raw.content ?? []) as AnyNode[]) {
            renderBlocks(item.content ?? [], `${indent}${counter.n}. `, null);
            counter.n += 1;
          }
          break;
        }
        default:
          break;
      }
    }
    void ordered;
  }

  renderBlocks((doc as unknown as { content: TinyPasteNode[] }).content, '', null);
  // Collapse the run of blank lines a lone empty paragraph produces.
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
