import { useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';

type NoteCardEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
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
  uploadUrl = 'http://localhost:5005/api/upload',
  placeholder = '编辑笔记内容...',
  saveLabel = '保存',
  cancelLabel = '取消',
  autoFocus = true,
}: NoteCardEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json() as { url: string };
        insertText(`![image](${data.url})`);
      } else {
        alert('图片上传失败，请重试。');
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('上传图片出错，请检查后端服务连接。');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="card-inline-editor"
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            onSave();
          }
        }}
      />
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
          <button type="button" className="toolbar-btn" title="上传图片" onClick={handleImageUploadClick}>
            🖼️
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
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
