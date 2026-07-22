/**
 * The interactive SVG canvas: renders the artboard, grid, every node, and the
 * selection overlay (resize + rotate handles), and drives all pointer gestures
 * (create / select / marquee / move / resize / rotate / pan / freehand / pen /
 * text). Content is drawn in a zoom/pan-scaled <g>; the overlay is drawn in
 * screen space so handle sizes stay constant.
 */
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent } from "react";
import { expandGroups, type VectorEngine } from "~/vector/lib/engine";
import type { ViewportApi } from "~/vector/hooks/useViewport";
import {
  hitTest,
  localBBox,
  moveNode,
  nodeCenter,
  nodeInMarquee,
  scaleNode,
  snap,
  snapPoint,
  worldBounds,
  worldCorners,
} from "~/vector/lib/geometry";
import { nodeToSvgEl, sceneDefsSvg } from "~/vector/lib/render";
import { makeParametricShape, isParametricTool } from "~/vector/lib/shapes";
import { imageNodeFromFile } from "~/vector/io/image";
import { newId } from "~/vector/lib/id";
import type { Point, VNode, VectorState } from "~/vector/lib/types";

/** A snap target line (document-space position on one axis). */
interface SnapLine {
  axis: "x" | "y";
  pos: number;
}

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Frame {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  angle: number;
}

type Gesture =
  | { kind: "none" }
  | { kind: "create"; start: Point }
  | { kind: "pencil"; points: Point[] }
  | { kind: "marquee"; start: Point }
  | { kind: "move"; start: Point; snapshot: Map<string, VNode> }
  | { kind: "resize"; handle: HandleId; frame: Frame; snapshot: Map<string, VNode> }
  | { kind: "rotate"; pivot: Point; startAngle: number; snapshot: Map<string, VNode> }
  | { kind: "guide"; id: string; axis: "x" | "y" }
  | { kind: "pan"; start: Point; origin: { x: number; y: number } };

