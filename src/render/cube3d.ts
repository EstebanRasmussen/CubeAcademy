/**
 * three.js cube. Cubies always rest at their home positions; a move is animated by attaching the
 * affected cubies to a pivot, rotating it, then snapping back and recoloring from the new state.
 * This avoids any floating-point drift over long sessions.
 */

import * as THREE from 'three';
import { COLOR_HEX, FACE_COLOR, Face, FaceletState, GEOMETRY, Vec3 } from '../cube/facelets';
import { MOVE_DEFS, applyMove } from '../cube/moves';
import { Move } from '../cube/notation';

const UNKNOWN_HEX = 0x5a5f6a;
const BODY_HEX = 0x111216;

export type ViewFace = Face | 'home';

/** Group orientation (Euler, radians) that presents each face toward the viewer. */
const FACE_VIEW: Record<ViewFace, [number, number, number]> = {
  home: [0.62, -0.6, 0],
  F: [0.15, 0, 0],
  R: [0.15, -Math.PI / 2, 0],
  B: [0.15, Math.PI, 0],
  L: [0.15, Math.PI / 2, 0],
  U: [Math.PI / 2 - 0.15, 0, 0],
  D: [-Math.PI / 2 + 0.15, 0, 0],
};

function roundedSquare(size: number, radius: number): THREE.ShapeGeometry {
  const s = size / 2;
  const r = radius;
  const shape = new THREE.Shape();
  shape.moveTo(-s + r, -s);
  shape.lineTo(s - r, -s);
  shape.quadraticCurveTo(s, -s, s, -s + r);
  shape.lineTo(s, s - r);
  shape.quadraticCurveTo(s, s, s - r, s);
  shape.lineTo(-s + r, s);
  shape.quadraticCurveTo(-s, s, -s, s - r);
  shape.lineTo(-s, -s + r);
  shape.quadraticCurveTo(-s, -s, -s + r, -s);
  return new THREE.ShapeGeometry(shape, 4);
}

interface Cubie {
  mesh: THREE.Group;
  home: Vec3;
}

export class Cube3D {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private root = new THREE.Group(); // whole-cube orientation (view)
  private cubies: Cubie[] = [];
  private stickers: THREE.Mesh[] = []; // by facelet index
  private stickerMats: THREE.MeshStandardMaterial[] = [];
  private state: FaceletState;
  private viewTarget = new THREE.Quaternion();
  private dragOffset = { x: 0, y: 0 };
  private dragging = false;
  private animating = false;
  private resizeObs: ResizeObserver;

  constructor(private container: HTMLElement, initial: FaceletState) {
    this.state = initial;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 6, 8);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-6, -2, 4);
    this.scene.add(fill);
    this.scene.add(this.root);

    this.build();
    this.applyColors();
    this.setView('home', true);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.installDrag();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private build() {
    const body = new THREE.BoxGeometry(0.96, 0.96, 0.96);
    const bodyMat = new THREE.MeshStandardMaterial({ color: BODY_HEX, roughness: 0.6 });
    const sticker = roundedSquare(0.84, 0.12);
    const byPos = new Map<string, Cubie>();
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const g = new THREE.Group();
          g.add(new THREE.Mesh(body, bodyMat));
          g.position.set(x, y, z);
          this.root.add(g);
          const c = { mesh: g, home: [x, y, z] as Vec3 };
          this.cubies.push(c);
          byPos.set(`${x},${y},${z}`, c);
        }
    GEOMETRY.forEach((geo, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: UNKNOWN_HEX, roughness: 0.35, metalness: 0 });
      const m = new THREE.Mesh(sticker, mat);
      const n = new THREE.Vector3(...geo.normal);
      m.position.copy(n.clone().multiplyScalar(0.485));
      m.lookAt(n.clone().multiplyScalar(2));
      byPos.get(geo.pos.join(','))!.mesh.add(m);
      this.stickers[i] = m;
      this.stickerMats[i] = mat;
    });
  }

  private applyColors() {
    for (let i = 0; i < 54; i++) {
      const f = this.state[i] as Face;
      const hex = FACE_COLOR[f] ? COLOR_HEX[FACE_COLOR[f]] : UNKNOWN_HEX;
      this.stickerMats[i].color.setHex(hex);
    }
  }

  getState(): FaceletState {
    return this.state;
  }

  /** Letters other than URFDLB render as gray (unknown). */
  setState(s: FaceletState) {
    this.state = s;
    this.applyColors();
  }

  /** Highlights facelets (e.g. low-confidence stickers) with an emissive glow. */
  highlight(indices: number[]) {
    this.stickerMats.forEach((m, i) => m.emissive.setHex(indices.includes(i) ? 0x553300 : 0x000000));
  }

  setView(face: ViewFace, immediate = false) {
    const [x, y, z] = FACE_VIEW[face];
    this.viewTarget.setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
    if (immediate) this.root.quaternion.copy(this.viewTarget);
  }

  isAnimating() {
    return this.animating;
  }

  /** Animates a move, then updates the state. */
  animateMove(move: Move, durationMs: number): Promise<void> {
    const def = MOVE_DEFS[move.letter];
    const axis = new THREE.Vector3(def.axis === 0 ? 1 : 0, def.axis === 1 ? 1 : 0, def.axis === 2 ? 1 : 0);
    const quarters = move.amount === 3 ? -1 : move.amount;
    const angle = def.sign * quarters * (Math.PI / 2);
    const pivot = new THREE.Group();
    this.root.add(pivot);
    const moving = this.cubies.filter((c) => def.layers.includes(c.home[def.axis]));
    moving.forEach((c) => pivot.attach(c.mesh));
    this.animating = true;

    return new Promise((resolve) => {
      const start = performance.now();
      const dur = Math.max(1, durationMs * (Math.abs(quarters) === 2 ? 1.4 : 1));
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / dur);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
        pivot.quaternion.setFromAxisAngle(axis, angle * e);
        if (t < 1) {
          requestAnimationFrame(step);
          return;
        }
        moving.forEach((c) => {
          this.root.attach(c.mesh);
          c.mesh.position.set(...c.home);
          c.mesh.quaternion.identity();
        });
        this.root.remove(pivot);
        this.state = applyMove(this.state, move);
        this.applyColors();
        this.animating = false;
        resolve();
      };
      requestAnimationFrame(step);
    });
  }

  private installDrag() {
    const el = this.renderer.domElement;
    let last: { x: number; y: number } | null = null;
    el.addEventListener('pointerdown', (e) => {
      last = { x: e.clientX, y: e.clientY };
      this.dragging = true;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!last) return;
      this.dragOffset.x += (e.clientX - last.x) * 0.01;
      this.dragOffset.y += (e.clientY - last.y) * 0.01;
      this.dragOffset.x = Math.max(-1.6, Math.min(1.6, this.dragOffset.x));
      this.dragOffset.y = Math.max(-1.2, Math.min(1.2, this.dragOffset.y));
      last = { x: e.clientX, y: e.clientY };
    });
    const end = () => {
      last = null;
      this.dragging = false;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private tick() {
    // Drag lets you peek at hidden faces; releasing springs back to the reference view.
    const peek = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.dragOffset.y, this.dragOffset.x, 0, 'XYZ'));
    const target = peek.multiply(this.viewTarget);
    this.root.quaternion.slerp(target, 0.12);
    if (!this.dragging) {
      this.dragOffset.x *= 0.92;
      this.dragOffset.y *= 0.92;
    }
    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObs.disconnect();
    this.renderer.dispose();
  }
}
