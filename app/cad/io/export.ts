/**
 * Mesh export: watertight binary STL and GLB (glTF binary). PNG snapshots are
 * produced directly by the viewport (`Viewport.snapshot`). All client-side.
 */
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { MeshData } from "../kernel/protocol";

/** Encode a mesh as a binary STL blob (one facet per triangle, with normals). */
export function meshToStlBlob(mesh: MeshData): Blob {
  const { position, index } = mesh;
  const triCount = index.length / 3;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  // 80-byte header left as zeros, then triangle count.
  view.setUint32(80, triCount, true);

  const ax = new THREE.Vector3();
  const bx = new THREE.Vector3();
  const cx = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();

  let offset = 84;
  for (let t = 0; t < triCount; t++) {
    const i0 = index[t * 3];
    const i1 = index[t * 3 + 1];
    const i2 = index[t * 3 + 2];
    ax.set(position[i0 * 3], position[i0 * 3 + 1], position[i0 * 3 + 2]);
    bx.set(position[i1 * 3], position[i1 * 3 + 1], position[i1 * 3 + 2]);
    cx.set(position[i2 * 3], position[i2 * 3 + 1], position[i2 * 3 + 2]);
    ab.subVectors(bx, ax);
    ac.subVectors(cx, ax);
    n.crossVectors(ab, ac).normalize();

    view.setFloat32(offset, n.x, true);
    view.setFloat32(offset + 4, n.y, true);
    view.setFloat32(offset + 8, n.z, true);
    const verts = [ax, bx, cx];
    for (let v = 0; v < 3; v++) {
      const base = offset + 12 + v * 12;
      view.setFloat32(base, verts[v].x, true);
      view.setFloat32(base + 4, verts[v].y, true);
      view.setFloat32(base + 8, verts[v].z, true);
    }
    view.setUint16(offset + 48, 0, true); // attribute byte count
    offset += 50;
  }
  return new Blob([buffer], { type: "model/stl" });
}

function meshToGeometry(mesh: MeshData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(mesh.position.slice(), 3));
  geo.setIndex(new THREE.BufferAttribute(mesh.index.slice(), 1));
  geo.computeVertexNormals();
  return geo;
}

/** Export the mesh as a GLB (binary glTF) blob. */
export function meshToGlbBlob(mesh: MeshData): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const geo = meshToGeometry(mesh);
    const material = new THREE.MeshStandardMaterial({ color: 0x9db4d0, metalness: 0.1, roughness: 0.55 });
    const object = new THREE.Mesh(geo, material);
    const exporter = new GLTFExporter();
    exporter.parse(
      object,
      (result) => {
        const blob =
          result instanceof ArrayBuffer
            ? new Blob([result], { type: "model/gltf-binary" })
            : new Blob([JSON.stringify(result)], { type: "model/gltf+json" });
        resolve(blob);
      },
      (err) => reject(err),
      { binary: true },
    );
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/png";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