interface Props {
  engine: VectorEngine;
  state: VectorState;
  viewport: ViewportApi;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

function rotateAround(p: Point, cx: number, cy: number, deg: number): Point {
  const r = rad(deg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

/** Selection frame: a single node keeps its own rotation; groups are AABB. */
function selectionFrame(nodes: VNode[]): Frame | null {
  if (nodes.length === 0) return null;
  if (nodes.length === 1) {
    const b = localBBox(nodes[0]);
    return { cx: b.x + b.w / 2, cy: b.y + b.h / 2, hw: b.w / 2, hh: b.h / 2, angle: nodes[0].rotation };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    for (const [x, y] of worldCorners(n)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, hw: (maxX - minX) / 2, hh: (maxY - minY) / 2, angle: 0 };
}

const HANDLES: { id: HandleId; ux: number; uy: number }[] = [
  { id: "nw", ux: -1, uy: -1 },
  { id: "n", ux: 0, uy: -1 },
  { id: "ne", ux: 1, uy: -1 },
  { id: "e", ux: 1, uy: 0 },
  { id: "se", ux: 1, uy: 1 },
  { id: "s", ux: 0, uy: 1 },
  { id: "sw", ux: -1, uy: 1 },
  { id: "w", ux: -1, uy: 0 },
];

const CURSORS: Record<HandleId, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

export function Canvas({ engine, state, viewport, containerRef }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gestureRef = useRef<Gesture>({ kind: "none" });
  const [draft, setDraft] = useState<VNode | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [pen, setPen] = useState<{ points: Point[]; cursor: Point } | null>(null);
  const [edit, setEdit] = useState<{ id: string; value: string } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);

  const { view, doc, grid } = state;
  const toScreen = (p: Point): Point => [p[0] * view.zoom + view.panX, p[1] * view.zoom + view.panY];

  const gridSnap = (p: Point): Point => (grid.snap ? snapPoint(p, grid.size) : p);

  // ─── Space-to-pan ──────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isEditable(e.target)) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Commit an in-progress pen/polyline when the tool changes away.
  useEffect(() => {
    if (state.tool !== "pen" && state.tool !== "polyline" && pen) commitPen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tool]);

  const selectedNodes = () => state.nodes.filter((n) => state.selection.includes(n.id));

  // ─── Live gesture update (no history commit) ────────────────────────────────
  function liveUpdate(newById: Map<string, VNode>) {
    engine.updateNodes([...newById.keys()], (n) => newById.get(n.id) ?? n, false);
  }

  // ─── Pointer down ───────────────────────────────────────────────────────────
  function onPointerDown(e: RPointerEvent<SVGSVGElement>) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const world = viewport.screenToDoc(e.clientX, e.clientY);

    // Panning: middle button or space held.
    if (e.button === 1 || spaceDown) {
      gestureRef.current = { kind: "pan", start: [e.clientX, e.clientY], origin: { x: view.panX, y: view.panY } };
      return;
    }
    if (e.button !== 0) return;

    switch (state.tool) {
      case "select":
        beginSelect(e, world);
        return;
      case "text":
        beginText(gridSnap(world));
        return;
      case "pencil":
        gestureRef.current = { kind: "pencil", points: [world] };
        return;
      case "pen":
      case "polyline":
        addPenPoint(gridSnap(world));
        return;
      default:
        gestureRef.current = { kind: "create", start: gridSnap(world) };
        setDraft(buildDraft(state, gridSnap(world), gridSnap(world)));
        return;
    }
  }

  function beginSelect(e: RPointerEvent, world: Point) {
    const tol = 6 / view.zoom;
    // Top-most hit (skipping hidden + locked objects).
    let hit: VNode | null = null;
    for (let i = state.nodes.length - 1; i >= 0; i--) {
      const n = state.nodes[i];
      if (n.hidden || n.locked) continue;
      if (hitTest(n, world, tol)) {
        hit = n;
        break;
      }
    }
    if (hit) {
      const groupIds = expandGroups(state.nodes, [hit.id]);
      const already = state.selection.includes(hit.id);
      if (e.shiftKey) {
        groupIds.forEach((id) => engine.toggleInSelection(id));
        return;
      }
      if (!already) engine.select(groupIds);
      const ids = already ? state.selection : groupIds;
      const snapshot = new Map(state.nodes.filter((n) => ids.includes(n.id)).map((n) => [n.id, n]));
      gestureRef.current = { kind: "move", start: world, snapshot };
    } else {
      if (!e.shiftKey) engine.clearSelection();
      gestureRef.current = { kind: "marquee", start: world };
      setMarquee({ x: world[0], y: world[1], w: 0, h: 0 });
    }
  }

  function beginHandleResize(e: RPointerEvent, handle: HandleId) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const nodes = selectedNodes();
    const frame = selectionFrame(nodes);
    if (!frame) return;
    const snapshot = new Map(nodes.map((n) => [n.id, n]));
    gestureRef.current = { kind: "resize", handle, frame, snapshot };
  }

  function beginGuideDrag(e: RPointerEvent, id: string, axis: "x" | "y") {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    gestureRef.current = { kind: "guide", id, axis };
  }

  function beginRotate(e: RPointerEvent) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const nodes = selectedNodes();
    const frame = selectionFrame(nodes);
    if (!frame) return;
    const world = viewport.screenToDoc(e.clientX, e.clientY);
    const startAngle = (Math.atan2(world[1] - frame.cy, world[0] - frame.cx) * 180) / Math.PI;
    const snapshot = new Map(nodes.map((n) => [n.id, n]));
    gestureRef.current = { kind: "rotate", pivot: [frame.cx, frame.cy], startAngle, snapshot };
  }

