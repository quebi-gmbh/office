# Workspaces: open any folder (local or Google Drive) as a cross-route workspace

## Summary

Let users open **any folder as a workspace** — either a **local folder** (already
supported, File System Access API) or a **Google Drive folder** (new) — and use
that workspace across every tool route (`/code`, `/docs`, `/paint`, `/table`,
`/pdf`, `/typst`). The workspace sidebar is persistent across routes. From the
sidebar users can **open, create, rename and delete** files. Clicking a file
opens it in the tool that matches its format (navigating to that route with the
file loaded); an unsupported **Drive** file instead links out to Google Drive.

This is an **extension of the existing local-folder workspace**, not a greenfield
build. The main new work is (a) a provider abstraction so the same sidebar/tools
work over both local and Drive backends, (b) file CRUD, (c) wiring the two
remaining tools (PDF, Typst), and (d) the Google Drive provider itself.

## Current state (what already exists)

- **Sidebar**: `app/components/WorkspaceSidebar.tsx`, mounted persistently in
  `app/root.tsx` inside `<ClientOnly>{() => <WorkspaceSidebar />}</ClientOnly>`
  (outside `<Outlet/>`, so it survives navigation).
- **Store**: `app/lib/workspace/store.ts` — `useSyncExternalStore` singleton
  holding `{ root handle, tree, status, activePath, pendingNonce }` plus the
  one-shot "pending open" handoff (`setPendingOpen` / `consumePendingOpen`).
- **FS layer**: `app/lib/workspace/fs.ts` — `pickDirectory` (`showDirectoryPicker`),
  `readDirectoryTree`, `verifyPermission`, and IndexedDB persistence of the root
  handle (via `app/paint/io/idb.ts`).
- **Handoff/save**: `app/lib/workspace/use-open.ts` — `usePendingFileOpen(tool, handler)`,
  `writeTextToHandle`, `writeBlobToHandle` (all built on `FileSystemFileHandle`).
- **Format→tool routing**: `app/lib/workspace/routing.ts` — `resolveTool(name)`,
  `TOOL_PATH`, `TOOL_LABEL`, `ToolId = "code" | "docs" | "paint" | "table"`.
- **Tools already wired**: code, docs, paint, table each call
  `usePendingFileOpen(...)` and implement a `saveToWorkspace*()` write-back.

### Gaps this issue closes

1. Everything is hard-coupled to `FileSystemFileHandle` (local only, Chromium-only).
2. No Google Drive backend.
3. No create / rename / delete — read + save-back only.
4. `/pdf` and `/typst` are **not** in `ToolId` and receive no workspace handoffs.
5. Unsupported files render a disabled row; no "open in Drive" affordance.

## Goals / acceptance criteria

- [ ] Sidebar lets the user open a workspace from **Local folder** or **Google
      Drive** (source picker). Local stays Chromium-gated; Drive works on any
      browser that can run the OAuth/Picker flow.
- [ ] The chosen workspace (either source) shows a file tree and persists across
      route navigations and reloads (re-auth/re-permission on return).
- [ ] Clicking a file opens it in the matching tool **and navigates to that
      route** with the file loaded (existing behavior, generalized to Drive).
- [ ] Editing + Save writes back to the original file (local disk or Drive).
- [ ] Users can **create**, **rename** and **delete** files (and create folders)
      from the sidebar, on both backends.
- [ ] Opening a file whose format maps to a different tool opens the correct
      route (e.g. a `.png` in the tree → `/paint`). Ambiguous types keep the
      existing "open with…" menu.
- [ ] An **unsupported Drive file** shows an "Open in Google Drive" link
      (`webViewLink`) instead of a disabled row. Unsupported local files stay
      disabled (no web URL) — optionally offer a download.
- [ ] `/pdf` and `/typst` participate as tools (open + save-back).
- [ ] Drive uses the non-restricted **`drive.file`** scope (folder-scoped grant),
      so no Google CASA security assessment is required.

## Design: a `WorkspaceProvider` abstraction

Introduce a provider interface so the sidebar, store, tools and CRUD are backend-
agnostic. Local wraps today's `fs.ts`; Drive is new.

