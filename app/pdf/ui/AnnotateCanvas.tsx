/**
 * AnnotateCanvas — the interactive drawing surface for the PDF tool's Draw
 * mode. A rendered page bitmap sits underneath; every annotation (committed or
 * in progress) is painted as SVG on top, in *view space* (page points, y down),
 * so the overlay is resolution-independent and matches the burn exactly.
 *
 * The pointer handlers are deliberately the only stateful part: strokes are
 * pushed up to the caller on pointer-up, which owns undo/redo.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { getThumbnail } from "~/pdf/lib/thumb-cache";
import type { OpenDoc } from "~/pdf/lib/state";
import {
  annotId, annotPaths, eraseHits, viewSize,
  type Annotation, type AnnotTool, type InkPoint, type PageBox, type ShapeAnnot,
} from "~/pdf/lib/annotate";
import type { StoredSignature } from "~/pdf/lib/signatures";

export type DrawStyle = {
  /** Hex `#rrggbb`. */
  color: string;
  /** Nib / outline width in points. */
  width: number;
  /** 0–1. */
  opacity: number;
  /** Fill for rect/ellipse (hex) or null for outline-only. */
  fill: string | null;
  /** Font size in points for the text tool. */
  textSize: number;
  /** Eraser tip radius in points. */
  eraserSize: number;
  /** Placement width in points for the signature stamp. */
  signatureWidth: number;
};

type Props = {
  doc: OpenDoc;
  page: number;
  box: PageBox;
  /** CSS pixels per PDF point. */
  zoom: number;
  tool: AnnotTool;
  style: DrawStyle;
  signature: StoredSignature | null;
  onAdd: (a: Annotation) => void;
  onErase: (ids: string[]) => void;
};

/** Minimum pointer travel (in points) before we record another ink sample. */
const MIN_STEP = 0.6;

function isShapeAnnot(a: Annotation): a is ShapeAnnot {
  return a.kind === "line" || a.kind === "arrow" || a.kind === "rect" || a.kind === "ellipse";
}

function cursorFor(tool: AnnotTool): string {
  if (tool === "text") return "text";
  if (tool === "eraser") return "cell";
  return "crosshair";
}

