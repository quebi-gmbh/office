/**
 * The 3-D viewport panel: mounts the Three.js {@link Viewport}, mirrors the
 * latest kernel mesh into it, and offers overlay controls (view gizmo,
 * perspective/orthographic toggle, shaded/edges/grid toggles, zoom-to-fit).
 */
import { useEffect, useRef, useState } from "react";
import {
  Box,
  Grid3x3,
  Maximize,
  Layers,
  Spline,
  SquareStack,
} from "lucide-react";
import { useCad } from "../hooks/useCad";
import { Viewport, type ProjectionMode, type ViewName } from "../three/viewport";

const VIEW_BUTTONS: { name: ViewName; label: string }[] = [
  { name: "front", label: "Front" },
  { name: "top", label: "Top" },
  { name: "right", label: "Right" },
  { name: "iso", label: "Iso" },
];

export function ViewportView({ registerSnapshot }: { registerSnapshot: (fn: () => string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vpRef = useRef<Viewport | null>(null);
  const hasFitRef = useRef(false);
  const evalResult = useCad((s) => s.evalResult);

  const [projection, setProjection] = useState<ProjectionMode>("perspective");
  const [shaded, setShaded] = useState(true);
  const [edges, setEdges] = useState(true);
  const [grid, setGrid] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    const vp = new Viewport(containerRef.current);
    vpRef.current = vp;
    registerSnapshot(() => vp.snapshot());
    return () => {
      vp.dispose();
      vpRef.current = null;
    };
  }, [registerSnapshot]);

  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    vp.setMesh(evalResult?.mesh ?? null);
    if (evalResult && evalResult.triangles > 0 && !hasFitRef.current) {
      hasFitRef.current = true;
      requestAnimationFrame(() => vp.fit());
    }
  }, [evalResult]);

  const iconBtn =
    "rounded-md border border-border bg-card/90 p-1.5 text-muted hover:border-accent hover:text-fg";
  const activeBtn = "rounded-md border border-accent bg-card/90 p-1.5 text-accent";

  return (
    <div className="relative min-h-0 flex-1 bg-[#0b0f17]" data-full-bleed>
      <div ref={containerRef} className="absolute inset-0" />

      {/* View gizmo */}
      <div className="absolute right-2 top-2 flex gap-1">
        {VIEW_BUTTONS.map((v) => (
          <button
            key={v.name}
            type="button"
            title={`${v.label} view`}
            onClick={() => vpRef.current?.setView(v.name)}
            className="rounded-md border border-border bg-card/90 px-2 py-1 text-xs text-muted hover:border-accent hover:text-fg"
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Render controls */}
      <div className="absolute left-2 top-2 flex gap-1">
        <button
          type="button"
          title="Zoom to fit"
          onClick={() => vpRef.current?.fit()}
          className={iconBtn}
        >
          <Maximize size={16} aria-hidden />
        </button>
        <button
          type="button"
          title={projection === "perspective" ? "Switch to orthographic" : "Switch to perspective"}
          onClick={() => {
            const next: ProjectionMode = projection === "perspective" ? "orthographic" : "perspective";
            setProjection(next);
            vpRef.current?.setProjection(next);
          }}
          className={iconBtn}
        >
          {projection === "perspective" ? <Box size={16} aria-hidden /> : <SquareStack size={16} aria-hidden />}
        </button>
        <button
          type="button"
          title="Toggle shaded"
          onClick={() => {
            setShaded((v) => {
              vpRef.current?.setShaded(!v);
              return !v;
            });
          }}
          className={shaded ? activeBtn : iconBtn}
        >
          <Layers size={16} aria-hidden />
        </button>
        <button
          type="button"
          title="Toggle edges"
          onClick={() => {
            setEdges((v) => {
              vpRef.current?.setEdges(!v);
              return !v;
            });
          }}
          className={edges ? activeBtn : iconBtn}
        >
          <Spline size={16} aria-hidden />
        </button>
        <button
          type="button"
          title="Toggle grid & axes"
          onClick={() => {
            setGrid((v) => {
              vpRef.current?.setGridVisible(!v);
              return !v;
            });
          }}
          className={grid ? activeBtn : iconBtn}
        >
          <Grid3x3 size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
