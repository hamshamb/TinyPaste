'use client';

import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Underline,
  Undo2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { isSafeHref } from '@/lib/document/safe-link';

const TEXT_COLORS = ['#e03131', '#e8590c', '#2f9e44', '#1971c2', '#6544e8', '#17171a'];
const HIGHLIGHT_COLORS = ['#fff3bf', '#ffe3e3', '#d3f9d8', '#d0ebff', '#ede4ff'];

function ToolbarButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md tp-transition',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'bg-accent-soft text-accent'
          : 'text-text-muted hover:bg-surface-muted hover:text-text-base',
      )}
    >
      <Icon aria-hidden className="h-[15px] w-[15px]" strokeWidth={2} />
    </button>
  );
}

function Separator() {
  return <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border-base" />;
}

function LinkPopover({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const active = editor.isActive('link');

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const toggle = () => {
    // Seeded here, at the moment the popover opens, rather than in an effect
    // reacting to `open` — the link mark's current href is a snapshot the
    // click itself already has, not state this component needs to
    // synchronise with an external system on every render.
    if (!open) setHref(editor.getAttributes('link').href ?? '');
    setOpen((value) => !value);
  };

  const apply = () => {
    const trimmed = href.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
      setOpen(false);
      return;
    }
    if (!isSafeHref(trimmed)) {
      setError('That address is not supported. Use an http(s) or mailto link.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
    setOpen(false);
  };

  return (
    <div className="relative">
      <ToolbarButton icon={Link2} label="Link" active={active} onClick={toggle} />
      {open ? (
        <div
          ref={ref}
          className="absolute left-0 top-full z-30 mt-2 w-72 rounded-lg border border-border-base bg-surface p-3 tp-shadow-pop tp-pop"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-subtle">Link</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="-mr-1 rounded p-1 text-text-subtle tp-transition hover:text-text-base"
            >
              <X aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            value={href}
            onChange={(event) => {
              setHref(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                apply();
              }
            }}
            placeholder="https://example.com"
            autoFocus
            className="h-9 w-full rounded-md border border-border-base bg-bg px-2.5 text-[13px] outline-none focus:border-accent-line"
          />
          {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : null}
          <div className="mt-2.5 flex justify-end gap-1.5">
            {active ? (
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().unsetLink().run();
                  setOpen(false);
                }}
                className="h-8 rounded-md px-2.5 text-[13px] font-medium text-danger tp-transition hover:bg-danger-soft"
              >
                Remove
              </button>
            ) : null}
            <button
              type="button"
              onClick={apply}
              className="h-8 rounded-md bg-accent px-3 text-[13px] font-medium text-accent-contrast tp-transition hover:bg-accent-hover"
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ColorPopover({
  editor,
  icon,
  label,
  presets,
  isActive,
  apply,
  clear,
  nativeInputLabel,
}: {
  editor: Editor;
  icon: LucideIcon;
  label: string;
  presets: string[];
  isActive: boolean;
  apply: (color: string) => void;
  clear: () => void;
  nativeInputLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div className="relative">
      <ToolbarButton icon={icon} label={label} active={isActive} onClick={() => setOpen((v) => !v)} />
      {open ? (
        <div
          ref={ref}
          className="absolute left-0 top-full z-30 mt-2 w-48 rounded-lg border border-border-base bg-surface p-3 tp-shadow-pop tp-pop"
        >
          <div className="flex flex-wrap gap-1.5">
            {presets.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                onClick={() => {
                  apply(color);
                  setOpen(false);
                  editor.chain().focus();
                }}
                className="h-6 w-6 rounded-full border border-border-base tp-transition hover:scale-110"
                style={{ backgroundColor: color }}
              />
            ))}
            <label className="relative inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-dashed border-border-strong text-text-subtle">
              <span className="sr-only">{nativeInputLabel}</span>
              <input
                type="color"
                onChange={(event) => {
                  apply(event.target.value);
                  setOpen(false);
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              +
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              clear();
              setOpen(false);
            }}
            className="mt-2.5 text-[12px] font-medium text-text-muted tp-transition hover:text-text-base"
          >
            Clear colour
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Compact formatting toolbar for DOCUMENT mode.
 *
 * Reads live state through useEditorState rather than editor.isActive()
 * inline, so a selection change re-renders this bar without re-rendering the
 * (much heavier) editor surface it sits above.
 */
export function DocumentToolbar({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: (context) => {
      const e = context.editor;
      if (!e) return null;
      return {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        code: e.isActive('code'),
        h1: e.isActive('heading', { level: 1 }),
        h2: e.isActive('heading', { level: 2 }),
        h3: e.isActive('heading', { level: 3 }),
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        blockquote: e.isActive('blockquote'),
        codeBlock: e.isActive('codeBlock'),
        link: e.isActive('link'),
        textStyle: e.isActive('textStyle'),
        highlight: e.isActive('highlight'),
        alignLeft: e.isActive({ textAlign: 'left' }),
        alignCenter: e.isActive({ textAlign: 'center' }),
        alignRight: e.isActive({ textAlign: 'right' }),
        alignJustify: e.isActive({ textAlign: 'justify' }),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });

  if (!editor || !state) return null;
  const run = (fn: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) =>
    fn(editor.chain().focus()).run();

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border-base px-2 py-1.5">
      <ToolbarButton icon={Bold} label="Bold" active={state.bold} onClick={() => run((c) => c.toggleBold())} />
      <ToolbarButton icon={Italic} label="Italic" active={state.italic} onClick={() => run((c) => c.toggleItalic())} />
      <ToolbarButton
        icon={Underline}
        label="Underline"
        active={state.underline}
        onClick={() => run((c) => c.toggleUnderline())}
      />
      <ToolbarButton
        icon={Strikethrough}
        label="Strikethrough"
        active={state.strike}
        onClick={() => run((c) => c.toggleStrike())}
      />

      <Separator />

      <HeadingButton editor={editor} level={1} active={state.h1} />
      <HeadingButton editor={editor} level={2} active={state.h2} />
      <HeadingButton editor={editor} level={3} active={state.h3} />

      <Separator />

      <ToolbarButton
        icon={List}
        label="Bulleted list"
        active={state.bulletList}
        onClick={() => run((c) => c.toggleBulletList())}
      />
      <ToolbarButton
        icon={ListOrdered}
        label="Numbered list"
        active={state.orderedList}
        onClick={() => run((c) => c.toggleOrderedList())}
      />

      <Separator />

      <ToolbarButton
        icon={Quote}
        label="Quote"
        active={state.blockquote}
        onClick={() => run((c) => c.toggleBlockquote())}
      />
      <ToolbarButton icon={Code} label="Inline code" active={state.code} onClick={() => run((c) => c.toggleCode())} />
      <ToolbarButton
        icon={SquareCode}
        label="Code block"
        active={state.codeBlock}
        onClick={() => run((c) => c.toggleCodeBlock())}
      />

      <Separator />

      <LinkPopover editor={editor} />
      <ColorPopover
        editor={editor}
        icon={Baseline}
        label="Text colour"
        nativeInputLabel="Custom text colour"
        presets={TEXT_COLORS}
        isActive={state.textStyle}
        apply={(color) => editor.chain().focus().setColor(color).run()}
        clear={() => editor.chain().focus().unsetColor().run()}
      />
      <ColorPopover
        editor={editor}
        icon={Highlighter}
        label="Highlight colour"
        nativeInputLabel="Custom highlight colour"
        presets={HIGHLIGHT_COLORS}
        isActive={state.highlight}
        apply={(color) => editor.chain().focus().toggleHighlight({ color }).run()}
        clear={() => editor.chain().focus().unsetHighlight().run()}
      />

      <Separator />

      <ToolbarButton
        icon={AlignLeft}
        label="Align left"
        active={state.alignLeft}
        onClick={() => run((c) => c.setTextAlign('left'))}
      />
      <ToolbarButton
        icon={AlignCenter}
        label="Align centre"
        active={state.alignCenter}
        onClick={() => run((c) => c.setTextAlign('center'))}
      />
      <ToolbarButton
        icon={AlignRight}
        label="Align right"
        active={state.alignRight}
        onClick={() => run((c) => c.setTextAlign('right'))}
      />
      <ToolbarButton
        icon={AlignJustify}
        label="Justify"
        active={state.alignJustify}
        onClick={() => run((c) => c.setTextAlign('justify'))}
      />

      <Separator />

      <ToolbarButton icon={Minus} label="Horizontal rule" onClick={() => run((c) => c.setHorizontalRule())} />

      <span className="ml-auto flex items-center gap-0.5">
        <ToolbarButton icon={Undo2} label="Undo" disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()} />
        <ToolbarButton icon={Redo2} label="Redo" disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()} />
      </span>
    </div>
  );
}

function HeadingButton({ editor, level, active }: { editor: Editor; level: 1 | 2 | 3; active: boolean }) {
  const Icon = level === 1 ? Heading1 : level === 2 ? Heading2 : Heading3;
  return (
    <ToolbarButton
      icon={Icon}
      label={`Heading ${level}`}
      active={active}
      onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
    />
  );
}
