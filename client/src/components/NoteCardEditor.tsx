import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent } from 'react';
import { continueListItem } from '../editorText';
import { getClipboardImageFiles, uploadImageFile } from '../imageUpload';
import type { Note } from '../types';

type NoteCardEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  notes?: Note[];
  uploadUrl?: string;
  placeholder?: string;
  saveLabel?: string;
  cancelLabel?: string;
  autoFocus?: boolean;
};

export default function NoteCardEditor({
  value,
  onChange,
  onSave,
  onCancel,
  notes = [],
  uploadUrl = 'http://localhost:5005/api/upload',
  placeholder = '编辑笔记内容...',
  saveLabel = '保存',
  cancelLabel = '取消',
  autoFocus = true,
}: NoteCardEditorProps) {
  const [showEmbedPicker, setShowEmbedPicker] = useState(false);
  const [embedSearch, setEmbedSearch] = useState('');
  const [embedTriggerIdx, setEmbedTriggerIdx] = useState(-1);
  const [selectedEmbedIndex, setSelectedEmbedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const embedSuggestions = showEmbedPicker ? notes.filter(note => {
    const search = embedSearch.toLowerCase();
    return (
      note.id.toLowerCase().includes(search) ||
      note.content.toLowerCase().includes(search) ||
      note.tags.some(tag => tag.toLowerCase().includes(search))
    );
  }).slice(0, 5) : [];

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (showEmbedPicker && !target.closest('.card-linker-dropdown') && !target.closest('.card-inline-editor')) {
        setShowEmbedPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmbedPicker]);

  const detectEmbedTrigger = (nextValue: string, cursorIdx: number) => {
    const textBeforeCursor = nextValue.slice(0, cursorIdx);
    const lastEmbedIdx = textBeforeCursor.lastIndexOf('{{');

    if (lastEmbedIdx === -1) {
      setShowEmbedPicker(false);
      return;
    }

    const queryPart = textBeforeCursor.slice(lastEmbedIdx + 2);
    const hasSpace = /\s/.test(queryPart);
    const isClosed = queryPart.includes('}}');

    if (!hasSpace && !isClosed) {
      setShowEmbedPicker(true);
      setEmbedSearch(queryPart);
      setEmbedTriggerIdx(lastEmbedIdx);
      setSelectedEmbedIndex(0);
    } else {
      setShowEmbedPicker(false);
    }
  };

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    onChange(nextValue);
    detectEmbedTrigger(nextValue, e.target.selectionStart);
  };

  const insertCardEmbed = (targetId: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const currentValue = textarea.value;
    const embedString = `{{${targetId}}} `;
    const nextValue = currentValue.slice(0, embedTriggerIdx) + embedString + currentValue.slice(textarea.selectionEnd);

    onChange(nextValue);
    setShowEmbedPicker(false);
    setEmbedSearch('');

    setTimeout(() => {
      textarea.focus();
      const nextCursor = embedTriggerIdx + embedString.length;
      textarea.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  };

  const insertText = (before: string, after = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const nextValue = textarea.value.substring(0, start) + before + selected + after + textarea.value.substring(end);

    onChange(nextValue);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  };

  const adjustListIndent = (outdent = false) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const lineEndMatch = value.indexOf('\n', selectionEnd);
    const lineEnd = lineEndMatch === -1 ? value.length : lineEndMatch;
    const block = value.slice(lineStart, lineEnd);
    let delta = 0;

    const nextBlock = block.split('\n').map((line) => {
      if (outdent) {
        if (line.startsWith('  ')) {
          delta -= 2;
          return line.slice(2);
        }
        if (line.startsWith('\t')) {
          delta -= 1;
          return line.slice(1);
        }
        return line;
      }
      delta += 2;
      return `  ${line}`;
    }).join('\n');

    onChange(value.slice(0, lineStart) + nextBlock + value.slice(lineEnd));

    setTimeout(() => {
      textarea.focus();
      const nextStart = Math.max(lineStart, selectionStart + (outdent ? Math.max(delta, -2) : 2));
      textarea.setSelectionRange(nextStart, Math.max(nextStart, selectionEnd + delta));
    }, 0);
  };

  const continueListOnEnter = () => {
    const textarea = textareaRef.current;
    if (!textarea) return false;

    const result = continueListItem(value, textarea.selectionStart, textarea.selectionEnd);
    if (!result) return false;

    onChange(result.value);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    }, 0);

    return true;
  };

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const uploadAndInsertImages = async (files: File[]) => {
    if (files.length === 0) return;

    try {
      const urls = await Promise.all(files.map(file => uploadImageFile(file, uploadUrl)));
      insertText(urls.map(url => `![image](${url})`).join('\n'));
    } catch (err) {
      console.error('Upload error:', err);
      alert('上传图片出错，请检查后端服务连接。');
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(file => file.type.startsWith('image/'));
    await uploadAndInsertImages(files);
    e.target.value = '';
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = getClipboardImageFiles(e.clipboardData);
    if (imageFiles.length === 0) return;

    e.preventDefault();
    await uploadAndInsertImages(imageFiles);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ position: 'relative' }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleTextChange}
          onPaste={handlePaste}
          className="card-inline-editor"
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (showEmbedPicker && embedSuggestions.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedEmbedIndex(prev => (prev + 1) % embedSuggestions.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedEmbedIndex(prev => (prev - 1 + embedSuggestions.length) % embedSuggestions.length);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const selectedSuggestion = embedSuggestions[selectedEmbedIndex];
                if (selectedSuggestion) insertCardEmbed(selectedSuggestion.id);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setShowEmbedPicker(false);
              }
              if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) return;
            } else if (e.key === 'Tab') {
              e.preventDefault();
              adjustListIndent(e.shiftKey);
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              onSave();
            }
            if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey) && continueListOnEnter()) {
              e.preventDefault();
            }
          }}
        />
        {showEmbedPicker && embedSuggestions.length > 0 && (
          <div className="card-linker-dropdown">
            {embedSuggestions.map((suggestion, index) => {
              const previewText = suggestion.content.length > 40
                ? suggestion.content.slice(0, 40) + '...'
                : suggestion.content;
              return (
                <div
                  key={suggestion.id}
                  className={`linker-suggestion-item ${index === selectedEmbedIndex ? 'active' : ''}`}
                  onClick={() => insertCardEmbed(suggestion.id)}
                >
                  <span className="linker-id-badge">嵌入 #{suggestion.id.slice(0, 8)}</span>
                  <span className="linker-text-preview">{previewText}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="editor-footer">
        <div className="editor-toolbar">
          <button type="button" className="toolbar-btn" title="插入标签" onClick={() => insertText('#')}>
            #
          </button>
          <button type="button" className="toolbar-btn" title="文字加粗" onClick={() => insertText('**', '**')}>
            Aa
          </button>
          <button type="button" className="toolbar-btn" title="无序列表" onClick={() => insertText('- ')}>
            •—
          </button>
          <button type="button" className="toolbar-btn" title="有序列表" onClick={() => insertText('1. ')}>
            1.
          </button>
          <button type="button" className="toolbar-btn" title="减少缩进" onClick={() => adjustListIndent(true)}>
            ⇤
          </button>
          <button type="button" className="toolbar-btn" title="增加缩进" onClick={() => adjustListIndent()}>
            ⇥
          </button>
          <button type="button" className="toolbar-btn" title="上传图片" onClick={handleImageUploadClick}>
            🖼️
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            multiple
            style={{ display: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            className="submit-btn"
            style={{ backgroundColor: 'var(--text-light)' }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onSave}
            className="submit-btn"
            disabled={!value.trim()}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
