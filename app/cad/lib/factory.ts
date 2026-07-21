/** Factories for documents and features, with sensible default parameters. */
import { uid } from "./id";
import type {
  BoxFeature,
  CadDoc,
  CylinderFeature,
  ExtrudeFeature,
  PlaneId,
  RevolveFeature,
  SphereFeature,
  SketchFeature,
} from "./types";

export function newDoc(name = "Untitled"): CadDoc {
  return { name, features: [] };
}

export function createSketch(plane: PlaneId, name?: string): SketchFeature {
  return {
    id: uid("sk"),
    type: "sketch",
    name: name ?? `Sketch (${plane})`,
    sketch: { plane, entities: [], constraints: [] },
  };
}

export function createExtrude(sketchId: string, name?: string): ExtrudeFeature {
  return {
    id: uid("ex"),
    type: "extrude",
    name: name ?? "Extrude",
    sketchId,
    depth: 20,
    symmetric: false,
    reverse: false,
    boolean: "new",
  };
}

export function createRevolve(sketchId: string, name?: string): RevolveFeature {
  return {
    id: uid("rv"),
    type: "revolve",
    name: name ?? "Revolve",
    sketchId,
    angle: 360,
    boolean: "new",
  };
}

export function createBox(): BoxFeature {
  return {
    id: uid("bx"),
    type: "box",
    name: "Box",
    w: 40,
    d: 40,
    h: 40,
    position: [0, 0, 20],
    boolean: "new",
  };
}

export function createCylinder(): CylinderFeature {
  return {
    id: uid("cy"),
    type: "cylinder",
    name: "Cylinder",
    r: 20,
    h: 40,
    position: [0, 0, 20],
    boolean: "new",
  };
}

export function createSphere(): SphereFeature {
  return {
    id: uid("sp"),
    type: "sphere",
    name: "Sphere",
    r: 25,
    position: [0, 0, 25],
    boolean: "new",
  };
}
