import { useEffect, useId } from 'react';

type ConfirmDeleteDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  preview?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDeleteDialog({
  title,
  description,
  confirmLabel,
  preview,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <section
        className="confirm-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId}>{title}</h3>
        <p id={descriptionId}>{description}</p>
        {preview && (
          <div className="confirm-delete-preview">
            {preview.length > 120 ? `${preview.slice(0, 120)}...` : preview}
          </div>
        )}
        <div className="confirm-delete-actions">
          <button type="button" className="cancel-btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="danger-btn" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
