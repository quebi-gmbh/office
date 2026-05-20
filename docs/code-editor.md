# Code editor — reference

The `/code` tool is a fully client-side code editor built on [CodeMirror 6](https://codemirror.net/).  
No data is sent anywhere — documents and settings live in your browser's `localStorage`.

---

## Settings reference

Open the settings drawer with the gear icon or **Ctrl-,**.

### Editor

| Key | Default | Description |
|-----|---------|-------------|
| `editor.wrap` | `"off"` | `"off"` = no wrap, `"soft"` = soft-wrap at viewport edge |
| `editor.activeLine` | `true` | Highlight the line the cursor is on |
| `editor.brackets` | `true` | Auto-close bracket pairs `()`, `[]`, `{}`, `""`, `''` |
| `editor.diagnostics` | `true` | Inline squiggles + diagnostics panel (JSON, JS/TS, YAML) |

### Display

| Key | Default | Description |
|-----|---------|-------------|
| `display.fontFamily` | `"system"` | `"system"`, `"jetbrains-mono"`, or `"fira-code"` |
| `display.fontSize` | `14` | Font size in px (8–32) |
| `display.lineHeight` | `1.6` | CSS line-height multiplier (1–3) |
| `display.lineNumbers` | `true` | Show line numbers in the gutter |
| `display.indentGuides` | `false` | Indentation level markers (lazy chunk) |
| `display.whitespace` | `false` | Render whitespace characters |
| `display.trailingWhitespace` | `false` | Highlight trailing whitespace |
| `display.minimap` | `false` | Overview minimap in the right gutter (lazy chunk) |

### Files

| Key | Default | Description |
|-----|---------|-------------|
| `files.indent` | `"spaces"` | `"spaces"` or `"tabs"` |
| `files.tabWidth` | `2` | Spaces per indent level (1–8) |
| `files.autoDetectIndent` | `true` | Detect indent style from document content |
| `files.eol` | `"auto"` | `"auto"` preserves the document's style; `"lf"` or `"crlf"` force |
| `files.finalNewline` | `false` | Append a trailing newline on export |
| `files.trimTrailingOnExport` | `false` | Strip trailing whitespace on save / download |
| `files.autosaveMs` | `1000` | Draft autosave interval — `0` = disabled, `500`, `1000`, or `5000` ms |
| `files.restoreLanguage` | `true` | Restore the last-used language on page load |

### Format

| Key | Default | Description |
|-----|---------|-------------|
| `format.onSave` | `false` | Run Prettier before each save / download (for supported languages) |

### Theme

| Key | Default | Description |
|-----|---------|-------------|
| `theme.mode` | `"auto"` | `"auto"` follows `prefers-color-scheme`; `"light"` or `"dark"` force |

### Keymap

| Key | Default | Description |
|-----|---------|-------------|
| `keymap` | `"default"` | `"default"`, `"vim"`, or `"emacs"` (lazy chunks) |

Settings are stored under `office:code:settings` in `localStorage` and survive page reloads. The schema version is stamped on every write so future migrations can upgrade stored data automatically.

---

## Language support

### Eager (always bundled)

| Language | IDs / extensions |
|----------|-----------------|
| Plain text | `plaintext` / `.txt` |
| JavaScript / TypeScript | `javascript` / `.js .jsx .ts .tsx .mjs .cjs` |
| JSON | `json` / `.json` |
| Markdown | `markdown` / `.md .markdown` |
| HTML | `html` / `.html .htm` |
| CSS | `css` / `.css` |
| Python | `python` / `.py .pyw` |
| SQL | `sql` / `.sql` |

### Lazy (separate async chunk, fetched on first use)

| Language | IDs / extensions |
|----------|-----------------|
| C / C++ | `cpp` / `.c .cpp .h .hpp .cc` |
| Java | `java` / `.java` |
| Rust | `rust` / `.rs` |
| Go | `go` / `.go` |
| PHP | `php` / `.php` |
| XML | `xml` / `.xml .svg` |
| Shell | `shell` / `.sh .bash .zsh` |
| Dockerfile | `dockerfile` / `Dockerfile` |
| TOML | `toml` / `.toml` |
| YAML | `yaml` / `.yaml .yml` |
| Lua | `lua` / `.lua` |
| Ruby | `ruby` / `.rb` |

The active language is persisted under `office:code:lang` and restored on load (when `files.restoreLanguage` is `true`).

---

## Keybinding cheat sheet

### Default keymap

| Binding | Action |
|---------|--------|
| `Ctrl-O` / `Cmd-O` | Open file |
| `Ctrl-S` / `Cmd-S` | Save / download |
| `Ctrl-,` / `Cmd-,` | Open settings |
| `Ctrl-Shift-P` / `Cmd-Shift-P` | Open command palette |
| `Shift-Alt-F` | Format document (Prettier) |
| `Ctrl-K V` | Toggle Markdown preview |
| `Ctrl-Z` | Undo |
| `Ctrl-Y` / `Ctrl-Shift-Z` | Redo |
| `Ctrl-F` | Find |
| `Ctrl-H` | Find & replace |
| `Ctrl-/` | Toggle line comment |
| `Tab` | Indent selection or insert indent |
| `Shift-Tab` | Outdent |
| `Ctrl-Click` | Add cursor |
| `Ctrl-D` | Select next occurrence |

### Vim mode

When **Keymap → Vim** is selected the standard Vim modal bindings are active (normal / insert / visual / command modes). The vim chunk is fetched once and cached.

### Emacs mode

When **Keymap → Emacs** is selected, standard Emacs keybindings (`Ctrl-N/P/F/B`, `Ctrl-A/E`, `Ctrl-K`, `Meta-…`, etc.) are active.

---

## Share URL format

**File → Share via URL…** gzip-compresses the document, base64url-encodes it, and puts it in the URL hash so the link is entirely self-contained:

```
https://office.quebi.de/code#doc=<base64url(gzip(text))>&lang=<langId>
```

**Encoding steps:**

1. Encode document text as UTF-8 bytes.
2. Compress with `CompressionStream("gzip")`.
3. Convert compressed bytes → base64url (standard base64 with `+→-`, `/→_`, `=` stripped).
4. Build `URLSearchParams({ doc: b64, lang: langId })` and set as `location.hash`.

**Decoding on load (inverted):**

1. Parse `location.hash` via `URLSearchParams`.
2. Pad base64url back to standard base64 (`-→+`, `_→/`).
3. Decompress with `DecompressionStream("gzip")`.
4. Decode UTF-8 text.

A warning toast is shown when the gzipped payload exceeds 50 KB, since very long URLs may break in some browsers or URL-shortening services.

---

## Command palette

Open with **Ctrl-Shift-P** (or **Cmd-Shift-P** on macOS). Type to filter with fuzzy matching (powered by [fuzzysort](https://github.com/farzher/fuzzysort)). Navigate with ↑/↓, execute with Enter, dismiss with Esc.

Commands are grouped into: **File**, **Edit**, **Settings**, **Language**.

---

## Inline diagnostics

When `editor.diagnostics` is enabled, the editor shows inline squiggles for:

| Language | Engine |
|----------|--------|
| JSON | Built-in `JSON.parse` |
| JavaScript | [acorn](https://github.com/acornjs/acorn) (lazy chunk) |
| TypeScript | acorn (JS-compatible subset only; TS-specific syntax is not flagged) |
| YAML | [js-yaml](https://github.com/nodeca/js-yaml) (lazy chunk) |

---

## Formatting

**Shift-Alt-F** formats the entire document using [Prettier](https://prettier.io/). Supported languages:

| Language | Prettier parser |
|----------|----------------|
| JavaScript | `babel` |
| TypeScript | `typescript` |
| HTML | `html` |
| CSS | `css` |
| Markdown | `markdown` |
| YAML | `yaml` |
| JSON | `json` |

All Prettier plugins are lazy-loaded — only the plugin for the active language is fetched.  
**Format on save** (`settings.format.onSave`) runs Prettier automatically before every File → Save or File → Download.

---

## Storage keys

| Key | Contents |
|-----|----------|
| `office:code:draft` | Last document text (autosaved) |
| `office:code:settings` | Serialised `CodeSettings` JSON |
| `office:code:lang` | Last-used language ID |
