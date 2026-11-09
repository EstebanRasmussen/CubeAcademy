/** Promise API over the Kociemba worker. Initialization starts immediately in the background. */

import type { WorkerRequest, WorkerResponse } from './solver.worker';
import { Move, parseAlg } from '../cube/notation';
import type { PatternKind } from '../algs/pattern';

export class SolverClient {
  private worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<number, { resolve: (m: Move[] | null) => void; reject: (e: Error) => void }>();
  readonly ready: Promise<number>;

  constructor() {
    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const m = ev.data;
        if (m.type === 'ready') resolve(m.ms);
        else if (m.type === 'setup') {
          this.pending.get(m.id)?.resolve(m.moves === null ? null : parseAlg(m.moves));
          this.pending.delete(m.id);
        } else if (m.type === 'error') {
          if (m.id !== undefined) {
            this.pending.get(m.id)?.reject(new Error(m.message));
            this.pending.delete(m.id);
          } else reject(new Error(m.message));
        }
      };
      this.worker.onerror = (e) => reject(new Error(e.message));
    });
    this.send({ type: 'init' });
  }

  private send(m: WorkerRequest) {
    this.worker.postMessage(m);
  }

  async setup(state: string, alg: string, kind: PatternKind, budgetMs = 1500): Promise<Move[] | null> {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ type: 'setup', id, state, alg, kind, budgetMs });
    });
  }
}
