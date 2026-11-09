/// <reference lib="webworker" />
/** Runs face detection off the main thread so the UI and the video stay smooth. */
import { DetectedFace, detectFaces } from './detector';
import { readGuide } from './guide';

export interface DetectRequest {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  mode: 'auto' | 'guide';
}

export interface DetectResponse {
  id: number;
  faces: Omit<DetectedFace, 'H'>[];
  candidates: { x: number; y: number }[];
  ms: number;
}

self.onmessage = (ev: MessageEvent<DetectRequest>) => {
  const { id, width, height, buffer, mode } = ev.data;
  const t = performance.now();
  const img = { data: new Uint8ClampedArray(buffer), width, height };
  let faces: DetectedFace[] = [];
  let candidates: { x: number; y: number }[] = [];
  if (mode === 'guide') {
    const f = readGuide(img);
    if (f) faces = [f];
  } else {
    const r = detectFaces(img);
    faces = r.faces;
    candidates = r.candidates.map((c) => ({ x: c.x, y: c.y }));
  }
  const msg: DetectResponse = { id, faces: faces.map(({ H: _h, ...rest }) => rest), candidates, ms: performance.now() - t };
  (self as DedicatedWorkerGlobalScope).postMessage(msg);
};