  // ─── Pointer move ───────────────────────────────────────────────────────────
  function onPointerMove(e: RPointerEvent<SVGSVGElement>) {
    const g = gestureRef.current;
    if (g.kind === "none") {
      if ((state.tool === "pen" || state.tool === "polyline") && pen) {
        setPen({ ...pen, cursor: gridSnap(viewport.screenToDoc(e.clientX, e.clientY)) });
      }
      return;
    }
    const world = viewport.screenToDoc(e.clientX, e.clientY);

    switch (g.kind) {
      case "pan": {
        engine.setView({ panX: g.origin.x + (e.clientX - g.start[0]), panY: g.origin.y + (e.clientY - g.start[1]) });
        return;
      }
      case "create": {
        setDraft(buildDraft(state, g.start, gridSnap(world), e.shiftKey));
        return;
      }
      case "pencil": {
        const last = g.points[g.points.length - 1];
        if (Math.hypot(world[0] - last[0], world[1] - last[1]) * view.zoom >= 2) {
          g.points.push(world);
          setDraft({
            id: "draft",
            type: "path",
            points: g.points.slice(),
            rotation: 0,
            fill: null,
            stroke: state.defaults.stroke ?? state.defaults.fill ?? "#111827",
            strokeWidth: state.defaults.strokeWidth,
            opacity: state.defaults.opacity,
          });
        }
        return;
      }
      case "marquee": {
        const x = Math.min(g.start[0], world[0]);
        const y = Math.min(g.start[1], world[1]);
        setMarquee({ x, y, w: Math.abs(world[0] - g.start[0]), h: Math.abs(world[1] - g.start[1]) });
        return;
      }
      case "move": {
        const rawDx = world[0] - g.start[0];
        const rawDy = world[1] - g.start[1];
        let dx = rawDx;
        let dy = rawDy;
        if (grid.snap) {
          // Snap using the first node's origin as the alignment anchor.
          const first = g.snapshot.values().next().value as VNode;
          const b = localBBox(first);
          dx = snap(b.x + rawDx, grid.size) - b.x;
          dy = snap(b.y + rawDy, grid.size) - b.y;
          setSnapLines([]);
        } else if (grid.snapObjects) {
          const snapped = computeObjectSnap(g.snapshot, rawDx, rawDy, state, (grid.tolerance || 8) / view.zoom);
          dx = snapped.dx;
          dy = snapped.dy;
          setSnapLines(snapped.lines);
        }
        const out = new Map<string, VNode>();
        g.snapshot.forEach((n, id) => out.set(id, moveNode(n, dx, dy)));
        liveUpdate(out);
        return;
      }
      case "resize": {
        applyResize(g, world, e.shiftKey);
        return;
      }
      case "guide": {
        engine.updateGuide(g.id, g.axis === "x" ? gridSnap(world)[0] : gridSnap(world)[1]);
        return;
      }
      case "rotate": {
        let angle = (Math.atan2(world[1] - g.pivot[1], world[0] - g.pivot[0]) * 180) / Math.PI;
        let dAngle = angle - g.startAngle;
        if (e.shiftKey) dAngle = Math.round(dAngle / 15) * 15;
        const out = new Map<string, VNode>();
        g.snapshot.forEach((n, id) => {
          const c = nodeCenter(n);
          const nc = rotateAround(c, g.pivot[0], g.pivot[1], dAngle);
          out.set(id, { ...moveNode(n, nc[0] - c[0], nc[1] - c[1]), rotation: n.rotation + dAngle });
        });
        liveUpdate(out);
        return;
      }
    }
  }

