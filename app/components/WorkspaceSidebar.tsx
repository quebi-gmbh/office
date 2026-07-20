/**
 * Workspace sidebar — open a local folder or a Google Drive folder and work with
 * its files across every tool route.
 *
 * Rendered in the root layout (inside <ClientOnly>) so the workspace survives
 * route navigation. Clicking a file opens it in the matching tool; unsupported
 * Drive files link out to Google Drive. Files can be created, renamed and
 * deleted from here.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  File as FileIcon,
  FilePlus,
  FolderOpen,
  FolderPlus,
  MoreVertical,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  closeWorkspace,
  createDirIn,
  createFileIn,
  getRoot,
  hasPersistedWorkspace,
  openWorkspace,
  refreshWorkspace,
  removeEntry,
  renameEntry,
  reopenLastWorkspace,
  resolveTool,
  setActivePath,
  setPendingOpen,
  TOOL_LABEL,
  TOOL_PATH,
  useWorkspace,
  type ToolId,
  type WorkspaceEntry,
  type WsDirRef,
  type WsFileRef,
} from "../lib/workspace";

export function WorkspaceSidebar() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [canReopen, setCanReopen] = useState(false);

  // Check once whether a workspace from a previous visit can be re-opened.
  useEffect(() => {
    let alive = true;
    void hasPersistedWorkspace().then((has) => {
      if (alive) setCanReopen(has);
    });
    return () => {
      alive = false;
    };
  }, [ws.status]);

  if (!ws.supported) return null;

  function openInTool(ref: WsFileRef, tool: ToolId) {
    setPendingOpen({ tool, ref });
    setActivePath(ref.path);
    void navigate(TOOL_PATH[tool]);
  }

  const rootRef = getRoot();

  async function newFile(parent: WsDirRef) {
    const name = prompt("New file name:");
    if (!name) return;
    await createFileIn(parent, name, "");
  }
  async function newFolder(parent: WsDirRef) {
    const name = prompt("New folder name:");
    if (!name) return;
    await createDirIn(parent, name);
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
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          {ws.source === "drive" && <Cloud size={13} aria-hidden />}
          <span className="truncate">
            {ws.status === "ready" && ws.rootName ? ws.rootName : "Workspace"}
          </span>
        </span>
        <div className="flex items-center gap-0.5">
          {ws.status === "ready" && rootRef && (
            <>
              <button
                type="button"
                onClick={() => void newFile(rootRef)}
                title="New file"
                className="rounded p-1 text-muted hover:bg-bg hover:text-fg"
              >
                <FilePlus size={14} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => void newFolder(rootRef)}
                title="New folder"
                className="rounded p-1 text-muted hover:bg-bg hover:text-fg"
              >
                <FolderPlus size={14} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => void refreshWorkspace()}
                title="Refresh"
                className="rounded p-1 text-muted hover:bg-bg hover:text-fg"
              >
                <RefreshCw size={14} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => void closeWorkspace()}
                title="Close workspace"
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
                Access to the last workspace was denied.
              </p>
            )}
            {ws.localSupported && (
              <button
                type="button"
                onClick={() => void openWorkspace("local")}
                className="flex items-center justify-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-sm hover:border-accent"
              >
                <FolderOpen size={16} aria-hidden /> Open local folder
              </button>
            )}
            {ws.driveSupported && (
              <button
                type="button"
                onClick={() => void openWorkspace("drive")}
                className="flex items-center justify-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-sm hover:border-accent"
              >
                <Cloud size={16} aria-hidden /> Open Google Drive
              </button>
            )}
            {canReopen && (
              <button
                type="button"
                onClick={() => void reopenLastWorkspace()}
                className="text-xs text-accent hover:underline"
              >
                Reopen last workspace
              </button>
            )}
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Click a file to open it in the matching tool; edits save straight
              back.
            </p>
          </div>
        ) : ws.status === "loading" ? (
          <p className="p-2 text-xs text-muted">Reading workspace…</p>
        ) : ws.status === "error" ? (
          <p className="p-2 text-xs text-red-400">
            Couldn't read workspace: {ws.error}
          </p>
        ) : ws.tree.length === 0 ? (
          <p className="p-2 text-xs text-muted">This folder is empty.</p>
        ) : rootRef ? (
          <ul>
            {ws.tree.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                parentDir={rootRef}
                depth={0}
                activePath={ws.activePath}
                onOpen={openInTool}
                onNewFile={newFile}
                onNewFolder={newFolder}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}

function RowMenu({ children }: { children: React.ReactNode }) {
  return (
    <details className="relative shrink-0">
      <summary className="cursor-pointer list-none rounded px-0.5 text-muted opacity-0 hover:text-fg group-hover:opacity-100">
        <MoreVertical size={14} aria-hidden />
      </summary>
      <div className="absolute right-0 z-10 mt-1 min-w-32 rounded-md border border-border bg-card py-1 shadow-lg">
        {children}
      </div>
    </details>
  );
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: (close: () => void) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        const details = e.currentTarget.closest("details") as HTMLDetailsElement;
        onClick(() => {
          details.open = false;
        });
      }}
      className="flex w-full items-center gap-1.5 px-3 py-1 text-left text-xs hover:bg-bg"
    >
      {children}
    </button>
  );
}

function TreeNode({
  entry,
  parentDir,
  depth,
  activePath,
  onOpen,
  onNewFile,
  onNewFolder,
}: {
  entry: WorkspaceEntry;
  parentDir: WsDirRef;
  depth: number;
  activePath: string | null;
  onOpen: (ref: WsFileRef, tool: ToolId) => void;
  onNewFile: (parent: WsDirRef) => void;
  onNewFolder: (parent: WsDirRef) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const pad = { paddingLeft: `${depth * 12 + 6}px` };

  async function rename() {
    const next = prompt("Rename to:", entry.name);
    if (!next || next === entry.name) return;
    if (entry.kind === "file") await renameEntry(parentDir, entry.ref, next);
  }
  async function remove() {
    if (!confirm(`Delete “${entry.name}”?`)) return;
    await removeEntry(parentDir, entry.ref);
  }

  if (entry.kind === "directory") {
    return (
      <li>
        <div
          style={pad}
          className="group flex items-center gap-1 rounded pr-1 text-muted hover:bg-bg hover:text-fg"
        >
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left"
          >
            {expanded ? (
              <ChevronDown size={14} aria-hidden />
            ) : (
              <ChevronRight size={14} aria-hidden />
            )}
            <span className="truncate">{entry.name}</span>
          </button>
          <RowMenu>
            <MenuItem
              onClick={(close) => {
                close();
                onNewFile(entry.ref);
              }}
            >
              <FilePlus size={12} aria-hidden /> New file
            </MenuItem>
            <MenuItem
              onClick={(close) => {
                close();
                onNewFolder(entry.ref);
              }}
            >
              <FolderPlus size={12} aria-hidden /> New folder
            </MenuItem>
            <MenuItem
              onClick={(close) => {
                close();
                void remove();
              }}
            >
              <Trash2 size={12} aria-hidden /> Delete
            </MenuItem>
          </RowMenu>
        </div>
        {expanded && entry.children.length > 0 && (
          <ul>
            {entry.children.map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                parentDir={entry.ref}
                depth={depth + 1}
                activePath={activePath}
                onOpen={onOpen}
                onNewFile={onNewFile}
                onNewFolder={onNewFolder}
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
  const driveWebUrl =
    entry.ref.source === "drive" ? entry.ref.webUrl : undefined;

  return (
    <li>
      <div
        style={pad}
        className={`group flex items-center gap-1 rounded pr-1 ${
          isActive ? "bg-bg text-accent" : ""
        }`}
      >
        {openable ? (
          <button
            type="button"
            onClick={() => primary && onOpen(entry.ref, primary)}
            title={`Open in ${TOOL_LABEL[primary]}`}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-1 text-left hover:text-accent"
          >
            <FileIcon size={13} aria-hidden className="shrink-0" />
            <span className="truncate">{entry.name}</span>
          </button>
        ) : driveWebUrl ? (
          <a
            href={driveWebUrl}
            target="_blank"
            rel="noreferrer"
            title="Open in Google Drive"
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-1 text-left text-muted hover:text-accent"
          >
            <FileIcon size={13} aria-hidden className="shrink-0" />
            <span className="truncate">{entry.name}</span>
          </a>
        ) : (
          <span
            title="No tool can open this file type"
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-1 text-left text-muted opacity-60"
          >
            <FileIcon size={13} aria-hidden className="shrink-0" />
            <span className="truncate">{entry.name}</span>
          </span>
        )}
        <RowMenu>
          {openable &&
            alternatives.length > 0 &&
            primary &&
            [primary, ...alternatives].map((tool) => (
              <MenuItem
                key={tool}
                onClick={(close) => {
                  close();
                  onOpen(entry.ref, tool);
                }}
              >
                Open in {TOOL_LABEL[tool]}
              </MenuItem>
            ))}
          <MenuItem
            onClick={(close) => {
              close();
              void rename();
            }}
          >
            <Pencil size={12} aria-hidden /> Rename
          </MenuItem>
          <MenuItem
            onClick={(close) => {
              close();
              void remove();
            }}
          >
            <Trash2 size={12} aria-hidden /> Delete
          </MenuItem>
        </RowMenu>
      </div>
    </li>
  );
}
