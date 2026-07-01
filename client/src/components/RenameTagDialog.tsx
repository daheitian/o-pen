import { useEffect, useId, useRef, useState } from 'react';

type RenameTagDialogProps = {
  tagName: string;
  onCancel: () => void;
  onConfirm: (newName: string) => void;
};

export default function RenameTagDialog({ tagName, onCancel, onConfirm }: RenameTagDialogProps) {
  const [value, setValue] = useState(tagName);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    setValue(tagName);
    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [tagName]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const trimmed = value.trim().replace(/^#/, '');
  const canSubmit = Boolean(trimmed && trimmed !== tagName);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form
        className="confirm-delete-dialog rename-tag-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          onConfirm(trimmed);
        }}
      >
        <h3 id={titleId}>重命名标签</h3>
        <p id={descriptionId}>输入新的标签名，回车或点击保存即可。</p>
        <div className="rename-tag-field">
          <span>#</span>
          <input
            ref={inputRef}
            className="rename-tag-input"
            type="text"
            value={value}
            placeholder="标签名"
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="confirm-delete-actions">
          <button type="button" className="cancel-btn" onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="submit-btn" disabled={!canSubmit}>
            保存
          </button>
        </div>
      </form>
    </div>
  );
}