  function applyResize(g: Extract<Gesture, { kind: "resize" }>, world: Point, uniform: boolean) {
    const { frame, handle } = g;
    const { cx, cy, hw, hh, angle } = frame;
    // Pointer into the frame's local (un-rotated) space.
    const localP = rotateAround(world, cx, cy, -angle);
    const px = grid.snap && angle === 0 ? snap(localP[0], grid.size) : localP[0];
    const py = grid.snap && angle === 0 ? snap(localP[1], grid.size) : localP[1];
    const left = cx - hw;
    const right = cx + hw;
    const top = cy - hh;
    const bottom = cy + hh;
    const hasE = handle.includes("e");
    const hasW = handle.includes("w");
    const hasN = handle.includes("n");
    const hasS = handle.includes("s");

    let originX = cx;
    let originY = cy;
    let sx = 1;
    let sy = 1;
    if (hasE) {
      originX = left;
      sx = (px - left) / (2 * hw || 1);
    } else if (hasW) {
      originX = right;
      sx = (right - px) / (2 * hw || 1);
    }
    if (hasS) {
      originY = top;
      sy = (py - top) / (2 * hh || 1);
    } else if (hasN) {
      originY = bottom;
      sy = (bottom - py) / (2 * hh || 1);
    }
    if (uniform && (hasE || hasW) && (hasN || hasS)) {
      const s = Math.max(Math.abs(sx), Math.abs(sy));
      sx = Math.sign(sx || 1) * s;
      sy = Math.sign(sy || 1) * s;
    }
    if (Math.abs(sx) < 0.01) sx = sx < 0 ? -0.01 : 0.01;
    if (Math.abs(sy) < 0.01) sy = sy < 0 ? -0.01 : 0.01;

    const out = new Map<string, VNode>();
    g.snapshot.forEach((n, id) => out.set(id, scaleNode(n, originX, originY, sx, sy)));
    liveUpdate(out);
  }

  // ─── Pointer up ─────────────────────────────────────────────────────────────
  function onPointerUp(e: RPointerEvent<SVGSVGElement>) {
    const g = gestureRef.current;
    gestureRef.current = { kind: "none" };
    if (snapLines.length) setSnapLines([]);

    switch (g.kind) {
      case "create": {
        const world = viewport.screenToDoc(e.clientX, e.clientY);
        finishCreate(g.start, gridSnap(world), e.shiftKey);
        setDraft(null);
        return;
      }
      case "pencil": {
        if (g.points.length >= 2) {
          engine.addNode({
            id: newId(),
            type: "path",
            points: g.points,
            rotation: 0,
            fill: null,
            stroke: state.defaults.stroke ?? state.defaults.fill ?? "#111827",
            strokeWidth: state.defaults.strokeWidth,
            opacity: state.defaults.opacity,
          });
        }
        setDraft(null);
        return;
      }
      case "marquee": {
        if (marquee) {
          const inside = state.nodes
            .filter((n) => !n.hidden && !n.locked && nodeInMarquee(n, marquee))
            .map((n) => n.id);
          engine.select(e.shiftKey ? [...new Set([...state.selection, ...inside])] : inside);
        }
        setMarquee(null);
        return;
      }
      case "move":
      case "resize":
      case "rotate":
        engine.commit();
        return;
      case "guide": {
        const world = viewport.screenToDoc(e.clientX, e.clientY);
        const off = g.axis === "x" ? world[0] < 0 || world[0] > doc.width : world[1] < 0 || world[1] > doc.height;
        if (off) engine.removeGuide(g.id);
        else engine.commit();
        return;
      }
    }
  }

  function finishCreate(start: Point, end: Point, uniform: boolean) {
    const dist = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const boxTool =
      state.tool === "rect" ||
      state.tool === "rounded-rect" ||
      state.tool === "ellipse" ||
      isParametricTool(state.tool);
    if (dist < 3 && boxTool) {
      // Click without drag → default-sized shape centred on the point.
      const w = 120;
      const h = 90;
      const s: Point = [start[0] - w / 2, start[1] - h / 2];
      engine.addNode({ ...buildDraft(state, s, [s[0] + w, s[1] + h]), id: newId() } as VNode);
      engine.setTool("select");
      return;
    }
    if (dist < 3) return;
    engine.addNode({ ...buildDraft(state, start, end, uniform), id: newId() } as VNode);
    engine.setTool("select");
  }

