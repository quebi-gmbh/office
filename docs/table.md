# Table — quick reference

`/table` is a browser-only spreadsheet. Paste anything tabular in, edit it in a
fast virtualised grid, and export it to any reasonable target. Everything runs
client-side and autosaves to IndexedDB; reload restores your work.

## Import — "paste anything in"

- **Paste** (`Ctrl/Cmd+V`) into an empty grid to bootstrap from the clipboard;
  paste into a selection to drop a block at the active cell.
- **Drag-and-drop** a file, or use **Import**. Supported: `.csv` `.tsv` `.txt`
  `.json` `.jsonl` `.html` `.md` `.xlsx`.
- The importer auto-detects the format (delimiter, JSON shape, HTML `<table>`,
  Markdown table, Python/NumPy/MATLAB/C arrays) and shows a preview with
  delimiter / quote / header overrides before committing.
- Files over ~1 MB stream-parse with a progress indicator and stay responsive.

## Editing

- Click / `F2` / start typing to edit; `Enter` `Tab` `Esc`, arrows and
  `Shift`+arrows for range selection, `Ctrl/Cmd+A` to select all.
- Copy / cut / paste rectangular regions (TSV, Excel-compatible).
- Right-click a row/column header to insert, delete, auto-size, or resize.
- Undo / redo: `Ctrl+Z` / `Ctrl+Y`.
- Find & replace: `Ctrl+F` (scope, case, regex, whole-cell).

## Types, sort & filter

- Column types are inferred (number, integer, date, datetime, bool, text) and
  can be overridden from the column menu (▾). Number display formatting
  (thousands, percent, currency, scientific, decimals) is per column.
- Locale (decimal/thousands separators, date order) lives in **Settings**.
- Sort one or more columns (type-aware) and filter per column from the column
  menu. Filters are non-destructive.

## Export — "export anywhere"

**Download as…** and **Copy as…** cover: CSV, TSV, JSON (array-of-objects and
array-of-arrays), JSON Lines, Markdown, HTML, Excel (`.xlsx`), LaTeX `tabular`,
Python literal, NumPy `np.array(...)`, MATLAB, C initialiser, and SQL `INSERT`.
Code/data targets emit numbers and booleans as real literals, so the output is
directly parseable/executable in its host.

## Command palette

`Ctrl/Cmd+Shift+P` opens the palette with every export target and data
operation, fuzzy-searchable.
