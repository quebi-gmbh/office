/**
 * Right-hand inspector. Adapts to the selection:
 *   - fill / stroke / opacity (with gradient editor, swatches, eyedropper),
 *   - advanced stroke (dashes, caps, joins, arrow markers, per-channel opacity),
 *   - a numeric transform panel (X/Y/W/H + rotation),
 *   - arrange (align / distribute / boolean) for multi-selections,
 *   - contextual rect radius / text / shape-tool parameter controls,
 *   - document settings when nothing is selected.
 */
import { useEffect, useState } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Combine,
  Pipette,
  Scissors,
} from "lucide-react";
import { worldBounds } from "~/vector/lib/geometry";
import { isParametricTool } from "~/vector/lib/shapes";
import type { AlignKind, DistributeAxis, VectorEngine } from "~/vector/lib/engine";
import type { BooleanOp, Gradient, VNode, VectorState } from "~/vector/lib/types";

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

async function pickWithEyedropper(): Promise<string | null> {
  const EyeDropperCtor = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } })
    .EyeDropper;
  if (!EyeDropperCtor) {
    alert("Your browser doesn't support the eyedropper.");
    return null;
  }
  try {
    const res = await new EyeDropperCtor().open();
    return res.sRGBHex;
  } catch {
    return null;
  }
}

function ColorControl({
  label,
  value,
  recent,
  onChange,
  onNone,
}: {
  label: string;
  value: string | null;
  recent: string[];
  onChange: (c: string) => void;
  onNone: () => void;
}) {
  const active = value !== null;
  return (
    <div className="flex flex-col gap-1">
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
          title="Pick colour from screen"
          onClick={async () => {
            const c = await pickWithEyedropper();
            if (c) onChange(c);
          }}
          className="rounded border border-border px-1.5 py-1 text-muted hover:text-fg"
        >
          <Pipette size={14} />
        </button>
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
      {recent.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-16">
          {recent.slice(0, 8).map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => onChange(c)}
              className="h-4 w-4 rounded-sm border border-border"
              style={{ background: c }}
            />
          ))}
        </div>
      )}
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
  const hasStroke = style.stroke !== null;

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-border bg-card">
      <Section title={selected.length ? `${selected.length} selected` : "Default style"}>
        <ColorControl
          label="Fill"
          value={style.fill}
          recent={state.recentColors}
          onChange={(c) => engine.applyStyle({ fill: c, fillGradient: null })}
          onNone={() => engine.applyStyle({ fill: null, fillGradient: null })}
        />
        <ColorControl
          label="Stroke"
          value={style.stroke}
          recent={state.recentColors}
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
        <OpacityRow
          label="Opacity"
          value={style.opacity}
          onChange={(o) => engine.applyStyle({ opacity: o })}
        />
        <OpacityRow
          label="Fill α"
          value={style.fillOpacity ?? 1}
          onChange={(o) => engine.applyStyle({ fillOpacity: o })}
        />
        {hasStroke && (
          <OpacityRow
            label="Stroke α"
            value={style.strokeOpacity ?? 1}
            onChange={(o) => engine.applyStyle({ strokeOpacity: o })}
          />
        )}
      </Section>

      <GradientSection engine={engine} value={style.fillGradient ?? null} />

      {hasStroke && <StrokeSection engine={engine} style={style} />}

      {selected.length >= 2 && <ArrangeSection engine={engine} />}

      {primary && <TransformSection engine={engine} node={primary} />}

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

      {primary?.type === "text" && <TextSection engine={engine} state={state} node={primary} />}

      {isParametricTool(state.tool) && <ShapeParamsSection engine={engine} state={state} />}

      {selected.length === 0 && <DocSection engine={engine} state={state} />}
    </aside>
  );
}

function OpacityRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-14 text-sm text-muted">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-accent"
      />
      <span className="w-9 text-right text-xs text-muted">{Math.round(value * 100)}%</span>
    </label>
  );
}

// ─── Gradient ─────────────────────────────────────────────────────────────────

