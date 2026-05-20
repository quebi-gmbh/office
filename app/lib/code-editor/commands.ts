/**
 * Central command registry for the code editor command palette.
 * Every menu action, language switch, theme switch, and settings toggle
 * is registered here so the command palette can list and invoke them.
 */
import type { FileMenuAction } from "./file-menu";

export type CommandContext = {
  /** Trigger a File-menu action */
  fileAction: (a: FileMenuAction) => void;
  /** Switch editor language */
  setLanguage: (id: string) => void;
  /** Open settings drawer */
  openSettings: (focus?: string) => void;
  /** Copy as Markdown / HTML */
  copyMarkdown: () => void;
  copyHtml: () => void;
};

export type Command = {
  id: string;
  title: string;
  group: string;
  shortcut?: string;
  run: (ctx: CommandContext) => void;
};

// ── Static commands ───────────────────────────────────────────────────────────
export const coreCommands: Command[] = [
  // File
  { id: "open",        group: "File", title: "Open file…",        shortcut: "Ctrl+O",       run: (c) => c.fileAction("open")        },
  { id: "open-url",    group: "File", title: "Open from URL…",                               run: (c) => c.fileAction("open-url")    },
  { id: "download",    group: "File", title: "Download",                                     run: (c) => c.fileAction("download")    },
  { id: "save",        group: "File", title: "Save",               shortcut: "Ctrl+S",       run: (c) => c.fileAction("save")        },
  { id: "share",       group: "File", title: "Share via URL…",                               run: (c) => c.fileAction("share")       },
  { id: "print",       group: "File", title: "Print",              shortcut: "Ctrl+P",       run: (c) => c.fileAction("print")       },
  { id: "export-png",  group: "File", title: "Export as PNG",                                run: (c) => c.fileAction("export-png")  },
  // Edit / Copy
  { id: "copy-md",     group: "Edit", title: "Copy as Markdown",                             run: (c) => c.copyMarkdown()            },
  { id: "copy-html",   group: "Edit", title: "Copy as HTML",                                 run: (c) => c.copyHtml()                },
  // Settings
  { id: "settings",    group: "Settings", title: "Open settings",  shortcut: "Ctrl+,",       run: (c) => c.openSettings()           },
  { id: "set-indent",  group: "Settings", title: "Change indent style",                      run: (c) => c.openSettings("files.indent")  },
  { id: "set-eol",     group: "Settings", title: "Change line endings",                      run: (c) => c.openSettings("files.eol")     },
  { id: "set-theme",   group: "Settings", title: "Change theme",                             run: (c) => c.openSettings("theme.mode")    },
  { id: "set-keymap",  group: "Settings", title: "Change keymap",                            run: (c) => c.openSettings("keymap")        },
  { id: "set-wrap",    group: "Settings", title: "Toggle word wrap",                         run: (c) => c.openSettings("editor.wrap")   },
];

import { languages } from "./languages";

/** Generate language-switch commands from the language registry. */
export function languageCommands(): Command[] {
  return languages.map((l) => ({
    id: `lang-${l.id}`,
    group: "Language",
    title: `Set language: ${l.label}`,
    run: (c: CommandContext) => c.setLanguage(l.id),
  }));
}

export function allCommands(): Command[] {
  return [...coreCommands, ...languageCommands()];
}
