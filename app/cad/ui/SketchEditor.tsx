/**
 * The 2-D sketch editor. Draws on a base plane in an SVG canvas: create lines,
 * rectangles, circles, arcs and polylines with grid / endpoint / centre / mid
 * snapping and typed dimensions; select, move and delete; apply a starter set
 * of constraints solved live. Closes back to the 3-D viewport when done.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Circle as CircleIcon,
  Minus,
  MousePointer2,
  PenLine,
  RectangleHorizontal,
  Spline,
  Trash2,
} from "lucide-react";
import { useCad, useCadStore } from "../hooks/useCad";
import { entityPoints, tessellateArc, type Vec2 } from "../lib/geometry";
import { uid } from "../lib/id";
import { constraintStatus, solveSketch } from "../lib/solver";
import type { Constraint, PointRef, Sketch, SketchEntity } from "../lib/types";
import {
  hitEntity,
  hitPoint,
  moveEntityPoint,
  screenToWorld,
  snap,
  translateEntity,
  worldToScreen,
  type View,
} from "./sketch-helpers";

type Tool = "select" | "line" | "rect" | "circle" | "arc" | "polyline";

const TOOLS: { id: Tool; label: string; icon: React.ReactNode }[] = [
  { id: "select", label: "Select (V)", icon: <MousePointer2 size={16} aria-hidden /> },
  { id: "line", label: "Line (L)", icon: <Minus size={16} aria-hidden /> },
  { id: "rect", label: "Rectangle (R)", icon: <RectangleHorizontal size={16} aria-hidden /> },
  { id: "circle", label: "Circle (C)", icon: <CircleIcon size={16} aria-hidden /> },
  { id: "arc", label: "Arc (A)", icon: <Spline size={16} aria-hidden /> },
  { id: "polyline", label: "Polyline (P)", icon: <PenLine size={16} aria-hidden /> },
];

const GRID = 5; // mm

export function SketchEditor({ sketchId }: { sketchId: string }) {
  const store = useCadStore();
  const sketch = useCad(
    (s) => (s.doc.features.find((f) => f.id === sketchId && f.type === "sketch") as { sketch: Sketch } | undefined)?.sketch,
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ scale: 3, ox: 300, oy: 300 });
  const [tool, setTool] = useState<Tool>("select");
  const [snapGrid, setSnapGrid] = useState(true);
  const [pointer, setPointer] = useState<Vec2 | null>(null);
  const [draft, setDraft] = useState<Vec2[]>([]);
  const [selEntities, setSelEntities] = useState<string[]>([]);
  const [selPoints, setSelPoints] = useState<PointRef[]>([]);
  const [dimInput, setDimInput] = useState<string>("");
  const [solveInfo, setSolveInfo] = useState<{ status: string; dof: number } | null>(null);

  // Drag state for moving points / entities in select mode.
  const dragRef = useRef<
    | { kind: "point"; ref: PointRef; entities: SketchEntity[] }
    | { kind: "entity"; id: string; last: Vec2; entities: SketchEntity[] }
    | { kind: "pan"; last: Vec2 }
    | null
  >(null);
  const [previewEntities, setPreviewEntities] = useState<SketchEntity[] | null>(null);

  // Centre the view on mount.
  useEffect(() => {
    const el = wrapRef.current;
    if (el) setView((v) => ({ ...v, ox: el.clientWidth / 2, oy: el.clientHeight / 2 }));
  }, []);

  const entities = previewEntities ?? sketch?.entities ?? [];
  const tolWorld = 9 / view.scale;

  function localXY(e: React.PointerEvent | React.MouseEvent | React.WheelEvent): Vec2 {
    const r = svgRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function snapped(sx: number, sy: number) {
    return snap(screenToWorld(view, sx, sy), entities, GRID, snapGrid, tolWorld);
  }

  function commitEntity(e: SketchEntity) {
    store.getState().updateSketch(sketchId, (sk) => {
      sk.entities.push(e);
    });
  }

  function runSolve(next?: Sketch) {
    const s = next ?? sketch;
    if (!s) return;
    const res = solveSketch(s);
    setSolveInfo({ status: constraintStatus(res, s), dof: res.dof });
    if (next) {
      store.getState().updateSketch(sketchId, (sk) => {
        sk.entities = res.sketch.entities;
      });
    }
  }

  // ─── Drawing ───────────────────────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent) {
    if (e.button === 1 || e.button === 2 || e.altKey) {
      dragRef.current = { kind: "pan", last: localXY(e) };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    const [sx, sy] = localXY(e);
    const sc = snapped(sx, sy);
    const p = sc.point;

    if (tool === "select") {
      const hp = hitPoint(p, entities, tolWorld);
      if (hp) {
        if (e.shiftKey) {
          // Toggle point selection for constraints.
          setSelPoints((prev) =>
            prev.some((r) => r.entity === hp.entity && r.which === hp.which)
              ? prev.filter((r) => !(r.entity === hp.entity && r.which === hp.which))
              : [...prev, hp],
          );
          return;
        }
        dragRef.current = { kind: "point", ref: hp, entities: entities.map((x) => ({ ...x })) };
        (e.target as Element).setPointerCapture?.(e.pointerId);
        return;
      }
      const hit = hitEntity(p, entities, tolWorld);
      if (hit) {
        setSelEntities(e.shiftKey ? (prev) => toggle(prev, hit) : [hit]);
        dragRef.current = { kind: "entity", id: hit, last: p, entities: entities.map((x) => ({ ...x })) };
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } else if (!e.shiftKey) {
        setSelEntities([]);
        setSelPoints([]);
      }
      return;
    }

    // Drawing tools — click to place points.
    if (tool === "line") {
      if (draft.length === 0) setDraft([p]);
      else {
        commitEntity({ id: uid("ln"), type: "line", x1: draft[0][0], y1: draft[0][1], x2: p[0], y2: p[1] });
        setDraft([]);
        setDimInput("");
      }
    } else if (tool === "rect") {
      if (draft.length === 0) setDraft([p]);
      else {
        const x = Math.min(draft[0][0], p[0]);
        const y = Math.min(draft[0][1], p[1]);
        const w = Math.abs(p[0] - draft[0][0]);
        const h = Math.abs(p[1] - draft[0][1]);
        if (w > 1e-4 && h > 1e-4) commitEntity({ id: uid("rc"), type: "rect", x, y, w, h });
        setDraft([]);
      }
    } else if (tool === "circle") {
      if (draft.length === 0) setDraft([p]);
      else {
        const r = Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]);
        if (r > 1e-4) commitEntity({ id: uid("ci"), type: "circle", cx: draft[0][0], cy: draft[0][1], r });
        setDraft([]);
        setDimInput("");
      }
    } else if (tool === "arc") {
      if (draft.length < 2) setDraft([...draft, p]);
      else {
        const c = draft[0];
        const r = Math.hypot(draft[1][0] - c[0], draft[1][1] - c[1]);
        const a0 = Math.atan2(draft[1][1] - c[1], draft[1][0] - c[0]);
        let a1 = Math.atan2(p[1] - c[1], p[0] - c[0]);
        if (a1 < a0) a1 += Math.PI * 2;
        if (r > 1e-4) commitEntity({ id: uid("ar"), type: "arc", cx: c[0], cy: c[1], r, a0, a1 });
        setDraft([]);
      }
    } else if (tool === "polyline") {
      // Close if clicking near the first point.
      if (draft.length >= 3 && Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) < tolWorld) {
        commitEntity({ id: uid("pl"), type: "polyline", points: draft.map((d) => [d[0], d[1]]), closed: true });
        setDraft([]);
      } else {
        setDraft([...draft, p]);
      }
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const [sx, sy] = localXY(e);
    const drag = dragRef.current;
    if (drag?.kind === "pan") {
      const [lx, ly] = drag.last;
      setView((v) => ({ ...v, ox: v.ox + (sx - lx), oy: v.oy + (sy - ly) }));
      drag.last = [sx, sy];
      return;
    }
    const sc = snapped(sx, sy);
    setPointer(sc.point);

    if (drag?.kind === "point") {
      const next = drag.entities.map((en) =>
        en.id === drag.ref.entity ? moveEntityPoint(en, drag.ref.which, sc.point[0], sc.point[1]) : en,
      );
      setPreviewEntities(next);
    } else if (drag?.kind === "entity") {
      const dx = sc.point[0] - drag.last[0];
      const dy = sc.point[1] - drag.last[1];
      drag.last = sc.point;
      drag.entities = drag.entities.map((en) => (en.id === drag.id ? translateEntity(en, dx, dy) : en));
      setPreviewEntities(drag.entities.map((x) => ({ ...x })));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const drag = dragRef.current;
    dragRef.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if ((drag?.kind === "point" || drag?.kind === "entity") && previewEntities && sketch) {
      const solved = solveSketch({ ...sketch, entities: previewEntities });
      store.getState().updateSketch(sketchId, (sk) => {
        sk.entities = solved.sketch.entities;
      });
      setSolveInfo({ status: constraintStatus(solved, sketch), dof: solved.dof });
    }
    setPreviewEntities(null);
  }

  function onWheel(e: React.WheelEvent) {
    const [sx, sy] = localXY(e);
    const before = screenToWorld(view, sx, sy);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const scale = Math.max(0.2, Math.min(80, view.scale * factor));
    // Keep the cursor world point fixed.
    const ox = sx - before[0] * scale;
    const oy = sy + before[1] * scale;
    setView({ scale, ox, oy });
  }

  // ─── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.target instanceof HTMLInputElement) return;
      switch (ev.key) {
        case "Escape":
          setDraft([]);
          break;
        case "Enter":
          if (tool === "polyline" && draft.length >= 2) {
            commitEntity({ id: uid("pl"), type: "polyline", points: draft.map((d) => [d[0], d[1]]), closed: false });
            setDraft([]);
          }
          break;
        case "Delete":
        case "Backspace":
          if (selEntities.length) deleteSelection();
          break;
        case "v": setTool("select"); break;
        case "l": setTool("line"); break;
        case "r": setTool("rect"); break;
        case "c": setTool("circle"); break;
        case "a": setTool("arc"); break;
        case "p": setTool("polyline"); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, draft, selEntities]);

  function deleteSelection() {
    const ids = new Set(selEntities);
    store.getState().updateSketch(sketchId, (sk) => {
      sk.entities = sk.entities.filter((en) => !ids.has(en.id));
      sk.constraints = sk.constraints.filter(
        (c) => !constraintTouchesEntities(c, ids),
      );
    });
    setSelEntities([]);
    setSelPoints([]);
  }

  // ─── Constraints ─────────────────────────────────────────────────────────────
  function addConstraint(make: () => Constraint | null) {
    const c = make();
    if (!c || !sketch) return;
    const next: Sketch = { ...sketch, constraints: [...sketch.constraints, c] };
    runSolve(next);
    setSelPoints([]);
  }

  function applyHV(type: "horizontal" | "vertical") {
    const lineId = selEntities.find((id) => entities.find((e) => e.id === id && e.type === "line"));
    if (!lineId) return;
    addConstraint(() => ({ id: uid("cn"), type, entity: lineId }));
  }

  function applyRadius() {
    const id = selEntities.find((eid) => entities.find((e) => e.id === eid && (e.type === "circle" || e.type === "arc")));
    if (!id) return;
    const ent = entities.find((e) => e.id === id) as SketchEntity;
    const cur = "r" in ent ? ent.r : 0;
    const val = parseFloat(prompt("Radius (mm):", String(cur)) ?? "");
    if (!Number.isFinite(val) || val <= 0) return;
    addConstraint(() => ({ id: uid("cn"), type: "radius", entity: id, value: val }));
  }

  function applyCoincident() {
    if (selPoints.length !== 2) return;
    addConstraint(() => ({ id: uid("cn"), type: "coincident", a: selPoints[0], b: selPoints[1] }));
  }

  function applyDistance() {
    if (selPoints.length !== 2) return;
    const val = parseFloat(prompt("Distance (mm):", "") ?? "");
    if (!Number.isFinite(val) || val < 0) return;
    addConstraint(() => ({ id: uid("cn"), type: "distance", a: selPoints[0], b: selPoints[1], value: val }));
  }

  // ─── Typed dimensions ────────────────────────────────────────────────────────
  function commitDimension() {
    const val = parseFloat(dimInput);
    if (!Number.isFinite(val) || val <= 0 || !pointer) return;
    if (tool === "line" && draft.length === 1) {
      const a = draft[0];
      const dir = Math.atan2(pointer[1] - a[1], pointer[0] - a[0]);
      commitEntity({
        id: uid("ln"),
        type: "line",
        x1: a[0],
        y1: a[1],
        x2: a[0] + val * Math.cos(dir),
        y2: a[1] + val * Math.sin(dir),
      });
      setDraft([]);
      setDimInput("");
    } else if (tool === "circle" && draft.length === 1) {
      commitEntity({ id: uid("ci"), type: "circle", cx: draft[0][0], cy: draft[0][1], r: val });
      setDraft([]);
      setDimInput("");
    }
  }

  const showDim =
    (tool === "line" && draft.length === 1) || (tool === "circle" && draft.length === 1);

  // ─── Render ──────────────────────────────────────────────────────────────────
  const size = wrapRef.current
    ? { w: wrapRef.current.clientWidth, h: wrapRef.current.clientHeight }
    : { w: 800, h: 600 };
  const gridLines = useMemo(() => buildGridLines(view, size.w, size.h, GRID), [view, size.w, size.h]);

  if (!sketch) return null;

  const toolBtn = (active: boolean) =>
    `rounded-md border p-1.5 ${active ? "border-accent text-accent" : "border-border text-muted hover:text-fg"}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-full-bleed>
      {/* Sketch toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-card px-3 py-2">
        <button
          type="button"
          onClick={() => store.getState().openSketch(null)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm hover:border-accent"
        >
          <ArrowLeft size={15} aria-hidden /> Done
        </button>
        <span className="mx-1 h-5 w-px bg-border" />
        {TOOLS.map((t) => (
          <button key={t.id} type="button" title={t.label} onClick={() => setTool(t.id)} className={toolBtn(tool === t.id)}>
            {t.icon}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <button
          type="button"
          onClick={() => setSnapGrid((v) => !v)}
          className={`rounded-md border px-2 py-1 text-xs ${snapGrid ? "border-accent text-accent" : "border-border text-muted"}`}
        >
          Snap grid
        </button>
        <button
          type="button"
          title="Delete selection"
          onClick={deleteSelection}
          disabled={selEntities.length === 0}
          className="rounded-md border border-border p-1.5 text-muted hover:text-red-600 disabled:opacity-40"
        >
          <Trash2 size={16} aria-hidden />
        </button>

        <span className="mx-1 h-5 w-px bg-border" />
        {/* Constraints */}
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted">Constrain:</span>
          <ConstraintBtn onClick={() => applyHV("horizontal")}>Horiz</ConstraintBtn>
          <ConstraintBtn onClick={() => applyHV("vertical")}>Vert</ConstraintBtn>
          <ConstraintBtn onClick={applyCoincident} disabled={selPoints.length !== 2}>
            Coincident
          </ConstraintBtn>
          <ConstraintBtn onClick={applyDistance} disabled={selPoints.length !== 2}>
            Distance
          </ConstraintBtn>
          <ConstraintBtn onClick={applyRadius}>Radius</ConstraintBtn>
        </div>

        <span className="ml-auto text-xs text-muted">
          {sketch.plane} · {sketch.entities.length} entities · {sketch.constraints.length} constraints
          {solveInfo && (
            <span
              className={
                solveInfo.status === "over"
                  ? " text-red-600"
                  : solveInfo.status === "under"
                    ? " text-amber-600"
                    : " text-accent"
              }
            >
              {" · "}
              {solveInfo.status === "over"
                ? "over/conflicting"
                : solveInfo.status === "under"
                  ? `under-constrained (${solveInfo.dof} DOF)`
                  : solveInfo.status === "well"
                    ? "fully constrained"
                    : ""}
            </span>
          )}
        </span>
      </div>

      {/* Canvas */}
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-bg">
        <svg
          ref={svgRef}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Grid */}
          {gridLines.map((l, i) => (
            <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} stroke="#e3e7ec" strokeWidth={1} />
          ))}
          {/* Axes */}
          <line x1={0} y1={view.oy} x2={size.w} y2={view.oy} stroke="#9aa4b2" strokeWidth={1.2} />
          <line x1={view.ox} y1={0} x2={view.ox} y2={size.h} stroke="#9aa4b2" strokeWidth={1.2} />

          {/* Entities */}
          {entities.map((e) => (
            <EntityShape
              key={e.id}
              entity={e}
              view={view}
              selected={selEntities.includes(e.id)}
            />
          ))}

          {/* Point handles (select mode) */}
          {tool === "select" &&
            entities.flatMap((e) =>
              Object.entries(entityPoints(e)).map(([which, p]) => {
                const [sx, sy] = worldToScreen(view, p);
                const selected = selPoints.some((r) => r.entity === e.id && r.which === which);
                return (
                  <circle
                    key={`${e.id}:${which}`}
                    cx={sx}
                    cy={sy}
                    r={selected ? 5 : 3.2}
                    fill={selected ? "var(--color-accent)" : "#ffffff"}
                    stroke="#64748b"
                    strokeWidth={1.2}
                  />
                );
              }),
            )}

          {/* Draft preview */}
          <DraftPreview tool={tool} draft={draft} pointer={pointer} view={view} />

          {/* Snap cursor */}
          {pointer && (
            <circle
              cx={worldToScreen(view, pointer)[0]}
              cy={worldToScreen(view, pointer)[1]}
              r={4}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={1.2}
            />
          )}
        </svg>

        {/* Typed dimension */}
        {showDim && pointer && (
          <div
            className="absolute rounded border border-accent bg-card px-2 py-1 text-xs"
            style={{
              left: worldToScreen(view, pointer)[0] + 10,
              top: worldToScreen(view, pointer)[1] + 10,
            }}
          >
            <input
              autoFocus
              value={dimInput}
              onChange={(e) => setDimInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitDimension();
                if (e.key === "Escape") {
                  setDraft([]);
                  setDimInput("");
                }
              }}
              placeholder={tool === "circle" ? "radius" : "length"}
              className="w-20 bg-transparent outline-none"
            />
          </div>
        )}

        {/* Pointer readout */}
        {pointer && (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-card/90 px-2 py-1 text-xs text-muted">
            u {pointer[0].toFixed(1)} · v {pointer[1].toFixed(1)} mm
          </div>
        )}
      </div>
    </div>
  );
}

function ConstraintBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-border px-1.5 py-1 hover:border-accent hover:text-fg disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function toggle(arr: string[], id: string): string[] {
  return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
}

function constraintTouchesEntities(c: Constraint, ids: Set<string>): boolean {
  switch (c.type) {
    case "horizontal":
    case "vertical":
    case "radius":
      return ids.has(c.entity);
    case "coincident":
    case "distance":
      return ids.has(c.a.entity) || ids.has(c.b.entity);
  }
}

function EntityShape({ entity, view, selected }: { entity: SketchEntity; view: View; selected: boolean }) {
  const stroke = selected ? "var(--color-accent)" : "#475569";
  const sw = selected ? 2.2 : 1.6;
  switch (entity.type) {
    case "line": {
      const a = worldToScreen(view, [entity.x1, entity.y1]);
      const b = worldToScreen(view, [entity.x2, entity.y2]);
      return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={stroke} strokeWidth={sw} />;
    }
    case "circle": {
      const c = worldToScreen(view, [entity.cx, entity.cy]);
      return <circle cx={c[0]} cy={c[1]} r={entity.r * view.scale} fill="none" stroke={stroke} strokeWidth={sw} />;
    }
    case "arc": {
      const pts = tessellateArc(entity.cx, entity.cy, entity.r, entity.a0, entity.a1).map((p) => worldToScreen(view, p));
      const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
      return <path d={d} fill="none" stroke={stroke} strokeWidth={sw} />;
    }
    case "rect": {
      const c: Vec2[] = [
        [entity.x, entity.y],
        [entity.x + entity.w, entity.y],
        [entity.x + entity.w, entity.y + entity.h],
        [entity.x, entity.y + entity.h],
      ].map((p) => worldToScreen(view, p as Vec2));
      return (
        <polygon
          points={c.map((p) => `${p[0]},${p[1]}`).join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
        />
      );
    }
    case "polyline": {
      const pts = entity.points.map((p) => worldToScreen(view, p));
      const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ") + (entity.closed ? " Z" : "");
      return <path d={d} fill="none" stroke={stroke} strokeWidth={sw} />;
    }
  }
}

function DraftPreview({ tool, draft, pointer, view }: { tool: Tool; draft: Vec2[]; pointer: Vec2 | null; view: View }) {
  if (draft.length === 0 || !pointer) return null;
  const s = (p: Vec2) => worldToScreen(view, p);
  const color = "#b45309";
  if (tool === "line" && draft.length === 1) {
    const a = s(draft[0]);
    const b = s(pointer);
    return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={1.4} strokeDasharray="4 3" />;
  }
  if (tool === "rect" && draft.length === 1) {
    const a = s(draft[0]);
    const b = s(pointer);
    const x = Math.min(a[0], b[0]);
    const y = Math.min(a[1], b[1]);
    return <rect x={x} y={y} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} fill="none" stroke={color} strokeWidth={1.4} strokeDasharray="4 3" />;
  }
  if (tool === "circle" && draft.length === 1) {
    const c = s(draft[0]);
    const r = Math.hypot(pointer[0] - draft[0][0], pointer[1] - draft[0][1]) * view.scale;
    return <circle cx={c[0]} cy={c[1]} r={r} fill="none" stroke={color} strokeWidth={1.4} strokeDasharray="4 3" />;
  }
  if (tool === "polyline" && draft.length >= 1) {
    const pts = [...draft, pointer].map(s);
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
    return <path d={d} fill="none" stroke={color} strokeWidth={1.4} strokeDasharray="4 3" />;
  }
  if (tool === "arc" && draft.length >= 1) {
    const pts = [...draft, pointer].map(s);
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
    return <path d={d} fill="none" stroke={color} strokeWidth={1.2} strokeDasharray="3 3" />;
  }
  return null;
}

function buildGridLines(view: View, w: number, h: number, grid: number): number[][] {
  const lines: number[][] = [];
  const stepPx = grid * view.scale;
  if (stepPx < 6) return lines; // too dense
  const startX = view.ox % stepPx;
  for (let x = startX; x <= w; x += stepPx) lines.push([x, 0, x, h]);
  const startY = view.oy % stepPx;
  for (let y = startY; y <= h; y += stepPx) lines.push([0, y, w, y]);
  return lines;
}
