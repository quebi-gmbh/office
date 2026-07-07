/**
 * Hook used by each tool to receive a file handed off from the workspace
 * sidebar. On mount it consumes any pending open targeting this tool, resolves
 * the underlying `File`, and calls the tool-specific `handler` so the tool can
 * load it however it likes (text, image bitmap, parsed rows, …).
 *
 * The `handle` is passed through so the tool can keep it and write edits back
 * to the same file on Save.
 */
import { useEffect } from "react";
import { consumePendingOpen, useWorkspace } from "./store";
import type { ToolId } from "./routing";

export interface OpenedFile {
  handle: FileSystemFileHandle;
  name: string;
  file: File;
}

export function usePendingFileOpen(
  tool: ToolId,
  handler: (opened: OpenedFile) => void | Promise<void>,
): void {
  // Re-run whenever a new file is handed off — including when the target tool is
  // already mounted (navigating to the same route doesn't remount it).
  const { pendingNonce } = useWorkspace();
  useEffect(() => {
    const pending = consumePendingOpen(tool);
    if (!pending) return;
    let cancelled = false;
    void (async () => {
      try {
        const file = await pending.handle.getFile();
        if (cancelled) return;
        await handler({ handle: pending.handle, name: pending.name, file });
      } catch (e) {
        console.warn("Failed to open workspace file:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Keyed on the handoff nonce; handler captured intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNonce]);
}

/** Write text back to a file handle (Save). */
export async function writeTextToHandle(
  handle: FileSystemFileHandle,
  text: string,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

/** Write a Blob back to a file handle (Save, for binary formats). */
export async function writeBlobToHandle(
  handle: FileSystemFileHandle,
  blob: Blob,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}
