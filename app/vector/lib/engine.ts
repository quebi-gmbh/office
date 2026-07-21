/**
 * The vector editor engine: a small imperative controller wrapping an
 * observable {@link Store} of {@link VectorState} plus a snapshot
 * {@link History}. React subscribes to the store; the UI and interaction layers
 * call these methods to mutate state.
 *
 * Convention: geometry-changing operations call {@link VectorEngine.commit} to
 * push a history snapshot and trigger autosave. Transient changes (selection,
 * tool, view) do not.
 */
import { createHistory, type History } from "./history";
import { createStore, type Store } from "./store";
import { moveNode, scaleNode, toLocal, unionBounds, worldBounds } from "./geometry";
import { booleanNodes } from "./boolean";
import { newId } from "./id";
import type {
  BooleanOp,
  Guide,
  Style,
  ToolId,
  VNode,
  VectorDoc,
  VectorScene,
  VectorState,
} from "./types";

export type AlignKind = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type DistributeAxis = "h" | "v";

export const DEFAULT_DOC: VectorDoc = { width: 1000, height: 700, background: "#ffffff" };

export const DEFAULT_STYLE: Style = {
  fill: "#4f46e5",
  stroke: "#111827",
  strokeWidth: 2,
  opacity: 1,
};

function initialState(scene?: VectorScene): VectorState {
  return {
    doc: scene?.doc ?? { ...DEFAULT_DOC },
    nodes: scene?.nodes ?? [],
    selection: [],
    tool: "select",
    view: { zoom: 1, panX: 0, panY: 0 },
    defaults: { ...DEFAULT_STYLE },
    textDefaults: { fontSize: 32, fontFamily: "sans-serif" },
    shapeDefaults: { polygonSides: 6, starPoints: 5, starInner: 0.5, spiralTurns: 3 },
    grid: { size: 20, show: false, snap: false, snapObjects: true, tolerance: 8 },
    recentColors: [],
    canUndo: false,
    canRedo: false,
  };
}

export interface VectorEngine {
  store: Store<VectorState>;
  onChange?: () => void;

  scene(): VectorScene;
  loadScene(scene: VectorScene): void;
  newDocument(width: number, height: number, background: string): void;
  setDoc(patch: Partial<VectorDoc>): void;

  setTool(tool: ToolId): void;

  // Node lifecycle
  addNode(node: VNode, select?: boolean): void;
  updateNodes(ids: string[], updater: (n: VNode) => VNode, commit?: boolean): void;
  replaceNodes(nodes: VNode[]): void;
  deleteSelection(): void;
  duplicateSelection(): void;

  // Selection
  select(ids: string[]): void;
  toggleInSelection(id: string): void;
  selectAll(): void;
  clearSelection(): void;

  // Clipboard
  copy(): void;
  cut(): void;
  paste(): void;

  // Z-order
  bringToFront(): void;
  sendToBack(): void;
  bringForward(): void;
  sendBackward(): void;

  // Styling (applies to selection + updates defaults)
  applyStyle(patch: Partial<Style>): void;
  setTextProps(patch: Partial<VNode & { type: "text" }>): void;
  setShapeDefaults(patch: Partial<VectorState["shapeDefaults"]>): void;
  pushRecentColor(color: string): void;

  // Grouping
  group(): void;
  ungroup(): void;

  // Arrange
  align(kind: AlignKind): void;
  distribute(axis: DistributeAxis): void;

  // Layer metadata
  setLocked(ids: string[], locked: boolean): void;
  setHidden(ids: string[], hidden: boolean): void;
  rename(id: string, name: string): void;
  /** Move a node to an absolute z-index in the flat list. */
  reorder(id: string, toIndex: number): void;

  // Path ops
  booleanOp(op: BooleanOp): void;

  // Numeric transform
  setNodeBounds(id: string, patch: Partial<{ x: number; y: number; w: number; h: number }>): void;
  setRotation(ids: string[], deg: number): void;

  // Guides
  addGuide(guide: Guide): void;
  updateGuide(id: string, pos: number): void;
  removeGuide(id: string): void;

  // History
  commit(): void;
  undo(): void;
  redo(): void;

  // View
  setView(view: Partial<VectorState["view"]>): void;

  // Grid
  setGrid(patch: Partial<VectorState["grid"]>): void;
}

