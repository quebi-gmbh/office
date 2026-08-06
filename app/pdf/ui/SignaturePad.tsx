/**
 * SignaturePad — draw a signature once, keep it forever (in `localStorage`).
 *
 * Capture happens in the pad's own pixel space; {@link normalizeSignature}
 * rescales the strokes into unit space on save so they can be stamped at any
 * size on any page.
 */
import { useRef, useState } from "react";
import { Eraser, Check, X } from "lucide-react";
import { freehandPath, normalizeSignature, type InkPoint } from "~/pdf/lib/annotate";

const PAD_W = 460;
const PAD_H = 180;
const INK = 3.2;

type Props = {
  onSave: (sig: { name: string; paths: InkPoint[][]; aspect: number }) => void;
  onCancel: () => void;
};

export function SignaturePad({ onSave, onCancel }: Props) {
  const [paths, setPaths] = useState<InkPoint[][]>([]);
  const [name, setName] = useState("Signature");
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);

  // Mirrored into a ref: pointer handlers read the live stroke without doing
  // work inside a state updater (StrictMode double-invokes those).
  const [current, setCurrentState] = useState<InkPoint[] | null>(null);
  const currentRef = useRef<InkPoint[] | null>(null);
  const putCurrent = (next: InkPoint[] | null) => {
    currentRef.current = next;
    setCurrentState(next);
  };

  const at = (e: React.PointerEvent): InkPoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return [0, 0, 0.5];
    const p = e.pointerType === "mouse" ? 0.5 : (e.pressure > 0 ? e.pressure : 0.5);
    return [
      ((e.clientX - rect.left) / rect.width) * PAD_W,
      ((e.clientY - rect.top) / rect.height) * PAD_H,
      p,
    ];
  };

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    putCurrent([at(e)]);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const pt = at(e);
    const cur = currentRef.current;
    if (!cur) return;
    const last = cur[cur.length - 1]!;
    if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 1) return;
    putCurrent([...cur, pt]);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const cur = currentRef.current;
    putCurrent(null);
    if (cur && cur.length > 0) setPaths((ps) => [...ps, cur]);
  };

  const save = () => {
    const all = current ? [...paths, current] : paths;
    if (all.length === 0) return;
    const norm = normalizeSignature(all);
    onSave({ name: name.trim() || "Signature", paths: norm.paths, aspect: norm.aspect });
  };

  const live = current ? [...paths, current] : paths;
  const empty = live.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Draw your signature</h3>
          <button type="button" onClick={onCancel} aria-label="Close"
                  className="rounded p-1 text-muted hover:bg-bg hover:text-fg">
            <X size={14} />
          </button>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${PAD_W} ${PAD_H}`}
          className="w-full rounded-lg border border-dashed border-border bg-white"
          style={{ touchAction: "none", cursor: "crosshair", aspectRatio: `${PAD_W} / ${PAD_H}` }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          role="application"
          aria-label="Signature capture area"
        >
          <line x1={24} y1={PAD_H - 42} x2={PAD_W - 24} y2={PAD_H - 42}
                stroke="#d4d4d8" strokeWidth={1} strokeDasharray="4 4" />
          {live.map((p, i) => (
            <path key={i} d={freehandPath(p, INK)} fill="#111827" />
          ))}
        </svg>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Signature name"
            className="flex-1 rounded border border-border bg-bg px-2 py-1 text-sm"
            placeholder="Name"
          />
          <button type="button" onClick={() => { setPaths([]); putCurrent(null); }}
                  className="flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-xs hover:border-accent">
            <Eraser size={13} aria-hidden /> Clear
          </button>
          <button type="button" onClick={save} disabled={empty}
                  className="flex items-center gap-1 rounded border border-accent bg-accent/15 px-3 py-1 text-xs text-accent hover:bg-accent/25 disabled:opacity-40">
            <Check size={13} aria-hidden /> Save signature
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Stored in this browser only (localStorage) — nothing is uploaded.
        </p>
      </div>
    </div>
  );
}

/**
 * Small non-interactive preview of a stored signature. Unit-space strokes are
 * blown up to a 100-wide viewBox first — `freehandPath` clamps the nib to half
 * a unit, which would swamp a 1×1 coordinate system.
 */
export function SignaturePreview({
  paths, aspect, width = 120, color = "#111827",
}: { paths: InkPoint[][]; aspect: number; width?: number; color?: string }) {
  const S = 100;
  const h = Math.max(0.05, aspect) * S;
  return (
    <svg viewBox={`-2 -2 ${S + 4} ${h + 4}`} width={width} height={(width * h) / S}
         aria-hidden className="shrink-0">
      {paths.map((p, i) => (
        <path
          key={i}
          d={freehandPath(p.map(([x, y, pr]) => [x * S, y * S, pr] as InkPoint), 2)}
          fill={color}
        />
      ))}
    </svg>
  );
}
