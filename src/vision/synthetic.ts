/**
 * Simulated webcam: a hidden scrambled cube rendered in perspective, turned and moved around the frame
 * the way a hand would, under a random colored light. Used for demos and development without a cube.
 */

import { Quaternion, Vector3 } from 'three';
import { FACES, Face, FaceletState } from '../cube/facelets';
import { Pose, poseFacing, renderCube } from './raster';

export class SyntheticSource {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private t0 = performance.now();
  private keys: Pose[];
  private tint: [number, number, number];
  private frame = 0;

  constructor(readonly state: FaceletState, order?: Face[], width = 480, height = 360, private holdMs = 1700, private moveMs = 900) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    order ??= [...FACES].sort(() => Math.random() - 0.5);
    const r = () => Math.random() - 0.5;
    this.keys = order.map((f) => poseFacing(f, [r() * 0.6, r() * 0.6, r() * 1.4], [r() * 3, r() * 2, 10 + Math.random() * 5]));
    // warm/cool light, sometimes strong
    const warm = Math.random();
    this.tint = warm > 0.5 ? [1, 0.82 + Math.random() * 0.1, 0.55 + Math.random() * 0.2] : [0.85, 0.92, 1];
  }

  private poseAt(t: number): Pose {
    const period = this.holdMs + this.moveMs;
    const i = Math.floor(t / period) % this.keys.length;
    const a = this.keys[i], b = this.keys[(i + 1) % this.keys.length];
    const phase = t % period;
    // gentle wobble while "holding", then a turn to the next face
    const wob = Math.sin(t / 300) * 0.06;
    const hold = new Quaternion().setFromAxisAngle(new Vector3(0.3, 1, 0).normalize(), wob).multiply(a.q);
    if (phase < this.holdMs) {
      const p = phase / this.holdMs;
      return { q: hold, t: a.t.clone().lerp(b.t, p * 0.15) };
    }
    const p = (phase - this.holdMs) / this.moveMs;
    const s = p * p * (3 - 2 * p);
    return { q: hold.clone().slerp(b.q, s), t: a.t.clone().lerp(b.t, 0.15 + 0.85 * s) };
  }

  render(): void {
    const pose = this.poseAt(performance.now() - this.t0);
    const img = renderCube(this.state, pose, {
      width: this.canvas.width,
      height: this.canvas.height,
      tint: this.tint,
      seed: ++this.frame,
    });
    this.ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  }
}