  // ─── Pen / polyline (click-to-place) ───────────────────────────────────────
  function addPenPoint(p: Point) {
    setPen((prev) => {
      if (!prev) return { points: [p], cursor: p };
      // Double-click near the first point closes / finishes.
      return { points: [...prev.points, p], cursor: p };
    });
  }

  function commitPen() {
    setPen((prev) => {
      if (prev && prev.points.length >= 2) {
        engine.addNode({
          id: newId(),
          type: "polyline",
          points: prev.points,
          closed: false,
          rotation: 0,
          fill: null,
          stroke: state.defaults.stroke ?? "#111827",
          strokeWidth: state.defaults.strokeWidth,
          opacity: state.defaults.opacity,
        });
      }
      return null;
    });
  }

  function onDoubleClick(e: RPointerEvent<SVGSVGElement>) {
    if ((state.tool === "pen" || state.tool === "polyline") && pen) {
      commitPen();
      return;
    }
    if (state.tool === "select") {
      const world = viewport.screenToDoc(e.clientX, e.clientY);
      const tol = 6 / view.zoom;
      for (let i = state.nodes.length - 1; i >= 0; i--) {
        const n = state.nodes[i];
        if (n.type === "text" && hitTest(n, world, tol)) {
          engine.select([n.id]);
          setEdit({ id: n.id, value: n.text });
          return;
        }
      }
    }
  }

  // ─── Text ───────────────────────────────────────────────────────────────────
  function beginText(p: Point) {
    const id = newId();
    const node: VNode = {
      id,
      type: "text",
      x: p[0],
      y: p[1],
      text: "",
      fontSize: state.textDefaults.fontSize,
      fontFamily: state.textDefaults.fontFamily,
      rotation: 0,
      fill: state.defaults.fill ?? "#111827",
      stroke: null,
      strokeWidth: 0,
      opacity: state.defaults.opacity,
    };
    engine.addNode(node);
    engine.setTool("select");
    setEdit({ id, value: "" });
  }

  function commitEdit() {
    if (!edit) return;
    const value = edit.value;
    const node = state.nodes.find((n) => n.id === edit.id);
    setEdit(null);
    if (!node) return;
    if (value.trim() === "") {
      // Remove empty text nodes.
      engine.replaceNodes(state.nodes.filter((n) => n.id !== edit.id));
      return;
    }
    engine.updateNodes([edit.id], (n) => (n.type === "text" ? { ...n, text: value } : n));
  }

