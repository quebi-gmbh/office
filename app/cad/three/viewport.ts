/**
 * Framework-free Three.js viewport for the CAD tool. Owns the renderer, a
 * perspective/orthographic camera pair, orbit controls, a ground grid, origin
 * axes, and the shaded-with-edges solid. Z is up (matching the Manifold kernel,
 * whose XY sketches extrude along +Z).
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MeshData } from "../kernel/protocol";

export type ProjectionMode = "perspective" | "orthographic";
export type ViewName = "front" | "back" | "top" | "bottom" | "right" | "left" | "iso";

const VIEW_DIRS: Record<ViewName, [number, number, number]> = {
  front: [0, -1, 0],
  back: [0, 1, 0],
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  iso: [1, -1, 0.8],
};

export interface ViewportOptions {
  onChange?: () => void;
}

export class Viewport {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private persp: THREE.PerspectiveCamera;
  private ortho: THREE.OrthographicCamera;
  private camera: THREE.Camera & { position: THREE.Vector3 };
  private controls: OrbitControls;
  private grid: THREE.GridHelper;
  private axes: THREE.AxesHelper;
  private solidGroup = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private edges: THREE.LineSegments | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private raf = 0;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private projection: ProjectionMode = "perspective";
  private showEdges = true;
  private showShaded = true;

  constructor(container: HTMLElement, opts: ViewportOptions = {}) {
    this.container = container;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0xf4f6f6, 1);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";

    this.scene = new THREE.Scene();

    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    this.persp = new THREE.PerspectiveCamera(45, w / h, 0.1, 100000);
    this.persp.up.set(0, 0, 1);
    this.persp.position.set(120, -160, 120);
    const frustum = 200;
    this.ortho = new THREE.OrthographicCamera(
      (-frustum * w) / h,
      (frustum * w) / h,
      frustum,
      -frustum,
      -100000,
      100000,
    );
    this.ortho.up.set(0, 0, 1);
    this.ortho.position.set(120, -160, 120);
    this.camera = this.persp;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.addEventListener("change", () => opts.onChange?.());

    // Lighting.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(1, -1, 2);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-1, 1, 0.5);
    this.scene.add(fill);

    // Ground grid (XY plane) + origin axes.
    this.grid = new THREE.GridHelper(400, 40, 0xb8c0ca, 0xdfe4e8);
    this.grid.rotation.x = Math.PI / 2; // XZ → XY
    this.scene.add(this.grid);
    this.axes = new THREE.AxesHelper(60);
    this.scene.add(this.axes);
    this.scene.add(this.solidGroup);

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private onResize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    const dy = (this.ortho.top - this.ortho.bottom) / 2;
    this.ortho.left = (-dy * w) / h;
    this.ortho.right = (dy * w) / h;
    this.ortho.updateProjectionMatrix();
  }

  setMesh(data: MeshData | null) {
    if (this.mesh) {
      this.solidGroup.remove(this.mesh);
      this.mesh = null;
    }
    if (this.edges) {
      this.solidGroup.remove(this.edges);
      this.edges = null;
    }
    this.geometry?.dispose();
    this.geometry = null;
    if (!data || data.index.length === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(data.position, 3));
    geo.setIndex(new THREE.BufferAttribute(data.index, 1));
    geo.computeVertexNormals();
    this.geometry = geo;

    const mat = new THREE.MeshStandardMaterial({
      color: 0x9db4d0,
      metalness: 0.1,
      roughness: 0.55,
      flatShading: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.visible = this.showShaded;
    this.solidGroup.add(this.mesh);

    const edgeGeo = new THREE.EdgesGeometry(geo, 20);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x1a2230 });
    this.edges = new THREE.LineSegments(edgeGeo, edgeMat);
    this.edges.visible = this.showEdges;
    this.solidGroup.add(this.edges);
  }

  setShaded(on: boolean) {
    this.showShaded = on;
    if (this.mesh) this.mesh.visible = on;
  }

  setEdges(on: boolean) {
    this.showEdges = on;
    if (this.edges) this.edges.visible = on;
  }

  setGridVisible(on: boolean) {
    this.grid.visible = on;
    this.axes.visible = on;
  }

  setProjection(mode: ProjectionMode) {
    if (mode === this.projection) return;
    this.projection = mode;
    const target = mode === "perspective" ? this.persp : this.ortho;
    target.position.copy(this.camera.position);
    this.camera = target;
    this.controls.object = target;
    this.onResize();
    this.controls.update();
    this.fit();
  }

  getProjection(): ProjectionMode {
    return this.projection;
  }

  private boundingSphere(): THREE.Sphere {
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 100);
    if (this.geometry) {
      this.geometry.computeBoundingSphere();
      if (this.geometry.boundingSphere) sphere.copy(this.geometry.boundingSphere);
    }
    if (sphere.radius <= 0 || !Number.isFinite(sphere.radius)) sphere.radius = 100;
    return sphere;
  }

  /** Frame the whole model (zoom-to-fit). */
  fit() {
    const sphere = this.boundingSphere();
    const target = sphere.center.clone();
    this.controls.target.copy(target);
    const dir = this.camera.position.clone().sub(target);
    if (dir.lengthSq() < 1e-6) dir.set(1, -1, 0.8);
    dir.normalize();

    const r = sphere.radius;
    if (this.projection === "perspective") {
      const fov = (this.persp.fov * Math.PI) / 180;
      const dist = (r * 1.6) / Math.sin(fov / 2);
      this.persp.position.copy(target).add(dir.multiplyScalar(dist));
    } else {
      const dist = r * 4;
      this.ortho.position.copy(target).add(dir.multiplyScalar(dist));
      const w = Math.max(1, this.container.clientWidth);
      const h = Math.max(1, this.container.clientHeight);
      const half = r * 1.4;
      this.ortho.top = half;
      this.ortho.bottom = -half;
      this.ortho.left = (-half * w) / h;
      this.ortho.right = (half * w) / h;
      this.ortho.updateProjectionMatrix();
    }
    this.controls.update();
  }

  setView(name: ViewName) {
    const sphere = this.boundingSphere();
    const target = sphere.center.clone();
    const dir = new THREE.Vector3(...VIEW_DIRS[name]).normalize();
    this.camera.position.copy(target).add(dir.multiplyScalar(sphere.radius * 5 + 1));
    this.controls.target.copy(target);
    this.controls.update();
    this.fit();
  }

  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.geometry?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
