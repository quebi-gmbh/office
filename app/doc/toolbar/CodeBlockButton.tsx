/**
 * Code block toggle button with an optional language selector.
 * When the cursor is inside a code block, shows a compact language <select>.
 */
import type { Editor } from "@tiptap/react";
import { Code2 } from "lucide-react";
import { ToolBtn } from "../Toolbar";
import { KNOWN_LANGUAGES, loadLanguage } from "../lowlight";

// De-duplicate display list (remove alias pairs like "js"/"javascript")
const DISPLAY_LANGS = [
  "javascript",
  "typescript",
  "json",
  "markdown",
  "html",
  "css",
  "python",
  "sql",
  "bash",
  "c",
  "cpp",
  "csharp",
  "go",
  "java",
  "kotlin",
  "rust",
  "ruby",
  "php",
  "swift",
  "yaml",
  "toml",
  "dockerfile",
  "graphql",
  "scala",
  "r",
  "lua",
  "perl",
  "haskell",
].filter((l) => KNOWN_LANGUAGES.includes(l));

interface CodeBlockButtonProps {
  editor: Editor;
}

export function CodeBlockButton({ editor }: CodeBlockButtonProps) {
  const inCodeBlock = editor.isActive("codeBlock");
  const currentLang =
    (editor.getAttributes("codeBlock").language as string | undefined) ?? "";

  async function handleLangChange(lang: string) {
    await loadLanguage(lang);
    editor
      .chain()
      .focus()
      .updateAttributes("codeBlock", { language: lang || null })
      .run();
  }

  return (
    <div className="flex items-center gap-0.5">
      <ToolBtn
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={inCodeBlock}
        title="Code block"
      >
        <Code2 size={13} />
      </ToolBtn>

      {inCodeBlock && (
        <select
          value={currentLang}
          onChange={(e) => void handleLangChange(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          title="Code block language"
          aria-label="Code block language"
          className="h-7 rounded border border-border bg-card px-1 text-xs hover:border-accent focus:border-accent focus:outline-none"
        >
          <option value="">Plain text</option>
          {DISPLAY_LANGS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