function GradientSection({ engine, value }: { engine: VectorEngine; value: Gradient | null }) {
  const enabled = !!value;
  const grad: Gradient = value ?? { type: "linear", angle: 90, stops: [
    { offset: 0, color: "#4f46e5" },
    { offset: 1, color: "#06b6d4" },
  ] };
  const set = (g: Gradient | null) => engine.applyStyle({ fillGradient: g });

  return (
    <Section title="Gradient fill">
      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => set(e.target.checked ? grad : null)}
          className="accent-accent"
        />
        Use gradient fill
      </label>
      {enabled && (
        <>
          <div className="flex gap-2">
            {(["linear", "radial"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set({ ...grad, type: t })}
                className={`flex-1 rounded border px-2 py-1 text-xs capitalize ${
                  grad.type === t ? "border-accent text-accent" : "border-border text-muted hover:text-fg"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {grad.type === "linear" && (
            <NumberControl
              label="Angle"
              value={grad.angle ?? 0}
              step={5}
              onChange={(n) => set({ ...grad, angle: n })}
            />
          )}
          <div className="flex flex-col gap-1">
            {grad.stops.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="color"
                  value={s.color}
                  onChange={(e) => {
                    const stops = grad.stops.map((st, j) => (j === i ? { ...st, color: e.target.value } : st));
                    set({ ...grad, stops });
                  }}
                  className="h-6 w-6 rounded border border-border bg-transparent"
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={s.offset}
                  onChange={(e) => {
                    const stops = grad.stops.map((st, j) =>
                      j === i ? { ...st, offset: parseFloat(e.target.value) } : st,
                    );
                    set({ ...grad, stops });
                  }}
                  className="flex-1 accent-accent"
                />
                {grad.stops.length > 2 && (
                  <button
                    type="button"
                    onClick={() => set({ ...grad, stops: grad.stops.filter((_, j) => j !== i) })}
                    className="text-xs text-muted hover:text-fg"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                set({ ...grad, stops: [...grad.stops, { offset: 0.5, color: "#ffffff" }].sort((a, b) => a.offset - b.offset) })
              }
              className="mt-1 rounded border border-border px-2 py-1 text-xs text-muted hover:text-fg"
            >
              + Add stop
            </button>
          </div>
        </>
      )}
    </Section>
  );
}

// ─── Stroke ───────────────────────────────────────────────────────────────────

const DASH_PRESETS: { label: string; value: number[] | null }[] = [
  { label: "Solid", value: null },
  { label: "Dashed", value: [8, 6] },
  { label: "Dotted", value: [1, 5] },
  { label: "Dash-dot", value: [8, 4, 1, 4] },
];

function StrokeSection({ engine, style }: { engine: VectorEngine; style: VNode | VectorState["defaults"] }) {
  const dash = style.strokeDash ?? null;
  const activeDash = DASH_PRESETS.findIndex((p) => JSON.stringify(p.value) === JSON.stringify(dash));
  return (
    <Section title="Stroke style">
      <label className="flex items-center gap-2">
        <span className="w-14 text-sm text-muted">Dashes</span>
        <select
          value={activeDash < 0 ? 0 : activeDash}
          onChange={(e) => engine.applyStyle({ strokeDash: DASH_PRESETS[parseInt(e.target.value, 10)].value })}
          className="flex-1 rounded border border-border bg-bg px-2 py-1 text-sm text-fg"
        >
          {DASH_PRESETS.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="w-14 text-sm text-muted">Cap</span>
        <select
          value={style.strokeCap ?? "round"}
          onChange={(e) => engine.applyStyle({ strokeCap: e.target.value as "butt" | "round" | "square" })}
          className="flex-1 rounded border border-border bg-bg px-2 py-1 text-sm text-fg"
        >
          {["butt", "round", "square"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="w-14 text-sm text-muted">Join</span>
        <select
          value={style.strokeJoin ?? "round"}
          onChange={(e) => engine.applyStyle({ strokeJoin: e.target.value as "miter" | "round" | "bevel" })}
          className="flex-1 rounded border border-border bg-bg px-2 py-1 text-sm text-fg"
        >
          {["miter", "round", "bevel"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 items-center gap-1">
          <span className="text-sm text-muted">Start</span>
          <select
            value={style.markerStart ?? "none"}
            onChange={(e) => engine.applyStyle({ markerStart: e.target.value as "none" | "arrow" | "dot" })}
            className="min-w-0 flex-1 rounded border border-border bg-bg px-1 py-1 text-sm text-fg"
          >
            {["none", "arrow", "dot"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 items-center gap-1">
          <span className="text-sm text-muted">End</span>
          <select
            value={style.markerEnd ?? "none"}
            onChange={(e) => engine.applyStyle({ markerEnd: e.target.value as "none" | "arrow" | "dot" })}
            className="min-w-0 flex-1 rounded border border-border bg-bg px-1 py-1 text-sm text-fg"
          >
            {["none", "arrow", "dot"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
    </Section>
  );
}

// ─── Arrange (align / distribute / boolean) ───────────────────────────────────

function IconAction({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted hover:border-accent hover:text-accent"
    >
      {children}
    </button>
  );
}

function ArrangeSection({ engine }: { engine: VectorEngine }) {
  const aligns: { k: AlignKind; title: string; icon: React.ReactNode }[] = [
    { k: "left", title: "Align left", icon: <AlignStartVertical size={16} /> },
    { k: "hcenter", title: "Align centres (H)", icon: <AlignCenterVertical size={16} /> },
    { k: "right", title: "Align right", icon: <AlignEndVertical size={16} /> },
    { k: "top", title: "Align top", icon: <AlignStartHorizontal size={16} /> },
    { k: "vcenter", title: "Align middles (V)", icon: <AlignCenterHorizontal size={16} /> },
    { k: "bottom", title: "Align bottom", icon: <AlignEndHorizontal size={16} /> },
  ];
  const dists: { a: DistributeAxis; title: string; icon: React.ReactNode }[] = [
    { a: "h", title: "Distribute horizontally", icon: <AlignHorizontalDistributeCenter size={16} /> },
    { a: "v", title: "Distribute vertically", icon: <AlignVerticalDistributeCenter size={16} /> },
  ];
  const bools: { op: BooleanOp; title: string }[] = [
    { op: "union", title: "Union" },
    { op: "subtract", title: "Subtract" },
    { op: "intersect", title: "Intersect" },
    { op: "exclude", title: "Exclude" },
  ];
  return (
    <Section title="Arrange">
      <div className="flex flex-wrap gap-1">
        {aligns.map((a) => (
          <IconAction key={a.k} title={a.title} onClick={() => engine.align(a.k)}>
            {a.icon}
          </IconAction>
        ))}
        {dists.map((d) => (
          <IconAction key={d.a} title={d.title} onClick={() => engine.distribute(d.a)}>
            {d.icon}
          </IconAction>
        ))}
      </div>
      <div className="mt-1 flex items-center gap-1 text-xs text-muted">
        <Combine size={14} /> Boolean
      </div>
      <div className="grid grid-cols-2 gap-1">
        {bools.map((b) => (
          <button
            key={b.op}
            type="button"
            onClick={() => engine.booleanOp(b.op)}
            className="rounded border border-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
          >
            {b.title}
          </button>
        ))}
      </div>
    </Section>
  );
}

// ─── Numeric transform ────────────────────────────────────────────────────────

function TransformSection({ engine, node }: { engine: VectorEngine; node: VNode }) {
  const b = worldBounds(node);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  useEffect(() => {
    setX(Math.round(b.minX * 100) / 100);
    setY(Math.round(b.minY * 100) / 100);
    setW(Math.round((b.maxX - b.minX) * 100) / 100);
    setH(Math.round((b.maxY - b.minY) * 100) / 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, b.minX, b.minY, b.maxX, b.maxY]);

  const field = (label: string, val: number, setter: (n: number) => void, commit: () => void) => (
    <label className="flex items-center gap-1">
      <span className="w-4 text-xs text-muted">{label}</span>
      <input
        type="number"
        value={val}
        onChange={(e) => setter(parseFloat(e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="w-full min-w-0 rounded border border-border bg-bg px-1.5 py-1 text-sm text-fg"
      />
    </label>
  );

  return (
    <Section title="Transform">
      <div className="grid grid-cols-2 gap-2">
        {field("X", x, setX, () => engine.setNodeBounds(node.id, { x }))}
        {field("Y", y, setY, () => engine.setNodeBounds(node.id, { y }))}
        {field("W", w, setW, () => engine.setNodeBounds(node.id, { w }))}
        {field("H", h, setH, () => engine.setNodeBounds(node.id, { h }))}
      </div>
      <NumberControl
        label="Rotate"
        value={node.rotation}
        step={1}
        onChange={(n) => engine.setRotation([node.id], Number.isFinite(n) ? n : 0)}
      />
    </Section>
  );
}

// ─── Shape-tool params ────────────────────────────────────────────────────────

function ShapeParamsSection({ engine, state }: { engine: VectorEngine; state: VectorState }) {
  const p = state.shapeDefaults;
  return (
    <Section title="Shape options">
      {(state.tool === "polygon") && (
        <NumberControl label="Sides" value={p.polygonSides} min={3} max={64} step={1}
          onChange={(n) => engine.setShapeDefaults({ polygonSides: Math.max(3, Math.round(n)) })} />
      )}
      {state.tool === "star" && (
        <>
          <NumberControl label="Points" value={p.starPoints} min={2} max={64} step={1}
            onChange={(n) => engine.setShapeDefaults({ starPoints: Math.max(2, Math.round(n)) })} />
          <NumberControl label="Inner" value={p.starInner} min={0.05} max={0.95} step={0.05}
            onChange={(n) => engine.setShapeDefaults({ starInner: n })} />
        </>
      )}
      {state.tool === "spiral" && (
        <NumberControl label="Turns" value={p.spiralTurns} min={0.5} max={20} step={0.5}
          onChange={(n) => engine.setShapeDefaults({ spiralTurns: n })} />
      )}
    </Section>
  );
}

// ─── Text ─────────────────────────────────────────────────────────────────────

function TextSection({ engine, state, node }: { engine: VectorEngine; state: VectorState; node: VNode & { type: "text" } }) {
  const fonts = [
    "sans-serif", "serif", "monospace", "cursive",
    "Georgia", "Times New Roman", "Arial", "Helvetica", "Courier New", "Verdana", "Trebuchet MS",
  ];
  return (
    <Section title="Text">
      <label className="flex items-center gap-2">
        <span className="w-14 text-sm text-muted">Font</span>
        <select
          value={node.fontFamily}
          onChange={(e) => engine.setTextProps({ fontFamily: e.target.value })}
          className="min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1 text-sm text-fg"
        >
          {fonts.map((f) => (
            <option key={f} value={f}>{f}</option>
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
      <div className="flex items-center gap-2">
        <span className="w-14 text-sm text-muted">Align</span>
        <div className="flex flex-1 gap-1">
          {(["left", "center", "right"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => engine.setTextProps({ align: a })}
              className={`flex-1 rounded border px-1 py-1 text-xs capitalize ${
                (node.align ?? "left") === a ? "border-accent text-accent" : "border-border text-muted hover:text-fg"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => engine.setTextProps({ fontWeight: (node.fontWeight ?? 400) >= 700 ? 400 : 700 })}
          className={`flex-1 rounded border px-2 py-1 text-sm font-bold ${
            (node.fontWeight ?? 400) >= 700 ? "border-accent text-accent" : "border-border text-muted hover:text-fg"
          }`}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => engine.setTextProps({ fontStyle: node.fontStyle === "italic" ? "normal" : "italic" })}
          className={`flex-1 rounded border px-2 py-1 text-sm italic ${
            node.fontStyle === "italic" ? "border-accent text-accent" : "border-border text-muted hover:text-fg"
          }`}
        >
          I
        </button>
      </div>
      <NumberControl label="Line h" value={node.lineHeight ?? 1.2} min={0.5} max={4} step={0.1}
        onChange={(n) => engine.setTextProps({ lineHeight: n })} />
      <NumberControl label="Letter" value={node.letterSpacing ?? 0} step={0.5}
        onChange={(n) => engine.setTextProps({ letterSpacing: n })} />
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">Content</span>
        <textarea
          rows={3}
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
    <>
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
      <Section title="Grid & guides">
        <NumberControl label="Grid" value={state.grid.size} min={1} step={1}
          onChange={(n) => engine.setGrid({ size: Math.max(1, Math.round(n)) })} />
        <NumberControl label="Snap ±" value={state.grid.tolerance} min={0} step={1}
          onChange={(n) => engine.setGrid({ tolerance: Math.max(0, n) })} />
        {(state.doc.guides?.length ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => (state.doc.guides ?? []).forEach((g) => engine.removeGuide(g.id))}
            className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-fg"
          >
            Clear {state.doc.guides!.length} guide(s)
          </button>
        )}
      </Section>
    </>
  );
}
