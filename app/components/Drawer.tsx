/**
 * Generic slide-in drawer from the right side.
 * Uses a native <dialog> for focus trapping and Esc-to-close.
 */
import { useEffect, useRef } from "react";
import type { FC, PropsWithChildren } from "react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Extra action for the header row (e.g. a "Reset" button). */
  headerAction?: React.ReactNode;
};

export const Drawer: FC<PropsWithChildren<DrawerProps>> = ({
  open,
  onClose,
  title,
  headerAction,
  children,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [open]);

  // Close on click outside (native dialog backdrop click)
  const handleClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    const outside =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom;
    if (outside) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleClick}
      onClose={onClose}
      className="fixed inset-y-0 right-0 m-0 h-full w-[360px] max-w-full border-l border-border bg-bg p-0 shadow-2xl open:flex open:flex-col backdrop:bg-black/30 transition-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="m-0 text-base font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          {headerAction}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded p-1 text-muted hover:bg-border hover:text-fg transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
    </dialog>
  );
};
