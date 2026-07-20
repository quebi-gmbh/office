/**
 * Hook used by each tool to receive a file handed off from the workspace
 * sidebar. On mount (and whenever a new file is handed off) it consumes any
 * pending open targeting this tool, resolves the underlying `File` via the
 * file's provider, and calls the tool-specific `handler`.
 *
 * The `ref` is passed through so the tool can keep it and write edits back to
 * the same file on Save (via `writeText` / `writeBlob` from `provider.ts`).
 */
import { useEffect } from "react";
import { readFile } from "./provider";
import { consumePendingOpen, useWorkspace } from "./store";
import type { ToolId } from "./routing";
import type { WsFileRef } from "./types";

export interface OpenedFile {
  ref: WsFileRef;
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
        const file = await readFile(pending.ref);
        if (cancelled) return;
        await handler({ ref: pending.ref, name: pending.ref.name, file });
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
