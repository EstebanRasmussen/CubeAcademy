/// <reference lib="webworker" />
import { initKociemba, kociembaSolve } from './kociemba';
import { kociembaSetupFor } from '../algs/setup';
import type { PatternKind } from '../algs/pattern';
import { formatAlg } from '../cube/notation';

export type WorkerRequest =
  | { type: 'init' }
  | { type: 'setup'; id: number; state: string; alg: string; kind: PatternKind; budgetMs: number };

export type WorkerResponse =
  | { type: 'ready'; ms: number }
  | { type: 'setup'; id: number; moves: string | null }
  | { type: 'error'; id?: number; message: string };

const post = (m: WorkerResponse) => (self as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      const t = performance.now();
      initKociemba();
      post({ type: 'ready', ms: performance.now() - t });
    } else if (msg.type === 'setup') {
      const r = kociembaSetupFor(msg.state, msg.kind, msg.alg, kociembaSolve, { budgetMs: msg.budgetMs });
      post({ type: 'setup', id: msg.id, moves: r ? formatAlg(r.moves) : null });
    }
  } catch (e) {
    post({ type: 'error', id: 'id' in msg ? msg.id : undefined, message: String(e) });
  }
};