  // ─── Wheel: zoom (ctrl/⌘) or pan ────────────────────────────────────────────
  // Attached natively as a non-passive listener so we can preventDefault()
  // (otherwise ctrl+wheel triggers the browser's page zoom).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = engine.store.getSnapshot().view;
      if (e.ctrlKey || e.metaKey) {
        viewport.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      } else {
        engine.setView({ panX: v.panX - e.deltaX, panY: v.panY - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [engine, viewport]);

  // ─── Paste a raster image from the clipboard ────────────────────────────────
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (isEditable(e.target)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (!file) continue;
          e.preventDefault();
          const r = containerRef.current?.getBoundingClientRect();
          const at = viewport.screenToDoc((r?.left ?? 0) + (r?.width ?? 0) / 2, (r?.top ?? 0) + (r?.height ?? 0) / 2);
          engine.addNode(await imageNodeFromFile(file, { at }));
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [engine, viewport, containerRef]);

  async function onDrop(e: React.DragEvent) {
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    e.preventDefault();
    const at = viewport.screenToDoc(e.clientX, e.clientY);
    engine.addNode(await imageNodeFromFile(file, { at }));
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  const selNodes = selectedNodes();
  const frame = selectionFrame(selNodes);
  const cursor = spaceDown
    ? "grab"
    : state.tool === "select"
      ? "default"
      : state.tool === "text"
        ? "text"
        : "crosshair";

  const editNode = edit ? state.nodes.find((n) => n.id === edit.id) : null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-bg"
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={(e) => {
          if (gestureRef.current.kind !== "none" && e.buttons === 0) onPointerUp(e);
        }}
        onDoubleClick={onDoubleClick}
      >
        {/* Gradient + marker defs shared by canvas and export. */}
        <defs dangerouslySetInnerHTML={{ __html: sceneDefsSvg(draft ? [...state.nodes, draft] : state.nodes) }} />

        {/* Artboard + grid, drawn in document space. */}
        <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}>
          <rect
            x={0}
            y={0}
            width={doc.width}
            height={doc.height}
            fill={doc.background === "transparent" ? "#ffffff" : doc.background}
            stroke="rgba(11,17,32,0.15)"
            strokeWidth={1 / view.zoom}
          />
          {grid.show && <GridPattern doc={doc} size={grid.size} zoom={view.zoom} />}
          <g style={{ pointerEvents: "none" }}>
            {state.nodes.map((n) => (
              <NodeShape key={n.id} node={n} hidden={edit?.id === n.id} />
            ))}
            {draft && <NodeShape node={draft} />}
            {pen && <PenPreview points={pen.points} cursor={pen.cursor} state={state} />}
          </g>
          {/* Draggable guides. */}
          {(doc.guides ?? []).map((gd) =>
            gd.axis === "x" ? (
              <line
                key={gd.id}
                x1={gd.pos}
                y1={0}
                x2={gd.pos}
                y2={doc.height}
                stroke="#22d3ee"
                strokeWidth={1 / view.zoom}
                style={{ cursor: "ew-resize" }}
                onPointerDown={(e) => beginGuideDrag(e, gd.id, "x")}
              />
            ) : (
              <line
                key={gd.id}
                x1={0}
                y1={gd.pos}
                x2={doc.width}
                y2={gd.pos}
                stroke="#22d3ee"
                strokeWidth={1 / view.zoom}
                style={{ cursor: "ns-resize" }}
                onPointerDown={(e) => beginGuideDrag(e, gd.id, "y")}
              />
            ),
          )}
          {/* Smart-guide snap lines. */}
          {snapLines.map((l, i) =>
            l.axis === "x" ? (
              <line key={i} x1={l.pos} y1={0} x2={l.pos} y2={doc.height} stroke="#f472b6" strokeWidth={1 / view.zoom} style={{ pointerEvents: "none" }} />
            ) : (
              <line key={i} x1={0} y1={l.pos} x2={doc.width} y2={l.pos} stroke="#f472b6" strokeWidth={1 / view.zoom} style={{ pointerEvents: "none" }} />
            ),
          )}
        </g>

        {/* Overlay: selection box + handles, in screen space. */}
        {frame && state.tool === "select" && (
          <SelectionOverlay
            frame={frame}
            toScreen={toScreen}
            zoom={view.zoom}
            onResizeStart={beginHandleResize}
            onRotateStart={beginRotate}
          />
        )}
        {marquee && (
          <rect
            x={marquee.x * view.zoom + view.panX}
            y={marquee.y * view.zoom + view.panY}
            width={marquee.w * view.zoom}
            height={marquee.h * view.zoom}
            fill="rgba(15,157,117,0.10)"
            stroke="var(--color-accent)"
            strokeDasharray="4 3"
          />
        )}
      </svg>

      {/* Inline single-line text editor. */}
      {edit && editNode && editNode.type === "text" && (
        <input
          autoFocus
          value={edit.value}
          onChange={(ev) => setEdit({ ...edit, value: ev.target.value })}
          onBlur={commitEdit}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              commitEdit();
            } else if (ev.key === "Escape") {
              ev.preventDefault();
              commitEdit();
            }
          }}
          className="absolute z-10 border border-accent bg-white/95 px-1 text-black outline-none"
          style={{
            left: editNode.x * view.zoom + view.panX,
            top: (editNode.y - editNode.fontSize * 0.8) * view.zoom + view.panY,
            fontSize: editNode.fontSize * view.zoom,
            fontFamily: editNode.fontFamily,
            minWidth: 40,
          }}
        />
      )}
    </div>
  );
}

