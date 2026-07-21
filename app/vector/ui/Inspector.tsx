/**
 * Right-hand inspector: fill / stroke / stroke-width / opacity, plus contextual
 * controls (corner radius for rects, font + size for text) and document
 * settings (size + background) when nothing is selected.
 *
 * Values reflect the first selected node, or the editor defaults when the
 * selection is empty (so new shapes preview the style you'll get).
 */
import { useEffect, useState } from "react";
import type { VectorEngine } from "~/vector/lib/engine";
import type { VNode, VectorState } from "~/vector/lib/types";

interface Props {
  engine: VectorEngine;
  state: VectorState;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-4 py-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function ColorControl({
  label,
  value,
  onChange,
  onNone,
}: {
  label: string;
  value: string | null;
  onChange: (c: string) => void;
  onNone: () => void;
}) {
  const active = value !== null;
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-sm text-muted">{label}</span>
      <label className="relative h-7 w-7 shrink-0 overflow-hidden rounded border border-border" title={`${label} colour`}>
        <span
          className="block h-full w-full"
          style={{
            background: active
              ? (value as string)
              : "repeating-conic-gradient(#64748b 0% 25%, #334155 0% 50%) 50% / 10px 10px",
          }}
        />
        <input
          type="color"
          value={active ? (value as string) : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <input
        type="text"
        value={active ? (value as string) : "none"}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1 text-sm text-fg"
      />
      <button
        type="button"
        onClick={onNone}
        title={`No ${label.toLowerCase()}`}
        className={`rounded border px-2 py-1 text-xs ${
          active ? "border-border text-muted hover:text-fg" : "border-accent text-accent"
        }`}
      >
        ✕
      </button>
    </div>
  );
}

function NumberControl({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-14 text-sm text-muted">{label}</span>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-20 rounded border border-border bg-bg px-2 py-1 text-sm text-fg"
      />
    </label>
  );
}

export function Inspector({ engine, state }: Props) {
  const selected = state.nodes.filter((n) => state.selection.includes(n.id));
  const primary: VNode | null = selected[0] ?? null;
  const style = primary ?? state.defaults;

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-border bg-card">
      <Section title={selected.length ? `${selected.length} selected` : "Default style"}>
        <ColorControl
          label="Fill"
          value={style.fill}
          onChange={(c) => engine.applyStyle({ fill: c })}
          onNone={() => engine.applyStyle({ fill: null })}
        />
        <ColorControl
          label="Stroke"
          value={style.stroke}
          onChange={(c) => engine.applyStyle({ stroke: c })}
          onNone={() => engine.applyStyle({ stroke: null })}
        />
        <NumberControl
          label="Width"
          value={style.strokeWidth}
          min={0}
          step={0.5}
          onChange={(n) => engine.applyStyle({ strokeWidth: Number.isFinite(n) ? Math.max(0, n) : 0 })}
        />
        <label className="flex items-center gap-2">
          <span className="w-14 text-sm text-muted">Opacity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={style.opacity}
            onChange={(e) => engine.applyStyle({ opacity: parseFloat(e.target.value) })}
            className="flex-1 accent-accent"
          />
          <span className="w-9 text-right text-xs text-muted">{Math.round(style.opacity * 100)}%</span>
        </label>
      </Section>

      {primary?.type === "rect" && (
        <Section title="Corner radius">
          <NumberControl
            label="Radius"
            value={primary.rx}
            min={0}
            step={1}
            onChange={(n) =>
              engine.updateNodes(state.selection, (node) =>
                node.type === "rect"
                  ? { ...node, rx: Math.max(0, Math.min(n, node.w / 2, node.h / 2)) }
                  : node,
              )
            }
          />
        </Section>
      )}

      {primary?.type === "text" && (
        <TextSection engine={engine} state={state} node={primary} />
      )}

      {selected.length === 0 && <DocSection engine={engine} state={state} />}
    </aside>
  );
}

function TextSection({ engine, state, node }: { engine: VectorEngine; state: VectorState; node: VNode & { type: "text" } }) {
  const fonts = ["sans-serif", "serif", "monospace", "cursive"];
  return (
    <Section title="Text">
      <label className="flex items-center gap-2">
        <span className="w-14 text-sm text-muted">Font</span>
        <select
          value={node.fontFamily}
          onChange={(e) => engine.setTextProps({ fontFamily: e.target.value })}
          className="flex-1 rounded border border-border bg-bg px-2 py-1 text-sm text-fg"
        >
          {fonts.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <NumberControl
        label="Size"
        value={node.fontSize}
        min={1}
        step={1}
        onChange={(n) => engine.setTextProps({ fontSize: Math.max(1, n) })}
      />
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">Content</span>
        <input
          type="text"
          value={node.text}
          onChange={(e) =>
            engine.updateNodes(state.selection, (nn) => (nn.type === "text" ? { ...nn, text: e.target.value } : nn))
          }
          className="rounded border border-border bg-bg px-2 py-1 text-sm text-fg"
        />
      </label>
    </Section>
  );
}

function DocSection({ engine, state }: { engine: VectorEngine; state: VectorState }) {
  const [w, setW] = useState(state.doc.width);
  const [h, setH] = useState(state.doc.height);
  useEffect(() => {
    setW(state.doc.width);
    setH(state.doc.height);
  }, [state.doc.width, state.doc.height]);
  const transparent = state.doc.background === "transparent";

  return (
    <Section title="Document">
      <div className="flex items-center gap-2">
        <span className="w-14 text-sm text-muted">Size</span>
        <input
          type="number"
          value={w}
          min={1}
          onChange={(e) => setW(parseInt(e.target.value, 10) || 1)}
          onBlur={() => engine.setDoc({ width: w })}
          className="w-16 rounded border border-border bg-bg px-2 py-1 text-sm text-fg"
        />
        <span className="text-muted">×</span>
        <input
          type="number"
          value={h}
          min={1}
          onChange={(e) => setH(parseInt(e.target.value, 10) || 1)}
          onBlur={() => engine.setDoc({ height: h })}
          className="w-16 rounded border border-border bg-bg px-2 py-1 text-sm text-fg"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-14 text-sm text-muted">Bg</span>
        <label className="relative h-7 w-7 shrink-0 overflow-hidden rounded border border-border">
          <span
            className="block h-full w-full"
            style={{
              background: transparent
                ? "repeating-conic-gradient(#64748b 0% 25%, #334155 0% 50%) 50% / 10px 10px"
                : state.doc.background,
            }}
          />
          <input
            type="color"
            value={transparent ? "#ffffff" : state.doc.background}
            onChange={(e) => engine.setDoc({ background: e.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <button
          type="button"
          onClick={() => engine.setDoc({ background: transparent ? "#ffffff" : "transparent" })}
          className={`rounded border px-2 py-1 text-xs ${
            transparent ? "border-accent text-accent" : "border-border text-muted hover:text-fg"
          }`}
        >
          Transparent
        </button>
      </div>
    </Section>
  );
}
