import React, { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import './MarkdownEditor.css';

interface MarkdownEditorProps {
  value: string;
  onChange: (content: string) => void;
  onSave?: (content: string) => void;
  placeholder?: string;
  autoSave?: boolean;
  autoSaveDelay?: number;
}

/**
 * CodeMirror 6 based Markdown Editor
 * Typora-style WYSIWYG markdown editing
 */
export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  onSave,
  placeholder = 'Start typing...',
  autoSave = true,
  autoSaveDelay = 2000,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!containerRef.current) return;

    // Create EditorState with initial content
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        markdown(),
        keymap.of([indentWithTab]),
        // Custom markdown shortcuts
        keymap.of([
          {
            key: 'Ctrl-b',
            run: () => {
              insertMarkdown('**', '**');
              return true;
            },
          },
          {
            key: 'Ctrl-i',
            run: () => {
              insertMarkdown('*', '*');
              return true;
            },
          },
          {
            key: 'Ctrl-`',
            run: () => {
              insertMarkdown('`', '`');
              return true;
            },
          },
          {
            key: 'Ctrl-Shift-`',
            run: () => {
              insertMarkdown('```\n', '\n```');
              return true;
            },
          },
          {
            key: 'Ctrl-s',
            run: () => {
              onSave?.(editorRef.current?.state.doc.toString() || '');
              return true;
            },
          },
        ]),
        // Update handler
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newContent = update.state.doc.toString();
            onChange(newContent);

            // Auto-save
            if (autoSave && autoSaveDelay > 0) {
              clearTimeout(autoSaveTimerRef.current);
              autoSaveTimerRef.current = setTimeout(() => {
                onSave?.(newContent);
              }, autoSaveDelay);
            }
          }
        }),
      ],
    });

    // Create editor view
    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    editorRef.current = view;

    // Helper to insert markdown syntax
    function insertMarkdown(before: string, after: string) {
      const view = editorRef.current;
      if (!view) return;

      const { state } = view;
      const { from, to } = state.selection.main;
      const selectedText = state.sliceDoc(from, to);

      const newText = before + selectedText + after;
      view.dispatch({
        changes: { from, to, insert: newText },
        selection: {
          anchor: from + before.length,
          head: from + before.length + selectedText.length,
        },
      });
    }

    // Cleanup
    return () => {
      view.destroy();
      clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // Update content from outside
  useEffect(() => {
    if (editorRef.current) {
      const currentDoc = editorRef.current.state.doc.toString();
      if (currentDoc !== value) {
        editorRef.current.dispatch({
          changes: {
            from: 0,
            to: currentDoc.length,
            insert: value,
          },
        });
      }
    }
  }, [value]);

  return (
    <div className="markdown-editor" ref={containerRef} />
  );
};

export default MarkdownEditor;
