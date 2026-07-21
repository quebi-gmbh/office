/**
 * Local Dialog primitive — mirrors the composition of the quebi ui-lib
 * (Dialog / DialogHeader / DialogTitle / DialogDescription / DialogBody /
 * DialogFooter / DialogClose / DialogCloseIcon) but is a self-contained modal
 * overlay styled with this app's theme tokens (no react-aria-components).
 *
 *   <Dialog open={open} onClose={close}>
 *     <DialogHeader title="…" description="…" />
 *     <DialogBody>…</DialogBody>
 *     <DialogFooter>
 *       <DialogClose>Cancel</DialogClose>
 *       <Button intent="primary" onClick={…}>Confirm</Button>
 *     </DialogFooter>
 *   </Dialog>
 */
import {
  createContext,
  useContext,
  useEffect,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Button, type ButtonIntent } from "./Button";

const DialogCtx = createContext<{ close: () => void }>({ close: () => {} });

export function Dialog({
  open,
  onClose,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <DialogCtx.Provider value={{ close: onClose }}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onMouseDown={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          className={`w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl ${className}`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </DialogCtx.Provider>
  );
}

export function DialogHeader({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-3">
      {title && <DialogTitle>{title}</DialogTitle>}
      {description && <DialogDescription>{description}</DialogDescription>}
      {children}
    </div>
  );
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-semibold text-fg">{children}</h2>;
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-muted">{children}</p>;
}

export function DialogBody({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`text-sm ${className}`} {...props} />;
}

export function DialogFooter({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`mt-4 flex justify-end gap-2 ${className}`} {...props} />;
}

/** A button that closes the dialog (and runs an optional onClick first). */
export function DialogClose({
  children,
  intent = "ghost",
  onClick,
}: {
  children: ReactNode;
  intent?: ButtonIntent;
  onClick?: () => void;
}) {
  const { close } = useContext(DialogCtx);
  return (
    <Button
      intent={intent}
      onClick={() => {
        onClick?.();
        close();
      }}
    >
      {children}
    </Button>
  );
}

/** Corner dismiss "×" — shown when the dialog is dismissable. */
export function DialogCloseIcon({ isDismissable = true }: { isDismissable?: boolean }) {
  const { close } = useContext(DialogCtx);
  if (!isDismissable) return null;
  return (
    <button
      type="button"
      onClick={close}
      aria-label="Close"
      className="absolute right-3 top-3 rounded p-1 text-muted hover:bg-bg hover:text-fg"
    >
      <X size={16} aria-hidden />
    </button>
  );
}