// ─── Presentational sub-components ────────────────────────────────────────────

function NodeShape({ node, hidden }: { node: VNode; hidden?: boolean }) {
  if (hidden || node.hidden) return null;
  const el = nodeToSvgEl(node);
  const attrs = el.attrs as Record<string, string | number>;
  if (el.tag === "text" && node.type === "text") {
    const lines = el.lines ?? [node.text];
    const lh = (node.lineHeight ?? 1.2) * node.fontSize;
    if (lines.length <= 1) return <text {...attrs}>{node.text}</text>;
    return (
      <text {...attrs}>
        {lines.map((ln, i) => (
          <tspan key={i} x={attrs.x} dy={i === 0 ? 0 : lh}>
            {ln}
          </tspan>
        ))}
      </text>
    );
  }
  if (el.tag === "image") {
    return <image {...attrs} />;
  }
  const Tag = el.tag as "rect";
  return <Tag {...attrs} />;
}

function GridPattern({ doc, size }: { doc: { width: number; height: number }; size: number; zoom: number }) {
  const lines: React.ReactNode[] = [];
  for (let x = size; x < doc.width; x += size) {
    lines.push(<line key={`vx${x}`} x1={x} y1={0} x2={x} y2={doc.height} stroke="#1e293b" strokeWidth={0.5} />);
  }
  for (let y = size; y < doc.height; y += size) {
    lines.push(<line key={`hy${y}`} x1={0} y1={y} x2={doc.width} y2={y} stroke="#1e293b" strokeWidth={0.5} />);
  }
  return <g style={{ pointerEvents: "none" }}>{lines}</g>;
}

function PenPreview({ points, cursor, state }: { points: Point[]; cursor: Point; state: VectorState }) {
  const all = [...points, cursor];
  const d = all.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  return (
    <g style={{ pointerEvents: "none" }}>
      <path d={d} fill="none" stroke={state.defaults.stroke ?? "var(--color-accent)"} strokeWidth={state.defaults.strokeWidth} />
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={3 / state.view.zoom} fill="var(--color-accent)" />
      ))}
    </g>
  );
}