export function createEngine(scene?: VectorScene): VectorEngine {
  const store = createStore<VectorState>(initialState(scene));
  const history: History = createHistory({
    doc: store.getSnapshot().doc,
    nodes: store.getSnapshot().nodes,
  });
  let clipboard: VNode[] = [];

  const engine: VectorEngine = {
    store,

    scene() {
      const s = store.getSnapshot();
      return { doc: s.doc, nodes: s.nodes };
    },

    commit() {
      const s = store.getSnapshot();
      history.push({ doc: s.doc, nodes: s.nodes });
      store.setState((st) => ({ ...st, canUndo: history.canUndo(), canRedo: history.canRedo() }));
      engine.onChange?.();
    },

    loadScene(next) {
      store.setState((s) => ({ ...s, doc: next.doc, nodes: next.nodes, selection: [] }));
      history.reset({ doc: next.doc, nodes: next.nodes });
      store.setState((s) => ({ ...s, canUndo: false, canRedo: false }));
      engine.onChange?.();
    },

    newDocument(width, height, background) {
      const doc: VectorDoc = { width, height, background };
      store.setState((s) => ({ ...s, doc, nodes: [], selection: [] }));
      history.reset({ doc, nodes: [] });
      store.setState((s) => ({ ...s, canUndo: false, canRedo: false }));
      engine.onChange?.();
    },

    setDoc(patch) {
      store.setState((s) => ({ ...s, doc: { ...s.doc, ...patch } }));
      engine.commit();
    },

    setTool(tool) {
      store.setState((s) => ({ ...s, tool }));
    },

    addNode(node, select = true) {
      store.setState((s) => ({
        ...s,
        nodes: [...s.nodes, node],
        selection: select ? [node.id] : s.selection,
      }));
      engine.commit();
    },

    updateNodes(ids, updater, commit = true) {
      const idSet = new Set(ids);
      store.setState((s) => ({
        ...s,
        nodes: s.nodes.map((n) => (idSet.has(n.id) ? updater(n) : n)),
      }));
      if (commit) engine.commit();
    },

    replaceNodes(nodes) {
      store.setState((s) => ({ ...s, nodes }));
      engine.commit();
    },

    deleteSelection() {
      const s = store.getSnapshot();
      if (s.selection.length === 0) return;
      const sel = new Set(s.selection);
      store.setState((st) => ({
        ...st,
        nodes: st.nodes.filter((n) => !sel.has(n.id)),
        selection: [],
      }));
      engine.commit();
    },

    duplicateSelection() {
      const s = store.getSnapshot();
      if (s.selection.length === 0) return;
      const sel = new Set(s.selection);
      const copies: VNode[] = s.nodes
        .filter((n) => sel.has(n.id))
        .map((n) => moveNode({ ...n, id: newId() } as VNode, 16, 16));
      store.setState((st) => ({
        ...st,
        nodes: [...st.nodes, ...copies],
        selection: copies.map((c) => c.id),
      }));
      engine.commit();
    },

    select(ids) {
      store.setState((s) => ({ ...s, selection: ids }));
    },

    toggleInSelection(id) {
      store.setState((s) => {
        const has = s.selection.includes(id);
        return {
          ...s,
          selection: has ? s.selection.filter((x) => x !== id) : [...s.selection, id],
        };
      });
    },

    selectAll() {
      store.setState((s) => ({ ...s, selection: s.nodes.map((n) => n.id) }));
    },

    clearSelection() {
      store.setState((s) => ({ ...s, selection: [] }));
    },

    copy() {
      const s = store.getSnapshot();
      const sel = new Set(s.selection);
      clipboard = s.nodes.filter((n) => sel.has(n.id)).map((n) => structuredClone(n));
    },

    cut() {
      engine.copy();
      engine.deleteSelection();
    },

    paste() {
      if (clipboard.length === 0) return;
      const copies = clipboard.map((n) => moveNode({ ...structuredClone(n), id: newId() } as VNode, 16, 16));
      // Offset the clipboard so repeated pastes cascade.
      clipboard = clipboard.map((n) => moveNode(structuredClone(n), 16, 16));
      store.setState((s) => ({
        ...s,
        nodes: [...s.nodes, ...copies],
        selection: copies.map((c) => c.id),
      }));
      engine.commit();
    },

    bringToFront() {
      const s = store.getSnapshot();
      const sel = new Set(s.selection);
      if (sel.size === 0) return;
      const kept = s.nodes.filter((n) => !sel.has(n.id));
      const moved = s.nodes.filter((n) => sel.has(n.id));
      store.setState((st) => ({ ...st, nodes: [...kept, ...moved] }));
      engine.commit();
    },

    sendToBack() {
      const s = store.getSnapshot();
      const sel = new Set(s.selection);
      if (sel.size === 0) return;
      const kept = s.nodes.filter((n) => !sel.has(n.id));
      const moved = s.nodes.filter((n) => sel.has(n.id));
      store.setState((st) => ({ ...st, nodes: [...moved, ...kept] }));
      engine.commit();
    },

    bringForward() {
      const s = store.getSnapshot();
      const sel = new Set(s.selection);
      if (sel.size === 0) return;
      const nodes = [...s.nodes];
      for (let i = nodes.length - 2; i >= 0; i--) {
        if (sel.has(nodes[i].id) && !sel.has(nodes[i + 1].id)) {
          [nodes[i], nodes[i + 1]] = [nodes[i + 1], nodes[i]];
        }
      }
      store.setState((st) => ({ ...st, nodes }));
      engine.commit();
    },

    sendBackward() {
      const s = store.getSnapshot();
      const sel = new Set(s.selection);
      if (sel.size === 0) return;
      const nodes = [...s.nodes];
      for (let i = 1; i < nodes.length; i++) {
        if (sel.has(nodes[i].id) && !sel.has(nodes[i - 1].id)) {
          [nodes[i], nodes[i - 1]] = [nodes[i - 1], nodes[i]];
        }
      }
      store.setState((st) => ({ ...st, nodes }));
      engine.commit();
    },

    applyStyle(patch) {
      store.setState((s) => {
        const sel = new Set(s.selection);
        const colors = [patch.fill, patch.stroke].filter((c): c is string => typeof c === "string");
        const recentColors = colors.length
          ? [...colors, ...s.recentColors.filter((c) => !colors.includes(c))].slice(0, 12)
          : s.recentColors;
        return {
          ...s,
          defaults: { ...s.defaults, ...patch },
          recentColors,
          nodes:
            sel.size === 0
              ? s.nodes
              : s.nodes.map((n) => (sel.has(n.id) ? ({ ...n, ...patch } as VNode) : n)),
        };
      });
      if (store.getSnapshot().selection.length > 0) engine.commit();
    },

    setTextProps(patch) {
      store.setState((s) => {
        const sel = new Set(s.selection);
        const defPatch: Partial<VectorState["textDefaults"]> = {};
        if (typeof patch.fontSize === "number") defPatch.fontSize = patch.fontSize;
        if (typeof patch.fontFamily === "string") defPatch.fontFamily = patch.fontFamily;
        return {
          ...s,
          textDefaults: { ...s.textDefaults, ...defPatch },
          nodes: s.nodes.map((n) =>
            sel.has(n.id) && n.type === "text" ? ({ ...n, ...patch } as VNode) : n,
          ),
        };
      });
      const s = store.getSnapshot();
      if (s.selection.some((id) => s.nodes.find((n) => n.id === id)?.type === "text")) engine.commit();
    },

    setShapeDefaults(patch) {
      store.setState((s) => ({ ...s, shapeDefaults: { ...s.shapeDefaults, ...patch } }));
    },

    pushRecentColor(color) {
      if (!color) return;
      store.setState((s) => ({
        ...s,
        recentColors: [color, ...s.recentColors.filter((c) => c !== color)].slice(0, 12),
      }));
    },

    group() {
      const s = store.getSnapshot();
      if (s.selection.length < 2) return;
      const gid = newId();
      const sel = new Set(s.selection);
      store.setState((st) => ({
        ...st,
        nodes: st.nodes.map((n) => (sel.has(n.id) ? ({ ...n, groupId: gid } as VNode) : n)),
      }));
      engine.commit();
    },

    ungroup() {
      const s = store.getSnapshot();
      const sel = new Set(s.selection);
      const gids = new Set(
        s.nodes.filter((n) => sel.has(n.id) && n.groupId).map((n) => n.groupId as string),
      );
      if (gids.size === 0) return;
      store.setState((st) => ({
        ...st,
        nodes: st.nodes.map((n) =>
          n.groupId && gids.has(n.groupId) ? ({ ...n, groupId: null } as VNode) : n,
        ),
      }));
      engine.commit();
    },

    align(kind) {
      const s = store.getSnapshot();
      if (s.selection.length < 2) return;
      const sel = new Set(s.selection);
      const bounds = unionBounds(s.nodes.filter((n) => sel.has(n.id)));
      if (!bounds) return;
      store.setState((st) => ({
        ...st,
        nodes: st.nodes.map((n) => {
          if (!sel.has(n.id)) return n;
          const b = worldBounds(n);
          let dx = 0;
          let dy = 0;
          switch (kind) {
            case "left": dx = bounds.minX - b.minX; break;
            case "right": dx = bounds.maxX - b.maxX; break;
            case "hcenter": dx = (bounds.minX + bounds.maxX) / 2 - (b.minX + b.maxX) / 2; break;
            case "top": dy = bounds.minY - b.minY; break;
            case "bottom": dy = bounds.maxY - b.maxY; break;
            case "vcenter": dy = (bounds.minY + bounds.maxY) / 2 - (b.minY + b.maxY) / 2; break;
          }
          return moveNode(n, dx, dy);
        }),
      }));
      engine.commit();
    },

    distribute(axis) {
      const s = store.getSnapshot();
      if (s.selection.length < 3) return;
      const sel = new Set(s.selection);
      const items = s.nodes
        .filter((n) => sel.has(n.id))
        .map((n) => ({ n, b: worldBounds(n) }))
        .sort((a, b) =>
          axis === "h"
            ? (a.b.minX + a.b.maxX) / 2 - (b.b.minX + b.b.maxX) / 2
            : (a.b.minY + a.b.maxY) / 2 - (b.b.minY + b.b.maxY) / 2,
        );
      const first = items[0].b;
      const last = items[items.length - 1].b;
      const c0 = axis === "h" ? (first.minX + first.maxX) / 2 : (first.minY + first.maxY) / 2;
      const cN = axis === "h" ? (last.minX + last.maxX) / 2 : (last.minY + last.maxY) / 2;
      const step = (cN - c0) / (items.length - 1);
      const moves = new Map<string, VNode>();
      items.forEach((item, i) => {
        const target = c0 + step * i;
        const center = axis === "h" ? (item.b.minX + item.b.maxX) / 2 : (item.b.minY + item.b.maxY) / 2;
        const d = target - center;
        moves.set(item.n.id, axis === "h" ? moveNode(item.n, d, 0) : moveNode(item.n, 0, d));
      });
      store.setState((st) => ({ ...st, nodes: st.nodes.map((n) => moves.get(n.id) ?? n) }));
      engine.commit();
    },

    setLocked(ids, locked) {
      const set = new Set(ids);
      store.setState((s) => ({
        ...s,
        nodes: s.nodes.map((n) => (set.has(n.id) ? ({ ...n, locked } as VNode) : n)),
        selection: locked ? s.selection.filter((id) => !set.has(id)) : s.selection,
      }));
      engine.commit();
    },

    setHidden(ids, hidden) {
      const set = new Set(ids);
      store.setState((s) => ({
        ...s,
        nodes: s.nodes.map((n) => (set.has(n.id) ? ({ ...n, hidden } as VNode) : n)),
        selection: hidden ? s.selection.filter((id) => !set.has(id)) : s.selection,
      }));
      engine.commit();
    },

    rename(id, name) {
      store.setState((s) => ({
        ...s,
        nodes: s.nodes.map((n) => (n.id === id ? ({ ...n, name } as VNode) : n)),
      }));
      engine.commit();
    },

    reorder(id, toIndex) {
      const s = store.getSnapshot();
      const from = s.nodes.findIndex((n) => n.id === id);
      if (from < 0) return;
      const nodes = [...s.nodes];
      const [moved] = nodes.splice(from, 1);
      const clamped = Math.max(0, Math.min(nodes.length, toIndex));
      nodes.splice(clamped, 0, moved);
      store.setState((st) => ({ ...st, nodes }));
      engine.commit();
    },

    booleanOp(op) {
      const s = store.getSnapshot();
      if (s.selection.length < 2) return;
      const sel = new Set(s.selection);
      const selected = s.nodes.filter((n) => sel.has(n.id));
      const result = booleanNodes(selected, op);
      if (!result) return;
      // Drop boolean-consumed nodes; keep everything else in place; append result.
      const consumed = new Set(selected.filter((n) => n.type === "rect" || n.type === "ellipse" || (n.type === "polyline" && n.closed)).map((n) => n.id));
      store.setState((st) => ({
        ...st,
        nodes: [...st.nodes.filter((n) => !consumed.has(n.id)), ...result],
        selection: result.map((n) => n.id),
      }));
      engine.commit();
    },

    setNodeBounds(id, patch) {
      const s = store.getSnapshot();
      const node = s.nodes.find((n) => n.id === id);
      if (!node) return;
      const b = worldBounds(node);
      const curW = Math.max(b.maxX - b.minX, 1e-3);
      const curH = Math.max(b.maxY - b.minY, 1e-3);
      const targetX = patch.x ?? b.minX;
      const targetY = patch.y ?? b.minY;
      const targetW = Math.max(patch.w ?? curW, 1);
      const targetH = Math.max(patch.h ?? curH, 1);
      const dx = targetX - b.minX;
      const dy = targetY - b.minY;
      const sx = targetW / curW;
      const sy = targetH / curH;
      store.setState((st) => ({
        ...st,
        nodes: st.nodes.map((n) => {
          if (n.id !== id) return n;
          // Move so top-left matches, then scale about that corner.
          const moved = moveNode(n, dx, dy);
          if (sx === 1 && sy === 1) return moved;
          return scaleAboutWorld(moved, targetX, targetY, sx, sy);
        }),
      }));
      engine.commit();
    },

    setRotation(ids, deg) {
      const set = new Set(ids);
      store.setState((s) => ({
        ...s,
        nodes: s.nodes.map((n) => (set.has(n.id) ? ({ ...n, rotation: deg } as VNode) : n)),
      }));
      engine.commit();
    },

    addGuide(guide) {
      store.setState((s) => ({ ...s, doc: { ...s.doc, guides: [...(s.doc.guides ?? []), guide] } }));
      engine.commit();
    },

    updateGuide(id, pos) {
      store.setState((s) => ({
        ...s,
        doc: { ...s.doc, guides: (s.doc.guides ?? []).map((g) => (g.id === id ? { ...g, pos } : g)) },
      }));
    },

    removeGuide(id) {
      store.setState((s) => ({
        ...s,
        doc: { ...s.doc, guides: (s.doc.guides ?? []).filter((g) => g.id !== id) },
      }));
      engine.commit();
    },

    undo() {
      const scene = history.undo();
      if (!scene) return;
      store.setState((s) => ({
        ...s,
        doc: scene.doc,
        nodes: scene.nodes,
        selection: s.selection.filter((id) => scene.nodes.some((n) => n.id === id)),
        canUndo: history.canUndo(),
        canRedo: history.canRedo(),
      }));
      engine.onChange?.();
    },

    redo() {
      const scene = history.redo();
      if (!scene) return;
      store.setState((s) => ({
        ...s,
        doc: scene.doc,
        nodes: scene.nodes,
        canUndo: history.canUndo(),
        canRedo: history.canRedo(),
      }));
      engine.onChange?.();
    },

    setView(view) {
      store.setState((s) => ({ ...s, view: { ...s.view, ...view } }));
    },

    setGrid(patch) {
      store.setState((s) => ({ ...s, grid: { ...s.grid, ...patch } }));
    },
  };

  return engine;
}

/** Scale a node about a world-space origin (exact for un-rotated nodes). */
function scaleAboutWorld<T extends VNode>(node: T, ox: number, oy: number, sx: number, sy: number): T {
  const o = node.rotation ? toLocal(node, [ox, oy]) : ([ox, oy] as [number, number]);
  return scaleNode(node, o[0], o[1], sx, sy);
}

/** Union world bounds of the current selection (or all nodes if none). */
export function selectionBounds(state: VectorState) {
  const sel = new Set(state.selection);
  const nodes = state.selection.length > 0 ? state.nodes.filter((n) => sel.has(n.id)) : state.nodes;
  return unionBounds(nodes);
}

/** Expand a set of ids to include every node sharing a group with them. */
export function expandGroups(nodes: VNode[], ids: string[]): string[] {
  const idSet = new Set(ids);
  const groups = new Set(
    nodes.filter((n) => idSet.has(n.id) && n.groupId).map((n) => n.groupId as string),
  );
  if (groups.size === 0) return ids;
  const out = new Set(ids);
  for (const n of nodes) if (n.groupId && groups.has(n.groupId)) out.add(n.id);
  return [...out];
}
