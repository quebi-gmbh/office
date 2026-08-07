/**
 * FieldCanvas — the interactive surface for placing form fields.
 *
 * Same shape as {@link AnnotateCanvas}: a rendered page bitmap underneath, an
 * SVG overlay in *view space* (page points, y down) on top, pointer capture for
 * drags. What changes is the payload — instead of ink it edits rectangles:
 * drag on empty space to place a new field, drag a field to move it, drag a
 * handle to resize it, click to select.
 *
 * Drags are local state; the committed value is pushed up on pointer-up so the
 * workspace's undo stack gets one entry per gesture, not one per mouse move.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { getThumbnail } from "~/pdf/lib/thumb-cache";
import type { OpenDoc } from "~/pdf/lib/state";
import { viewSize, type PageBox } from "~/pdf/lib/annotate";
import {
  clampRect, normalizeRect, MIN_FIELD_SIZE,
  type DraftFieldKind, type FieldDraft, type FieldRect,
} from "~/pdf/lib/form-fields";

/** Field kinds plus the two non-drawing tools. */
export type FieldTool = DraftFieldKind | "select" | "hand";

type Props = {
  doc: OpenDoc;
  page: number;
  box: PageBox;
  /** CSS pixels per PDF point. */
  zoom: number;
  tool: FieldTool;
  /** Drafts on *this* page. */
  fields: FieldDraft[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** A new rect was dragged out with a field tool. */
  onDraw: (rect: FieldRect) => void;
  /** A field was moved or resized (one call per completed gesture). */
  onGeometry: (id: string, rect: FieldRect) => void;
  panMode: boolean;
  onPan: (dx: number, dy: number) => void;
};

/** Resize handles, as unit offsets within the rect. */
const HANDLES = [
  { id: "nw", fx: 0,   fy: 0,   cursor: "nwse-resize" },
  { id: "n",  fx: 0.5, fy: 0,   cursor: "ns-resize" },
  { id: "ne", fx: 1,   fy: 0,   cursor: "nesw-resize" },
  { id: "e",  fx: 1,   fy: 0.5, cursor: "ew-resize" },
  { id: "se", fx: 1,   fy: 1,   cursor: "nwse-resize" },
  { id: "s",  fx: 0.5, fy: 1,   cursor: "ns-resize" },
  { id: "sw", fx: 0,   fy: 1,   cursor: "nesw-resize" },
  { id: "w",  fx: 0,   fy: 0.5, cursor: "ew-resize" },
] as const;

type HandleId = (typeof HANDLES)[number]["id"];

type Drag =
  | { mode: "draw"; x0: number; y0: number; rect: FieldRect }
  | { mode: "move"; id: string; dx: number; dy: number; rect: FieldRect }
  | { mode: "resize"; id: string; handle: HandleId; orig: FieldRect; rect: FieldRect };

/** Size a click (rather than a drag) drops, in points. */
const DEFAULT_SIZE: Record<DraftFieldKind, { w: number; h: number }> = {
  text: { w: 160, h: 16 },
  checkbox: { w: 12, h: 12 },
  radio: { w: 12, h: 12 },
  dropdown: { w: 120, h: 16 },
  options: { w: 120, h: 48 },
};

export const FIELD_COLORS: Record<DraftFieldKind, string> = {
  text: "#0f9d75",
  checkbox: "#2563eb",
  radio: "#7c3aed",
  dropdown: "#c2410c",
  options: "#0891b2",
};

function rectOf(f: FieldDraft): FieldRect {
  return { x: f.x, y: f.y, w: f.w, h: f.h };
}

function inside(r: FieldRect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

function cursorFor(tool: FieldTool, panMode: boolean, grabbing: boolean): string {
  if (grabbing) return "grabbing";
  if (panMode) return "grab";
  if (tool === "select") return "default";
  return "crosshair";
}

/** Apply a handle drag to the original rect (allowing it to be dragged inside-out). */
function resizeRect(orig: FieldRect, handle: HandleId, x: number, y: number): FieldRect {
  let { x: left, y: top } = orig;
  let right = orig.x + orig.w;
  let bottom = orig.y + orig.h;
  if (handle.includes("w")) left = x;
  if (handle.includes("e")) right = x;
  if (handle.includes("n")) top = y;
  if (handle.includes("s")) bottom = y;
  return normalizeRect(left, top, right, bottom);
}

export function FieldCanvas({
  doc, page, box, zoom, tool, fields, selectedId,
  onSelect, onDraw, onGeometry, panMode, onPan,
}: Props) {
  const view = viewSize(box);
  const cssW = Math.round(view.width * zoom);
  const cssH = Math.round(view.height * zoom);

  const [src, setSrc] = useState<string | null>(null);
  const [renderErr, setRenderErr] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panFrom = useRef<{ x: number; y: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  // Mirrored into a ref so pointer handlers read the freshest value without
  // reaching into a state updater (StrictMode double-invokes those).
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const putDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setRenderErr(null);
    getThumbnail(doc.id, doc.rev, doc.bytes, page, cssW, doc.password)
      .then((u) => { if (alive) setSrc(u); })
      .catch((e) => { if (alive) setRenderErr((e as Error).message); });
    return () => { alive = false; };
  }, [doc.id, doc.rev, doc.bytes, doc.password, page, cssW]);

  // Abandon an in-flight gesture when the page or tool changes underneath us.
  useEffect(() => { putDrag(null); }, [page, tool]);

  const toView = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) * (view.width / rect.width),
      y: (e.clientY - rect.top) * (view.height / rect.height),
    };
  };

  /** Handle grab radius in view points — constant on screen, so zoom-relative. */
  const handleR = 4 / zoom;

  const hitHandle = (x: number, y: number): HandleId | null => {
    const sel = fields.find((f) => f.id === selectedId);
    if (!sel) return null;
    const r = rectOf(sel);
    for (const h of HANDLES) {
      const hx = r.x + r.w * h.fx;
      const hy = r.y + r.h * h.fy;
      if (Math.abs(x - hx) <= handleR && Math.abs(y - hy) <= handleR) return h.id;
    }
    return null;
  };

  const hitField = (x: number, y: number): FieldDraft | null => {
    // Topmost first: later drafts render on top.
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i]!;
      if (inside(rectOf(f), x, y)) return f;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (panMode || e.button === 1) {
      e.preventDefault();
      svgRef.current?.setPointerCapture(e.pointerId);
      panFrom.current = { x: e.clientX, y: e.clientY };
      setGrabbing(true);
      return;
    }
    if (e.button !== 0) return;
    const pt = toView(e);
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);

    const handle = hitHandle(pt.x, pt.y);
    if (handle) {
      const sel = fields.find((f) => f.id === selectedId)!;
      putDrag({ mode: "resize", id: sel.id, handle, orig: rectOf(sel), rect: rectOf(sel) });
      return;
    }

    // Landing inside an existing field always grabs it, whatever the active
    // tool — otherwise a stray click while a field tool is armed would bury a
    // second field on top of the first. Start the drag outside to draw.
    const hit = hitField(pt.x, pt.y);
    if (hit) {
      onSelect(hit.id);
      putDrag({
        mode: "move",
        id: hit.id,
        dx: pt.x - hit.x,
        dy: pt.y - hit.y,
        rect: rectOf(hit),
      });
      return;
    }

    // Empty space: the select/pan tools just clear the selection, a field tool
    // starts drawing.
    onSelect(null);
    if (tool === "select" || tool === "hand") return;

    putDrag({ mode: "draw", x0: pt.x, y0: pt.y, rect: { x: pt.x, y: pt.y, w: 0, h: 0 } });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const from = panFrom.current;
    if (from) {
      onPan(from.x - e.clientX, from.y - e.clientY);
      panFrom.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const cur = dragRef.current;
    if (!cur) return;
    const pt = toView(e);
    if (cur.mode === "draw") {
      let x = pt.x;
      let y = pt.y;
      if (e.shiftKey) {
        // Constrain to a single-line field height — the common case.
        y = cur.y0 + Math.sign(y - cur.y0 || 1) * 16;
      }
      putDrag({ ...cur, rect: clampRect(normalizeRect(cur.x0, cur.y0, x, y), view.width, view.height) });
      return;
    }
    if (cur.mode === "move") {
      putDrag({
        ...cur,
        rect: clampRect(
          { x: pt.x - cur.dx, y: pt.y - cur.dy, w: cur.rect.w, h: cur.rect.h },
          view.width, view.height,
        ),
      });
      return;
    }
    putDrag({
      ...cur,
      rect: clampRect(resizeRect(cur.orig, cur.handle, pt.x, pt.y), view.width, view.height),
    });
  };

  const finish = (e: React.PointerEvent) => {
    if (panFrom.current) {
      panFrom.current = null;
      setGrabbing(false);
      if (svgRef.current?.hasPointerCapture(e.pointerId)) {
        svgRef.current.releasePointerCapture(e.pointerId);
      }
      return;
    }
    const cur = dragRef.current;
    putDrag(null);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    if (!cur) return;
    if (cur.mode === "draw") {
      // A plain click with a field tool drops a default-sized field rather than
      // a zero-width one nobody can grab again.
      const tiny = cur.rect.w < MIN_FIELD_SIZE || cur.rect.h < MIN_FIELD_SIZE;
      const size = tool === "select" || tool === "hand" ? DEFAULT_SIZE.text : DEFAULT_SIZE[tool];
      const rect = tiny
        ? clampRect(
            { x: cur.x0, y: cur.y0 - size.h / 2, w: size.w, h: size.h },
            view.width, view.height,
          )
        : cur.rect;
      onDraw(rect);
      return;
    }
    if (cur.rect.w < MIN_FIELD_SIZE || cur.rect.h < MIN_FIELD_SIZE) return;
    onGeometry(cur.id, cur.rect);
  };

  const dragging = drag;
  const selected = useMemo(
    () => fields.find((f) => f.id === selectedId) ?? null,
    [fields, selectedId],
  );
  /** Rect to draw for a field — the live drag value wins while it's in flight. */
  const liveRect = (f: FieldDraft): FieldRect =>
    dragging && dragging.mode !== "draw" && dragging.id === f.id ? dragging.rect : rectOf(f);

  const selRect = selected ? liveRect(selected) : null;

  return (
    <div
      className="relative select-none rounded-lg border border-border bg-white shadow-lg"
      style={{ width: cssW, height: cssH }}
    >
      {src
        ? <img src={src} alt={`Page ${page + 1}`} draggable={false}
               style={{ width: cssW, height: cssH, display: "block" }} />
        : (
          <div className="absolute inset-0 flex items-center justify-center bg-card text-xs text-muted">
            {renderErr ? `Couldn't render page ${page + 1}: ${renderErr}` : "Rendering…"}
          </div>
        )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${view.width} ${view.height}`}
        width={cssW}
        height={cssH}
        className="absolute inset-0"
        style={{ touchAction: "none", cursor: cursorFor(tool, panMode, grabbing) }}
        onAuxClick={(e) => e.preventDefault()}
        onContextMenu={(e) => { if (panMode) e.preventDefault(); }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        role="application"
        aria-label={`Form field canvas for page ${page + 1}`}
      >
        {fields.map((f) => (
          <FieldView
            key={f.id}
            field={f}
            rect={liveRect(f)}
            selected={f.id === selectedId}
            zoom={zoom}
          />
        ))}

        {dragging?.mode === "draw" && dragging.rect.w > 0 && (
          <rect
            x={dragging.rect.x} y={dragging.rect.y}
            width={dragging.rect.w} height={dragging.rect.h}
            fill={`${FIELD_COLORS[tool === "select" || tool === "hand" ? "text" : tool]}22`}
            stroke={FIELD_COLORS[tool === "select" || tool === "hand" ? "text" : tool]}
            strokeWidth={1 / zoom}
            strokeDasharray={`${3 / zoom} ${2 / zoom}`}
          />
        )}

        {selRect && (
          <g>
            {HANDLES.map((h) => (
              <rect
                key={h.id}
                x={selRect.x + selRect.w * h.fx - handleR}
                y={selRect.y + selRect.h * h.fy - handleR}
                width={handleR * 2}
                height={handleR * 2}
                fill="#ffffff"
                stroke="#0f9d75"
                strokeWidth={1 / zoom}
                style={{ cursor: h.cursor }}
              />
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}

/** One field draft in the overlay. Proposed (undetected-reviewed) fields dash. */
const FieldView = memo(function FieldView({
  field, rect, selected, zoom,
}: {
  field: FieldDraft;
  rect: FieldRect;
  selected: boolean;
  zoom: number;
}) {
  const color = FIELD_COLORS[field.kind];
  const proposed = field.status === "proposed";
  const labelSize = Math.max(5, Math.min(8, rect.h * 0.6));
  return (
    <g>
      <rect
        x={rect.x} y={rect.y} width={rect.w} height={rect.h}
        fill={`${color}${proposed ? "14" : "22"}`}
        stroke={color}
        strokeWidth={(selected ? 1.6 : 1) / zoom}
        strokeDasharray={proposed ? `${3 / zoom} ${2 / zoom}` : undefined}
      />
      {rect.h >= 8 && rect.w >= 24 && (
        <text
          x={rect.x + 1.5}
          y={rect.y + labelSize + 1}
          fill={color}
          fontSize={labelSize}
          fontFamily="ui-monospace, Menlo, monospace"
          style={{ pointerEvents: "none" }}
        >
          {field.name}
        </text>
      )}
    </g>
  );
});