```ts
// app/lib/workspace/provider.ts
export type WsSource = "local" | "drive";

/** Opaque, provider-scoped reference to a file. Replaces raw FileSystemFileHandle
 *  in the tree, handoff, and save-back paths. */
export interface WsFileRef {
  source: WsSource;
  id: string;         // local: path; drive: fileId
  name: string;
  path: string;       // relative path for tree + activePath highlight
  mimeType?: string;
  webUrl?: string;    // drive: webViewLink (used for unsupported files)
}

export interface WsDirRef {
  source: WsSource;
  id: string;         // local: path; drive: folderId
  name: string;
  path: string;
}

export interface WorkspaceProvider {
  source: WsSource;
  supported(): boolean;
  /** Prompt user to choose a root folder. */
  pickRoot(): Promise<WsDirRef | null>;
  listTree(root: WsDirRef): Promise<WorkspaceEntry[]>;   // entries carry WsFileRef
  readFile(ref: WsFileRef): Promise<File>;
  writeText(ref: WsFileRef, text: string): Promise<void>;
  writeBlob(ref: WsFileRef, blob: Blob): Promise<void>;
  createFile(parent: WsDirRef, name: string, content?: Blob | string): Promise<WsFileRef>;
  createDir(parent: WsDirRef, name: string): Promise<WsDirRef>;
  rename(ref: WsFileRef | WsDirRef, newName: string): Promise<WsFileRef | WsDirRef>;
  remove(ref: WsFileRef | WsDirRef): Promise<void>;
  // persistence for "reopen last workspace"
  persistRoot(root: WsDirRef): Promise<void>;
  loadRoot(): Promise<WsDirRef | null>;
  clearRoot(): Promise<void>;
}
```

- `WorkspaceEntry` (fs.ts) changes its file variant from `handle: FileSystemFileHandle`
  to `ref: WsFileRef`. The directory variant carries a `WsDirRef`.
- `store.ts` holds the active `WorkspaceProvider` instead of a bare
  `FileSystemDirectoryHandle`, and delegates `openFolder`/`refresh`/`reopen`/CRUD
  to it.
- `PendingOpen` carries a `WsFileRef` (not a handle). `usePendingFileOpen`
  resolves the `File` via `provider.readFile(ref)`; tools keep the `ref` and save
  back via `provider.writeText/Blob(ref, …)`.
- Tools (`CodeEditorScreen`, `DocEditor`, `PaintApp`, `TableApp`) swap their
  `wsHandleRef: FileSystemFileHandle` for a `WsFileRef` and call the provider's
  write helpers. Behavior is otherwise unchanged.

### Local provider

Thin wrapper over existing `fs.ts`. `WsFileRef.id` = relative path; keep a
path→`FileSystemFileHandle` map (or resolve handles lazily by walking from the
root) so `readFile`/`writeText` still use `getFile()` / `createWritable()`.
CRUD uses `getFileHandle(name,{create:true})`, `removeEntry(name,{recursive})`,
and copy+delete for rename (the FS Access API has no atomic rename).

### Drive provider (new)

- **Auth**: Google Identity Services token client (browser-only, no client
  secret). Scope: `https://www.googleapis.com/auth/drive.file`. Token held in
  memory; silent re-auth on expiry (~1h).
- **Pick root**: Google Picker in folder-select mode (`ViewId.FOLDERS`, folder
  selection enabled). Selecting a folder grants `drive.file` access to that
  folder **and its descendants** (this is why `drive.file` is sufficient — no
  restricted scope, no CASA).
- **List tree**: Drive REST `files.list` with
  `q="'<folderId>' in parents and trashed=false"`, `fields=files(id,name,mimeType,webViewLink)`;
  recurse into child folders (`mimeType == application/vnd.google-apps.folder`).
  Lazy-load: list metadata only; fetch bytes on open. Respect the existing
  `MAX_DEPTH` / `MAX_ENTRIES` caps.
