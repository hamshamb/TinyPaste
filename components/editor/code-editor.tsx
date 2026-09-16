'use client';

import { useCallback, useEffect, useRef } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditorNs } from 'monaco-editor';
import { ensureMonacoEnvironment } from '@/lib/client/monaco-setup';
import { toMonacoLanguage } from '@/lib/paste/monaco-language-map';

/**
 * Configured at module scope, not inside an effect: React runs a child's
 * mount effect before its parent's, and @monaco-editor/react's own <Editor>
 * starts loading the AMD bundle from *its* mount effect. Anything in
 * CodeEditor's own useEffect would therefore run too late to redirect that
 * first request away from the CDN default. Module evaluation happens before
 * any of this file's components ever render, so this always wins the race.
 */
ensureMonacoEnvironment();

export type CursorPosition = { line: number; column: number };

/**
 * TinyPaste's two themes rendered in Monaco's own terms, so the editor never
 * looks like a foreign widget dropped into the page. Registered once, on
 * first mount, via `beforeMount` — Monaco needs a live editor namespace to
 * define a theme against, so this cannot run at module scope.
 */
function defineThemes(monaco: Monaco): void {
  monaco.editor.defineTheme('tinypaste-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0d0e11',
      'editor.foreground': '#f4f4f5',
      'editorLineNumber.foreground': '#4a4d57',
      'editorLineNumber.activeForeground': '#9599a3',
      'editor.lineHighlightBackground': '#ffffff0a',
      'editor.lineHighlightBorder': '#00000000',
      'editorCursor.foreground': '#9177ff',
      'editor.selectionBackground': '#7c5cfc40',
      'editor.inactiveSelectionBackground': '#7c5cfc26',
      'editorIndentGuide.background1': '#ffffff14',
      'editorIndentGuide.activeBackground1': '#ffffff2a',
      'editorWhitespace.foreground': '#ffffff1a',
      'editorGutter.background': '#0d0e11',
      'scrollbarSlider.background': '#ffffff1a',
      'scrollbarSlider.hoverBackground': '#ffffff2a',
      'editorWidget.background': '#14151a',
      'editorWidget.border': '#ffffff14',
      'editorSuggestWidget.background': '#14151a',
      'editorHoverWidget.background': '#14151a',
    },
  });

  monaco.editor.defineTheme('tinypaste-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#17171a',
      'editorLineNumber.foreground': '#c2c3c9',
      'editorLineNumber.activeForeground': '#5b5e69',
      'editor.lineHighlightBackground': '#0000000a',
      'editor.lineHighlightBorder': '#00000000',
      'editorCursor.foreground': '#6544e8',
      'editor.selectionBackground': '#6544e830',
      'editor.inactiveSelectionBackground': '#6544e81a',
      'editorIndentGuide.background1': '#0000000f',
      'editorIndentGuide.activeBackground1': '#00000024',
      'editorGutter.background': '#ffffff',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#0000001a',
    },
  });
}

export type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** A lib/paste/languages.ts id — translated to Monaco's own id internally. */
  language: string;
  theme: 'light' | 'dark';
  wordWrap: boolean;
  /** Off by default per design — see components/editor/code-editor-toolbar.tsx. */
  minimap?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  onCursorChange?: (position: CursorPosition) => void;
  /** Ctrl/Cmd+Enter is the app's own "create/save" shortcut, not Monaco's. */
  onSubmit?: () => void;
  className?: string;
};

/**
 * Monaco, configured the way lib/client/monaco-setup.ts requires and wired
 * into TinyPaste's controlled-value editing model.
 *
 * Deliberately thin: every editing behaviour in the CODE MODE requirements
 * (bracket matching, multi-cursor, find/replace, auto-closing pairs, current
 * line highlight…) is a Monaco default, not something this component
 * reimplements. What it owns is theme, language mapping, the toolbar-facing
 * cursor/word-wrap props, and keeping Ctrl/Cmd+Enter as TinyPaste's shortcut
 * rather than a Monaco command.
 */
export function CodeEditor({
  value,
  onChange,
  language,
  theme,
  wordWrap,
  minimap = false,
  readOnly = false,
  autoFocus = false,
  onCursorChange,
  onSubmit,
  className,
}: CodeEditorProps) {
  const editorRef = useRef<MonacoEditorNs.IStandaloneCodeEditor | null>(null);

  // Options that can change after mount are pushed imperatively — passing a
  // fresh `options` object every render would otherwise fight Monaco's own
  // internal option diffing on every keystroke.
  useEffect(() => {
    editorRef.current?.updateOptions({ wordWrap: wordWrap ? 'on' : 'off', minimap: { enabled: minimap } });
  }, [wordWrap, minimap]);

  const handleMount = useCallback<OnMount>(
    (editorInstance, monaco) => {
      editorRef.current = editorInstance;

      const report = () => {
        const position = editorInstance.getPosition();
        if (position) onCursorChange?.({ line: position.lineNumber, column: position.column });
      };
      report();
      editorInstance.onDidChangeCursorPosition(report);

      // The app's own create/save shortcut always wins over any Monaco default
      // bound to the same combination.
      editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onSubmit?.());

      if (autoFocus) editorInstance.focus();
    },
    [onCursorChange, onSubmit, autoFocus],
  );

  return (
    <Editor
      value={value}
      onChange={(next) => onChange(next ?? '')}
      language={toMonacoLanguage(language)}
      theme={theme === 'dark' ? 'tinypaste-dark' : 'tinypaste-light'}
      beforeMount={defineThemes}
      onMount={handleMount}
      className={className}
      loading={<div className="flex h-full items-center justify-center text-sm text-text-subtle">Loading editor…</div>}
      options={{
        readOnly,
        automaticLayout: true,
        minimap: { enabled: minimap },
        wordWrap: wordWrap ? 'on' : 'off',
        fontSize: 13,
        lineHeight: 22,
        fontFamily:
          "ui-monospace, 'SF Mono', 'SFMono-Regular', 'JetBrains Mono', 'Cascadia Code', 'Cascadia Mono', 'Fira Code', 'Roboto Mono', Menlo, Consolas, 'Liberation Mono', monospace",
        fontLigatures: false,
        tabSize: 2,
        insertSpaces: true,
        // Every one of these is a genuine Monaco default already; listed
        // explicitly so the requirement they satisfy is traceable at a glance.
        lineNumbers: 'on',
        matchBrackets: 'always',
        autoIndent: 'full',
        autoClosingBrackets: 'languageDefined',
        autoClosingQuotes: 'languageDefined',
        renderLineHighlight: 'all',
        selectionHighlight: true,
        occurrencesHighlight: 'singleFile',
        multiCursorModifier: 'alt',
        find: { addExtraSpaceOnTop: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        padding: { top: 14, bottom: 14 },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        renderWhitespace: 'selection',
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      }}
    />
  );
}
