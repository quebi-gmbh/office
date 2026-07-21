/** Save / Discard / Cancel prompt shown when leaving a document with unsaved changes. */
import { Button } from "./ui/Button";
import { Dialog, DialogFooter, DialogHeader } from "./ui/Dialog";

export function UnsavedChangesModal({
  open,
  name,
  onSave,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  name: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel}>
      <DialogHeader
        title="Unsaved changes"
        description={`You have unsaved changes in “${name}”. Save them before leaving?`}
      />
      <DialogFooter>
        <Button intent="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button intent="danger" onClick={onDiscard}>
          Discard
        </Button>
        <Button intent="primary" onClick={onSave}>
          Save
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
