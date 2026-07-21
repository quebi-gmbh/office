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
import { moveNode, unionBounds } from "./geometry";
import { newId } from "./id";
import type {
  Style,
  ToolId,
  VNode,
  VectorDoc,
  VectorScene,
  VectorState,
} from "./types";

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
    grid: { size: 20, show: false, snap: false },
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
  setTextProps(patch: Partial<{ fontSize: number; fontFamily: string }>): void;

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
        return {
          ...s,
          defaults: { ...s.defaults, ...patch },
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
        return {
          ...s,
          textDefaults: { ...s.textDefaults, ...patch },
          nodes: s.nodes.map((n) =>
            sel.has(n.id) && n.type === "text" ? { ...n, ...patch } : n,
          ),
        };
      });
      const s = store.getSnapshot();
      if (s.selection.some((id) => s.nodes.find((n) => n.id === id)?.type === "text")) engine.commit();
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

/** Union world bounds of the current selection (or all nodes if none). */
export function selectionBounds(state: VectorState) {
  const sel = new Set(state.selection);
  const nodes = state.selection.length > 0 ? state.nodes.filter((n) => sel.has(n.id)) : state.nodes;
  return unionBounds(nodes);
}