export function AnnotateCanvas({
  doc, page, box, zoom, tool, style, signature, onAdd, onErase,
}: Props) {
  const view = viewSize(box);
  const cssW = Math.round(view.width * zoom);
  const cssH = Math.round(view.height * zoom);

  const [src, setSrc] = useState<string | null>(null);
  const [renderErr, setRenderErr] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const active = useRef(false);
  const startPt = useRef<{ x: number; y: number } | null>(null);

  // The in-progress annotation is mirrored into a ref so pointer handlers can
  // read the freshest value without reaching into a state updater (which
  // StrictMode double-invokes — side effects there would duplicate strokes).
  const [draft, setDraftState] = useState<Annotation | null>(null);
  const draftRef = useRef<Annotation | null>(null);
  const putDraft = (next: Annotation | null) => {
    draftRef.current = next;
    setDraftState(next);
  };

  type TextDraft = { x: number; y: number; value: string };
  const [textDraft, setTextDraftState] = useState<TextDraft | null>(null);
  const textDraftRef = useRef<TextDraft | null>(null);
  const putTextDraft = (next: TextDraft | null) => {
    textDraftRef.current = next;
    setTextDraftState(next);
  };

  // Page bitmap (cached globally by doc/rev/page/width).
  useEffect(() => {
    let alive = true;
    setSrc(null);
    setRenderErr(null);
    getThumbnail(doc.id, doc.rev, doc.bytes, page, cssW, doc.password)
      .then((u) => { if (alive) setSrc(u); })
      .catch((e) => { if (alive) setRenderErr((e as Error).message); });
    return () => { alive = false; };
  }, [doc.id, doc.rev, doc.bytes, doc.password, page, cssW]);

  // Abandon an in-flight stroke when the page or tool changes underneath us.
  useEffect(() => {
    active.current = false;
    draftRef.current = null;
    setDraftState(null);
    textDraftRef.current = null;
    setTextDraftState(null);
  }, [page, tool]);

  const toView = (e: React.PointerEvent): { x: number; y: number; p: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0, p: 0.5 };
    const sx = view.width / rect.width;
    const sy = view.height / rect.height;
    const pressure = e.pointerType === "mouse" ? 0.5 : (e.pressure > 0 ? e.pressure : 0.5);
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
      p: pressure,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const pt = toView(e);

    if (tool === "text") {
      putTextDraft({ x: pt.x, y: pt.y, value: "" });
      return;
    }

    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    active.current = true;
    startPt.current = { x: pt.x, y: pt.y };

    if (tool === "eraser") {
      onErase(eraseHits(doc.annots, page, pt.x, pt.y, style.eraserSize));
      return;
    }

    const base = { id: annotId(), page, color: style.color, opacity: style.opacity };
    if (tool === "pen" || tool === "highlighter") {
      putDraft({
        ...base,
        kind: tool,
        points: [[pt.x, pt.y, pt.p]],
        width: style.width,
        opacity: tool === "highlighter" ? Math.min(style.opacity, 0.45) : style.opacity,
      });
      return;
    }
    if (tool === "signature") {
      if (!signature) { active.current = false; return; }
      putDraft({
        ...base,
        kind: "signature",
        x: pt.x,
        y: pt.y,
        w: 0,
        h: 0,
        paths: signature.paths,
      });
      return;
    }
    putDraft({
      ...base,
      kind: tool,
      x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y,
      width: style.width,
      fill: tool === "rect" || tool === "ellipse" ? style.fill : null,
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!active.current) return;
    const pt = toView(e);

    if (tool === "eraser") {
      onErase(eraseHits(doc.annots, page, pt.x, pt.y, style.eraserSize));
      return;
    }

    const cur = draftRef.current;
    if (!cur) return;
    if (cur.kind === "pen" || cur.kind === "highlighter") {
      const last = cur.points[cur.points.length - 1]!;
      if (Math.hypot(pt.x - last[0], pt.y - last[1]) < MIN_STEP) return;
      putDraft({ ...cur, points: [...cur.points, [pt.x, pt.y, pt.p] as InkPoint] });
      return;
    }
    if (cur.kind === "signature") {
      // Drag from the top-left corner; the aspect ratio is locked.
      const s = startPt.current ?? { x: cur.x, y: cur.y };
      const aspect = Math.max(0.05, signature?.aspect ?? 0.4);
      const w = Math.max(Math.abs(pt.x - s.x), Math.abs(pt.y - s.y) / aspect);
      putDraft({ ...cur, x: s.x, y: s.y, w, h: w * aspect });
      return;
    }
    if (isShapeAnnot(cur)) {
      let x2 = pt.x;
      let y2 = pt.y;
      if (e.shiftKey) {
        if (cur.kind === "line" || cur.kind === "arrow") {
          // Snap to the nearest 45°.
          const dx = x2 - cur.x1;
          const dy = y2 - cur.y1;
          const len = Math.hypot(dx, dy);
          const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
          x2 = cur.x1 + Math.cos(ang) * len;
          y2 = cur.y1 + Math.sin(ang) * len;
        } else {
          // Square / circle.
          const s = Math.max(Math.abs(x2 - cur.x1), Math.abs(y2 - cur.y1));
          x2 = cur.x1 + Math.sign(x2 - cur.x1 || 1) * s;
          y2 = cur.y1 + Math.sign(y2 - cur.y1 || 1) * s;
        }
      }
      putDraft({ ...cur, x2, y2 });
    }
  };

  const finish = (e: React.PointerEvent) => {
    if (!active.current) return;
    active.current = false;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    const cur = draftRef.current;
    putDraft(null);
    if (!cur) return;
    if (cur.kind === "pen" || cur.kind === "highlighter") {
      if (cur.points.length > 0) onAdd(cur);
    } else if (cur.kind === "signature") {
      // A plain click stamps at the panel's width; a drag sizes it.
      const w = cur.w > 8 ? cur.w : style.signatureWidth;
      onAdd({ ...cur, w, h: w * (signature?.aspect ?? 0.4) });
    } else if (isShapeAnnot(cur)) {
      // Ignore accidental taps — a shape needs some extent to be meaningful.
      if (Math.hypot(cur.x2 - cur.x1, cur.y2 - cur.y1) > 2) onAdd(cur);
    }
  };

  const commitText = () => {
    const cur = textDraftRef.current;
    putTextDraft(null);
    if (!cur || cur.value.trim() === "") return;
    onAdd({
      id: annotId(),
      page,
      kind: "text",
      x: cur.x,
      y: cur.y,
      text: cur.value,
      size: style.textSize,
      color: style.color,
      opacity: style.opacity,
    });
  };

  // Memoised so an in-progress stroke only re-renders the draft, not the whole
  // committed layer (which can be hundreds of paths on a busy page).
  const pageAnnots = useMemo(
    () => doc.annots.filter((a) => a.page === page),
    [doc.annots, page],
  );

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
        style={{ touchAction: "none", cursor: cursorFor(tool) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        role="application"
        aria-label={`Annotation canvas for page ${page + 1}`}
      >
        <CommittedLayer annots={pageAnnots} />
        {draft && <AnnotView annot={draft} />}
      </svg>

      {textDraft && (
        <textarea
          autoFocus
          value={textDraft.value}
          onChange={(e) => putTextDraft({ ...textDraft, value: e.target.value })}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); putTextDraft(null); }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); }
            e.stopPropagation();
          }}
          className="absolute z-10 resize-none rounded border border-accent bg-white/95 p-1 leading-tight text-black outline-none"
          style={{
            left: textDraft.x * zoom,
            top: textDraft.y * zoom,
            width: Math.min(280, cssW - textDraft.x * zoom - 4),
            height: Math.max(24, style.textSize * zoom * 2.2),
            fontSize: style.textSize * zoom,
            color: style.color,
          }}
          placeholder="Type, Enter to place"
        />
      )}
    </div>
  );
}

/** The already-committed annotations for the current page. */
const CommittedLayer = memo(function CommittedLayer({ annots }: { annots: Annotation[] }) {
  return <>{annots.map((a) => <AnnotView key={a.id} annot={a} />)}</>;
});

/** Render one annotation into the SVG overlay (view-space units). */
function AnnotView({ annot }: { annot: Annotation }) {
  if (annot.kind === "text") {
    const lines = annot.text.split("\n");
    return (
      <text
        x={annot.x}
        y={annot.y + annot.size * 0.8}
        fill={annot.color}
        opacity={annot.opacity}
        fontSize={annot.size}
        fontFamily="Helvetica, Arial, sans-serif"
        style={{ whiteSpace: "pre" }}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={annot.x} dy={i === 0 ? 0 : annot.size * 1.2}>{line}</tspan>
        ))}
      </text>
    );
  }
  return (
    <>
      {annotPaths(annot).map((spec, i) => (
        <path
          key={i}
          d={spec.d}
          fill={spec.fill ?? "none"}
          stroke={spec.stroke ?? "none"}
          strokeWidth={spec.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={spec.opacity}
          style={spec.multiply ? { mixBlendMode: "multiply" } : undefined}
        />
      ))}
    </>
  );
}
