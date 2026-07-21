/**
 * Intercepts in-app navigations (and tab close) while the active editor has
 * unsaved changes, showing a Save / Discard / Cancel prompt. Mounted once in the
 * root layout, inside <ClientOnly> (useBlocker is client-only).
 */
import { useEffect } from "react";
import { useBlocker } from "react-router";
import {
  currentName,
  isCurrentlyDirty,
  saveCurrent,
} from "~/lib/workspace/dirty-guard";
import { UnsavedChangesModal } from "./UnsavedChangesModal";

export function NavigationGuard() {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isCurrentlyDirty() &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  // Native prompt for full page unload / refresh / close.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isCurrentlyDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const blocked = blocker.state === "blocked";

  return (
    <UnsavedChangesModal
      open={blocked}
      name={currentName()}
      onSave={async () => {
        const ok = await saveCurrent();
        if (ok) blocker.proceed?.();
        else blocker.reset?.();
      }}
      onDiscard={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    />
  );
}
