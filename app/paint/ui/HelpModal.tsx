/**
 * Keyboard shortcut help modal.
 * Auto-generated from the SHORTCUTS registry — adding a binding updates this table automatically.
 * Toggled by pressing '?' or clicking the help button in the toolbar.
 */
import { useEffect, useRef } from "react";
import { SHORTCUTS, modLabel } from "~/paint/lib/shortcuts";

interface HelpModalProps {
  onClose(): void;
}

const GROUPS: Array<{ key: string; label: string }> = [
  { key: "tools",  label: "Tools" },
  { key: "edit",   label: "Edit" },
  { key: "colour", label: "Colour" },
  { key: "view",   label: "View" },
  { key: "file",   label: "File" },
  { key: "help",   label: "Help" },
];

function formatKeys(keys: string): string {
  return keys
    .replace("Mod", modLabel())
    .replace("Shift", "⇧")
    .replace("Alt", "⌥")
    .replace("Escape", "Esc")
    .split("+")
    .join(" + ");
}

export function HelpModal({ onClose }: HelpModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.showModal();
      const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
      dialog.addEventListener("cancel", onCancel);
      return () => dialog.removeEventListener("cancel", onCancel);
    }
  }, [onClose]);

  // Filter out internal-only duplicates (redo-alt, backspace duplicate of delete).
  const visible = SHORTCUTS.filter((s) => s.id !== "redo-y" && s.id !== "delete-backspace");

  return (
    <dialog ref={dialogRef} className="paint-modal" onClick={(e) => {
      if (e.target === dialogRef.current) onClose();
    }}>
      <div className="paint-modal__content">
        <div className="paint-modal__header">
          <h2 className="paint-modal__title">Keyboard shortcuts</h2>
          <button type="button" className="paint-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="paint-modal__body">
          {GROUPS.map(({ key, label }) => {
            const group = visible.filter((s) => s.group === key);
            if (group.length === 0) return null;
            return (
              <section key={key} className="paint-modal__group">
                <h3 className="paint-modal__group-title">{label}</h3>
                <table className="paint-modal__table">
                  <tbody>
                    {group.map((s) => (
                      <tr key={s.id}>
                        <td className="paint-modal__key"><kbd>{formatKeys(s.keys)}</kbd></td>
                        <td className="paint-modal__desc">{s.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}