- **Read**: `files.get?alt=media` → `Blob` → wrap as `File`.
- **Write/save-back**: `PATCH .../upload/files/{id}?uploadType=media`.
- **Create**: multipart create with `parents:[folderId]`.
- **Rename**: `PATCH files/{id}` with `{ name }`.
- **Delete**: `files.delete` (or trash).
- **Persist**: store `{ source:"drive", rootFolderId, rootName }` in IndexedDB;
  on return re-auth (needs a click) and re-list. Google-native docs (Docs/Sheets/
  Slides) are not byte-readable — surface them as unsupported → link to `webUrl`.

### Routing / open behavior

- Add PDF + Typst to `routing.ts`:
  - `ToolId = "code" | "docs" | "paint" | "table" | "pdf" | "typst"`.
  - `TOOL_PATH.pdf = "/pdf"`, `TOOL_PATH.typst = "/typst"` (+ labels).
  - `PRIMARY.pdf = "pdf"`; `PRIMARY.typ = "typst"`, `PRIMARY.typst = "typst"`.
  - Images already map to paint; PDF's image handling can stay a `pdf` alternative
    if desired.
- Wire the two tools:
  - `app/pdf/ui/PdfApp.tsx` + `app/pdf/io/` — add `usePendingFileOpen("pdf", …)`
    and a `saveToWorkspaceFile()` write-back.
  - `app/typst/TypstEditorScreen.tsx` — add `usePendingFileOpen("typst", …)` and
    save-back of the `.typ` source.
- Unsupported file rows: in `WorkspaceSidebar.tsx`/`TreeNode`, when
  `resolveTool(name).primary === null` and the entry's `ref.source === "drive"`
  and `ref.webUrl` exists → render an anchor "Open in Google Drive" (`target=_blank`)
  instead of the disabled button. Local unsupported stays disabled.

## Work breakdown (suggested PR sequence)

1. **Provider abstraction refactor (no behavior change).** Add `provider.ts`,
   `WsFileRef`/`WsDirRef`; convert `WorkspaceEntry`, `store.ts`, `use-open.ts`,
   and the 4 wired tools to refs behind a Local provider that wraps `fs.ts`.
2. **File CRUD on Local.** `createFile`/`createDir`/`rename`/`remove` in provider
   + sidebar UI (new-file/new-folder buttons, per-row rename/delete context menu,
   inline rename, delete confirm). Refresh tree after mutation.
3. **Wire PDF + Typst.** `routing.ts` additions + `usePendingFileOpen` + save-back
   in both tools.
4. **Google Drive provider.** GIS auth + Picker folder select + Drive REST
   list/read/write/CRUD. Sidebar source switcher (Local / Google Drive). Env-based
   config for client id / api key / project number.
5. **Unsupported Drive files → "Open in Google Drive" link.**

## Non-goals / caveats

- **No push sync.** Drive change webhooks need a server; client-only polls
  `files.list` / the Changes feed or refreshes on focus.
- **Token lifetime** ~1h with silent re-auth; no offline/refresh token without a
  backend.
- **Google-native docs** (Docs/Sheets/Slides) aren't raw-byte editable here — they
  are "unsupported" and link out to Drive.
- **Local workspace** remains Chromium-only (File System Access API); Drive is the
  cross-browser path.
- Drive config values (client id, API key, project number) are **public** by
  design (client-side app); they must be locked down by authorized-origin
  restrictions, not kept secret.

## Manual Google Cloud setup (owner action — see checklist below)

Tracked so implementation isn't blocked:

- [ ] Create a Google Cloud project.
- [ ] Enable **Google Drive API** and **Google Picker API**.
- [ ] Configure the **OAuth consent screen** (External): app name, support email,
      app logo/domain; add scope `.../auth/drive.file`; add test users for dev.
- [ ] Create an **OAuth 2.0 Client ID** (type: Web application). Authorized
      JavaScript origins: `https://office.quebi.de` and the local dev origin
      (e.g. `http://localhost:5173`).
- [ ] Create an **API key** (used by the Picker), restricted to the Picker API and
      the same origins/referrers.
- [ ] Note the **project number** (Picker `appId`).
- [ ] Verify domain ownership of `office.quebi.de` (Search Console) so the app can
      move from "testing" to "in production" for external users.
- [ ] Provide `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`,
      `VITE_GOOGLE_PROJECT_NUMBER` for local `.env` and the GitHub Pages build.
