/**
 * Table toolbar controls.
 *
 * Shows an "Insert table" button always. When the cursor is inside a table,
 * also shows a small set of row/column/delete actions in a compact dropdown.
 */
import { useState, useRef, useEffect } from "react";
import type { Editor } from "@tiptap/react";
import { Table, ChevronDown } from "lucide-react";
import { ToolBtn } from "../Toolbar";

interface TableControlsProps {
  editor: Editor;
}

export function TableControls({ editor }: TableControlsProps) {
  const inTable = editor.isActive("table");
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function insertTable() {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  return (
    <div className="relative flex items-center gap-0.5" ref={menuRef}>
      {/* Insert table */}
      <ToolBtn onClick={insertTable} active={inTable} title="Insert / select table">
        <Table size={13} />
      </ToolBtn>

      {/* Table actions dropdown — only when cursor is inside a table */}
      {inTable && (
        <>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen((v) => !v);
            }}
            title="Table actions"
            aria-label="Table actions"
            aria-expanded={open}
            aria-haspopup="menu"
            className="inline-flex h-7 w-4 items-center justify-center rounded border border-border bg-card transition-colors hover:border-accent"
          >
            <ChevronDown size={10} />
          </button>

          {open && (
            <div
              role="menu"
              className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded border border-border bg-bg py-1 shadow-lg"
            >
              {[
                {
                  label: "Add row above",
                  run: () => editor.chain().focus().addRowBefore().run(),
                },
                {
                  label: "Add row below",
                  run: () => editor.chain().focus().addRowAfter().run(),
                },
                {
                  label: "Delete row",
                  run: () => editor.chain().focus().deleteRow().run(),
                },
                null, // separator
                {
                  label: "Add column before",
                  run: () => editor.chain().focus().addColumnBefore().run(),
                },
                {
                  label: "Add column after",
                  run: () => editor.chain().focus().addColumnAfter().run(),
                },
                {
                  label: "Delete column",
                  run: () => editor.chain().focus().deleteColumn().run(),
                },
                null, // separator
                {
                  label: "Toggle header row",
                  run: () => editor.chain().focus().toggleHeaderRow().run(),
                },
                {
                  label: "Delete table",
                  run: () => editor.chain().focus().deleteTable().run(),
                  danger: true,
                },
              ].map((item, i) => {
                if (!item) {
                  return (
                    <div
                      key={i}
                      className="my-1 h-px bg-border"
                      role="separator"
                    />
                  );
                }
                return (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      item.run();
                      setOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-border ${
                      item.danger ? "text-red-500 hover:text-red-600" : ""
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
