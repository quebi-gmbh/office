/**
 * Workspace sidebar — pick a local folder and open its files in the matching
 * tool with a single click.
 *
 * Rendered in the root layout (inside <ClientOnly>) so the folder + tree survive
 * route navigation. Depends on the File System Access API and therefore renders
 * nothing on browsers that don't support it (Firefox, Safari).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FolderOpen,
  PanelLeft,
  PanelLeftClose,
  RefreshCw,
  X,
} from "lucide-react";
import {
  closeFolder,
  hasPersistedFolder,
  openFolder,
  refreshFolder,
  reopenLastFolder,
  setActivePath,
  setPendingOpen,
  TOOL_LABEL,
  TOOL_PATH,
  resolveTool,
  useWorkspace,
  type ToolId,
  type WorkspaceEntry,
} from "../lib/workspace";

export function WorkspaceSidebar() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [canReopen, setCanReopen] = useState(false);

  // Check once whether a folder from a previous visit can be re-opened.
  useEffect(() => {
    let alive = true;
    void hasPersistedFolder().then((has) => {
      if (alive) setCanReopen(has);
    });
    return () => {
      alive = false;
    };
  }, [ws.status]);

  if (!ws.supported) return null;

  function open(entry: Extract<WorkspaceEntry, { kind: "file" }>, tool: ToolId) {
    setPendingOpen({ tool, name: entry.name, handle: entry.handle });
    setActivePath(entry.path);
    void navigate(TOOL_PATH[tool]);
  }

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-r border-border bg-card py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Show workspace"
          className="rounded-md p-1.5 text-muted hover:bg-bg hover:text-fg"
        >
          <PanelLeft size={18} aria-hidden />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-1 border-b border-border px-3 py-2">
        <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted">
          {ws.status === "ready" && ws.rootName ? ws.rootName : "Workspace"}
        </span>
        <div className="flex items-center gap-0.5">
          {ws.status === "ready" && (
            <>
              <button
                type="button"
                onClick={() => void refreshFolder()}
                title="Refresh"
                className="rounded p-1 text-muted hover:bg-bg hover:text-fg"
              >
                <RefreshCw size={14} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => void closeFolder()}
                title="Close folder"
                className="rounded p-1 text-muted hover:bg-bg hover:text-fg"
              >
                <X size={14} aria-hidden />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="Hide workspace"
            className="rounded p-1 text-muted hover:bg-bg hover:text-fg"
          >
            <PanelLeftClose size={14} aria-hidden />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto p-2 text-sm">
        {ws.status === "idle" || ws.status === "denied" ? (
          <div className="flex flex-col gap-2 p-2">
            {ws.status === "denied" && (
              <p className="text-xs text-muted">
                Permission to the last folder was denied.
              </p>
            )}
            <button
              type="button"
              onClick={() => void openFolder()}
              className="flex items-center justify-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-sm hover:border-accent"
            >
              <FolderOpen size={16} aria-hidden /> Open folder
            </button>
            {canReopen && (
              <button
                type="button"
                onClick={() => void reopenLastFolder()}
                className="text-xs text-accent hover:underline"
              >
                Reopen last folder
              </button>
            )}
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Files stay on your device. Click a file to open it in the matching
              tool; edits save straight back.
            </p>
          </div>
        ) : ws.status === "loading" ? (
          <p className="p-2 text-xs text-muted">Reading folder…</p>
        ) : ws.status === "error" ? (
          <p className="p-2 text-xs text-red-400">
            Couldn't read folder: {ws.error}
          </p>
        ) : ws.tree.length === 0 ? (
          <p className="p-2 text-xs text-muted">This folder is empty.</p>
        ) : (
          <ul>
            {ws.tree.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                activePath={ws.activePath}
                onOpen={open}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function TreeNode({
  entry,
  depth,
  activePath,
  onOpen,
}: {
  entry: WorkspaceEntry;
  depth: number;
  activePath: string | null;
  onOpen: (
    entry: Extract<WorkspaceEntry, { kind: "file" }>,
    tool: ToolId,
  ) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const pad = { paddingLeft: `${depth * 12 + 6}px` };

  if (entry.kind === "directory") {
    return (
      <li>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={pad}
          className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-muted hover:bg-bg hover:text-fg"
        >
          {expanded ? (
            <ChevronDown size={14} aria-hidden />
          ) : (
            <ChevronRight size={14} aria-hidden />
          )}
          <span className="truncate">{entry.name}</span>
        </button>
        {expanded && entry.children.length > 0 && (
          <ul>
            {entry.children.map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                activePath={activePath}
                onOpen={onOpen}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const { primary, alternatives } = resolveTool(entry.name);
  const openable = primary !== null;
  const isActive = activePath === entry.path;

  return (
    <li>
      <div
        style={pad}
        className={`group flex items-center gap-1 rounded pr-1 ${
          isActive ? "bg-bg text-accent" : ""
        }`}
      >
        <button
          type="button"
          disabled={!openable}
          onClick={() => primary && onOpen(entry, primary)}
          title={
            openable
              ? `Open in ${TOOL_LABEL[primary]}`
              : "No tool can open this file type"
          }
          className={`flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-1 text-left ${
            openable
              ? "hover:text-accent"
              : "cursor-default text-muted opacity-60"
          }`}
        >
          <FileIcon size={13} aria-hidden className="shrink-0" />
          <span className="truncate">{entry.name}</span>
        </button>
        {openable && alternatives.length > 0 && (
          <details className="relative shrink-0">
            <summary className="cursor-pointer list-none rounded px-1 text-xs text-muted opacity-0 hover:text-fg group-hover:opacity-100">
              ⋯
            </summary>
            <div className="absolute right-0 z-10 mt-1 min-w-28 rounded-md border border-border bg-card py-1 shadow-lg">
              {[primary, ...alternatives].map((tool) => (
                <button
                  key={tool}
                  type="button"
                  onClick={(e) => {
                    // Close the <details> then open.
                    (
                      e.currentTarget.closest("details") as HTMLDetailsElement
                    ).open = false;
                    onOpen(entry, tool);
                  }}
                  className="block w-full px-3 py-1 text-left text-xs hover:bg-bg"
                >
                  Open in {TOOL_LABEL[tool]}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    </li>
  );
}