function SelectionOverlay({
  frame,
  toScreen,
  onResizeStart,
  onRotateStart,
}: {
  frame: Frame;
  toScreen: (p: Point) => Point;
  zoom: number;
  onResizeStart: (e: RPointerEvent, handle: HandleId) => void;
  onRotateStart: (e: RPointerEvent) => void;
}) {
  const corner = (ux: number, uy: number): Point => {
    const local: Point = [frame.cx + ux * frame.hw, frame.cy + uy * frame.hh];
    return toScreen(rotateAround(local, frame.cx, frame.cy, frame.angle));
  };
  const [tlx, tly] = corner(-1, -1);
  const [trx, try_] = corner(1, -1);
  const [brx, bry] = corner(1, 1);
  const [blx, bly] = corner(-1, 1);
  const rotateAnchor = toScreen(
    rotateAround([frame.cx, frame.cy - frame.hh - 24 / 1], frame.cx, frame.cy, frame.angle),
  );
  const topMid = corner(0, -1);

  return (
    <g>
      <polygon
        points={`${tlx},${tly} ${trx},${try_} ${brx},${bry} ${blx},${bly}`}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={1.5}
        style={{ pointerEvents: "none" }}
      />
      <line x1={topMid[0]} y1={topMid[1]} x2={rotateAnchor[0]} y2={rotateAnchor[1]} stroke="var(--color-accent)" strokeWidth={1} style={{ pointerEvents: "none" }} />
      <circle
        cx={rotateAnchor[0]}
        cy={rotateAnchor[1]}
        r={6}
        fill="#ffffff"
        stroke="var(--color-accent)"
        strokeWidth={1.5}
        style={{ cursor: "grab" }}
        onPointerDown={onRotateStart}
      />
      {HANDLES.map((h) => {
        const [sx, sy] = corner(h.ux, h.uy);
        return (
          <rect
            key={h.id}
            x={sx - 5}
            y={sy - 5}
            width={10}
            height={10}
            fill="#ffffff"
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            style={{ cursor: CURSORS[h.id] }}
            onPointerDown={(e) => onResizeStart(e, h.id)}
          />
        );
      })}
    </g>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable === true;
}

/** Snap a moving selection to other objects' edges/centres, guides & artboard. */
function computeObjectSnap(
  snapshot: Map<string, VNode>,
  rawDx: number,
  rawDy: number,
  state: VectorState,
  tol: number,
): { dx: number; dy: number; lines: SnapLine[] } {
  const movingIds = new Set(snapshot.keys());
  // Union world bounds of the moving set at the raw offset.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  snapshot.forEach((n) => {
    const b = worldBounds(moveNode(n, rawDx, rawDy));
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  });
  const candX = [0, state.doc.width];
  const candY = [0, state.doc.height];
  for (const n of state.nodes) {
    if (movingIds.has(n.id) || n.hidden) continue;
    const b = worldBounds(n);
    candX.push(b.minX, (b.minX + b.maxX) / 2, b.maxX);
    candY.push(b.minY, (b.minY + b.maxY) / 2, b.maxY);
  }
  for (const g of state.doc.guides ?? []) (g.axis === "x" ? candX : candY).push(g.pos);

  const snapAxis = (vals: number[], cands: number[]): { adj: number; pos: number | null } => {
    let bestDist = tol;
    let adj = 0;
    let pos: number | null = null;
    for (const v of vals) for (const c of cands) {
      const d = Math.abs(v - c);
      if (d < bestDist) { bestDist = d; adj = c - v; pos = c; }
    }
    return { adj, pos };
  };
  const xr = snapAxis([minX, (minX + maxX) / 2, maxX], candX);
  const yr = snapAxis([minY, (minY + maxY) / 2, maxY], candY);
  const lines: SnapLine[] = [];
  if (xr.pos !== null) lines.push({ axis: "x", pos: xr.pos });
  if (yr.pos !== null) lines.push({ axis: "y", pos: yr.pos });
  return { dx: rawDx + xr.adj, dy: rawDy + yr.adj, lines };
}

/** Draft node for the active creation tool (parametric or box-drag). */
function buildDraft(state: VectorState, start: Point, end: Point, uniform = false): VNode {
  if (isParametricTool(state.tool)) {
    return makeParametricShape(state.tool, start, end, state.defaults, state.shapeDefaults, "draft");
  }
  return makeShape(state, start, end, uniform);
}

/** Build a shape node from a drag rectangle for the active creation tool. */
function makeShape(state: VectorState, start: Point, end: Point, uniform = false): VNode {
  const id = "draft";
  let x = Math.min(start[0], end[0]);
  let y = Math.min(start[1], end[1]);
  let w = Math.abs(end[0] - start[0]);
  let h = Math.abs(end[1] - start[1]);
  if (uniform) {
    const s = Math.max(w, h);
    w = s;
    h = s;
    x = end[0] < start[0] ? start[0] - s : start[0];
    y = end[1] < start[1] ? start[1] - s : start[1];
  }
  const style = state.defaults;
  const common = { id, rotation: 0, ...style };
  switch (state.tool) {
    case "rect":
      return { ...common, type: "rect", x, y, w, h, rx: 0 };
    case "rounded-rect":
      return { ...common, type: "rect", x, y, w, h, rx: Math.min(w, h) * 0.15 };
    case "ellipse":
      return { ...common, type: "ellipse", x, y, w, h };
    case "line":
      return { ...common, type: "line", x1: start[0], y1: start[1], x2: end[0], y2: end[1], fill: null };
    default:
      return { ...common, type: "rect", x, y, w, h, rx: 0 };
  }
}
