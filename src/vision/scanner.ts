/**
 * Frame loop (DOM side): grabs frames from a video or canvas, downscales them, sends them to the
 * detection worker (dropping frames while it is busy, never queuing) and feeds the scan session.
 */

import type { DetectRequest, DetectResponse } from './detector.worker';
import { ScanSession, SessionEvent } from './session';
import { guideRect, GuideRect } from './guide';

export type DetectMode = 'auto' | 'guide';

export interface FrameInfo {
  width: number;
  height: number;
  mode: DetectMode;
  guide: GuideRect;
  faces: DetectResponse['faces'];
  progress: number[];
  candidates: { x: number; y: number }[];
  ms: number;
}

export interface ScannerEvents {
  onFrame?(info: FrameInfo): void;
  onEvent?(ev: SessionEvent): void;
}

type Drawable = CanvasImageSource & { width: number; height: number };

export class Scanner {
  readonly session = new ScanSession();
  mode: DetectMode = 'auto';
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private worker = new Worker(new URL('./detector.worker.ts', import.meta.url), { type: 'module' });
  private busy = false;
  private nextId = 1;
  private generation = 0;
  private lastProcess = 0;
  private frameIntervalMs = 1000 / 15;

  constructor(private events: ScannerEvents, private maxWidth = 640) {
    this.worker.onmessage = (ev: MessageEvent<DetectResponse>) => this.onResult(ev.data);
  }

  get captured() {
    return this.session.captured;
  }

  reset() {
    this.session.reset();
  }

  private onResult(r: DetectResponse) {
    this.busy = false;
    const evs = this.session.push(r.faces);
    this.events.onFrame?.({
      width: this.canvas.width,
      height: this.canvas.height,
      mode: this.mode,
      guide: guideRect(this.canvas.width, this.canvas.height),
      faces: r.faces,
      progress: this.session.lastProgress,
      candidates: r.candidates,
      ms: r.ms,
    });
    evs.forEach((e) => this.events.onEvent?.(e));
  }

  /** Grabs one frame (unmirrored) and sends it for detection, unless the worker is still busy. */
  processFrame(src: CanvasImageSource, srcW: number, srcH: number) {
    if (this.busy || !srcW || !srcH) return;
    const scale = Math.min(1, this.maxWidth / srcW);
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.drawImage(src, 0, 0, w, h);
    const img = this.ctx.getImageData(0, 0, w, h);
    this.busy = true;
    const msg: DetectRequest = { id: this.nextId++, width: w, height: h, buffer: img.data.buffer, mode: this.mode };
    this.worker.postMessage(msg, [img.data.buffer]);
  }

  /** Runs on a video (requestVideoFrameCallback: each camera frame once) or on a drawing callback. */
  run(source: { video?: HTMLVideoElement; draw?: () => Drawable }) {
    const gen = ++this.generation;
    const v = source.video;
    const useRvfc = !!v && 'requestVideoFrameCallback' in v;
    const schedule = () => (useRvfc ? v!.requestVideoFrameCallback(() => tick(performance.now())) : requestAnimationFrame(tick));
    const tick = (now: number) => {
      if (gen !== this.generation) return;
      if (now - this.lastProcess >= this.frameIntervalMs) {
        this.lastProcess = now;
        if (v) {
          if (v.readyState >= 2) this.processFrame(v, v.videoWidth, v.videoHeight);
        } else if (source.draw) {
          const c = source.draw();
          this.processFrame(c, c.width, c.height);
        }
      }
      schedule();
    };
    schedule();
  }

  stop() {
    this.generation++;
  }
}
