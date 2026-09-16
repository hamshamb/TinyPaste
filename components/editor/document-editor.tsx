'use client';

import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { createDocumentExtensions } from '@/lib/document/extensions';
import type { TinyPasteDoc } from '@/lib/document/schema';
import { DocumentToolbar } from '@/components/editor/document-toolbar';
import { cn } from '@/lib/utils/cn';

export type DocumentEditorProps = {
  /**
   * Seeds the editor once, on mount. Tiptap's own state (ProseMirror) owns the
   * document after that — this is not a controlled `value`, the same way a
   * <textarea defaultValue> is not. A caller that needs to replace the whole
   * document later (loading it asynchronously, switching editor mode) should
   * remount this component with a fresh `key` rather than rely on this prop
   * changing in place.
   */
  initialContent: TinyPasteDoc;
  onChange: (doc: TinyPasteDoc) => void;
  readOnly?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  onSubmit?: () => void;
  className?: string;
};

/**
 * Tiptap, wired into TinyPaste's DOCUMENT mode.
 *
 * lib/document/extensions.ts is the one place the supported node/mark set is
 * declared — the same list lib/document/schema.ts validates against on the
 * server, so nothing this editor can produce is ever rejected by that schema.
 */
export function DocumentEditor({
  initialContent,
  onChange,
  readOnly = false,
  autoFocus = false,
  placeholder,
  onSubmit,
  className,
}: DocumentEditorProps) {
  const editor = useEditor({
    // Avoids a Next.js SSR hydration mismatch: Tiptap renders nothing on the
    // server and mounts its real DOM only after the client takes over.
    immediatelyRender: false,
    extensions: createDocumentExtensions({ placeholder }),
    content: initialContent as object,
    editable: !readOnly,
    autofocus: autoFocus ? 'end' : false,
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON() as TinyPasteDoc),
    editorProps: {
      attributes: { class: 'tp-doc-surface' },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          onSubmit?.();
          return true;
        }
        return false;
      },
    },
  });

  // The editor instance is stable for the component's lifetime; only its
  // editable flag needs to track a prop that can change after mount.
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {readOnly ? null : <DocumentToolbar editor={editor} />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}
