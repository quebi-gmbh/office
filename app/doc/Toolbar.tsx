import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Redo,
  RemoveFormatting,
  Settings,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
  Undo,
} from "lucide-react";
import { SwatchPicker } from "./toolbar/SwatchPicker";
import { TableControls } from "./toolbar/TableControls";
import { ImageButton } from "./toolbar/ImageButton";

interface Props {
  editor: Editor;
  onSettingsClick?: () => void;
}

/** Base button class — mirrors the established app button style. */
const BTN =
  "inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-card transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40";

/** Additional classes when a mark/node is active. */
const ACTIVE = "border-accent text-accent bg-card";

export function ToolBtn({
  onClick,
  active = false,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Prevent the editor from losing focus
        e.preventDefault();
        onClick();
      }}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`${BTN} ${active ? ACTIVE : ""}`}
    >
      {children}
    </button>
  );
}

export function Divider() {
  return <span className="mx-0.5 h-5 w-px self-center bg-border" aria-hidden />;
}

/** Prompt-based link dialog. Returns undefined if cancelled. */
function promptLink(currentUrl: string): string | undefined {
  const url = window.prompt("Link URL:", currentUrl);
  if (url === null) return undefined; // cancelled
  return url.trim();
}

export function Toolbar({ editor, onSettingsClick }: Props) {
  const headingLevel = [1, 2, 3, 4, 5, 6].find((l) =>
    editor.isActive("heading", { level: l }),
  );
  const headingValue = headingLevel ? String(headingLevel) : "0";

  function handleHeadingChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const level = Number(e.target.value);
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor
        .chain()
        .focus()
        .toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
        .run();
    }
  }

  function handleLink() {
    const current = editor.isActive("link")
      ? (editor.getAttributes("link").href as string) ?? ""
      : "";
    const url = promptLink(current);
    if (url === undefined) return; // cancelled
    if (url === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }

  // Active text color / highlight color for the swatch pickers
  const activeTextColor =
    (editor.getAttributes("textStyle").color as string | undefined) ?? null;
  const activeHighlightColor =
    (editor.getAttributes("highlight").color as string | undefined) ?? null;

  return (
    <div
      role="toolbar"
      aria-label="Formatting toolbar"
      className="flex flex-wrap items-center gap-1 border-b border-border bg-bg px-3 py-1.5"
    >
      {/* Undo / Redo */}
      <ToolBtn
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo"
      >
        <Undo size={13} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo"
      >
        <Redo size={13} />
      </ToolBtn>

      <Divider />

      {/* Block type */}
      <select
        value={headingValue}
        onChange={handleHeadingChange}
        onMouseDown={(e) => e.stopPropagation()}
        title="Block type"
        aria-label="Block type"
        className="h-7 rounded border border-border bg-card px-1.5 text-xs hover:border-accent focus:border-accent focus:outline-none"
      >
        <option value="0">Paragraph</option>
        <option value="1">Heading 1</option>
        <option value="2">Heading 2</option>
        <option value="3">Heading 3</option>
        <option value="4">Heading 4</option>
        <option value="5">Heading 5</option>
        <option value="6">Heading 6</option>
      </select>

      <Divider />

      {/* Inline marks */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Bold"
      >
        <Bold size={13} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italic"
      >
        <Italic size={13} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Underline"
      >
        <Underline size={13} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
        title="Strikethrough"
      >
        <Strikethrough size={13} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        active={editor.isActive("superscript")}
        title="Superscript"
      >
        <Superscript size={13} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        active={editor.isActive("subscript")}
        title="Subscript"
      >
        <Subscript size={13} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive("code")}
        title="Inline code"
      >
        <Code size={13} />
      </ToolBtn>

      <Divider />

      {/* Text color */}
      <SwatchPicker
        label={
          <span
            className="text-xs font-bold"
            style={{ color: activeTextColor ?? "currentColor" }}
          >
            A
          </span>
        }
        title="Text color"
        activeColor={activeTextColor}
        onPick={(color) => editor.chain().focus().setColor(color).run()}
        onClear={() => editor.chain().focus().unsetColor().run()}
      />

      {/* Highlight */}
      <SwatchPicker
        label={
          <span
            className="text-xs font-bold"
            style={{
              backgroundColor: activeHighlightColor ?? "transparent",
              padding: "0 2px",
            }}
          >
            H
          </span>
        }
        title="Highlight color"
        activeColor={activeHighlightColor}
        onPick={(color) =>
          editor.chain().focus().toggleHighlight({ color }).run()
        }
        onClear={() => editor.chain().focus().unsetHighlight().run()}
      />

      <Divider />

      {/* Text alignment */}
      <ToolBtn
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
        title="Align left"
      >
        <AlignLeft size={13} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
        title="Align center"
      >
        <AlignCenter size={13} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
        title="Align right"
      >
        <AlignRight size={13} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        active={editor.isActive({ textAlign: "justify" })}
        title="Justify"
      >
        <AlignJustify size={13} />
      </ToolBtn>

      <Divider />

      {/* Lists */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Bullet list"
      >
        <List size={13} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Numbered list"
      >
        <ListOrdered size={13} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive("taskList")}
        title="Task list"
      >
        <ListTodo size={13} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        title="Blockquote"
      >
        <Quote size={13} />
      </ToolBtn>

      <Divider />

      {/* Link */}
      <ToolBtn
        onClick={handleLink}
        active={editor.isActive("link")}
        title={editor.isActive("link") ? "Edit / remove link" : "Insert link"}
      >
        <Link size={13} />
      </ToolBtn>

      <Divider />

      {/* Table */}
      <TableControls editor={editor} />

      {/* Image */}
      <ImageButton editor={editor} />

      <Divider />

      {/* Clear formatting */}
      <ToolBtn
        onClick={() =>
          editor.chain().focus().clearNodes().unsetAllMarks().run()
        }
        title="Clear formatting"
      >
        <RemoveFormatting size={13} />
      </ToolBtn>

      {/* Spacer + Settings — pushed to right */}
      {onSettingsClick && (
        <>
          <span className="ml-auto" aria-hidden />
          <Divider />
          <ToolBtn onClick={onSettingsClick} title="Settings (Ctrl+,)">
            <Settings size={13} />
          </ToolBtn>
        </>
      )}
    </div>
  );
}
