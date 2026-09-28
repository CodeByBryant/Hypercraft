// Pool of generation workers with a bounded number of jobs in flight per worker.

import type { ColumnMsg, FromWorker, ToWorker } from './protocol';

export interface GenStats {
  done: number;
  errors: number;
  genMs: number;
  lightMs: number;
  packMs: number;
}

export class WorkerPool {
  private readonly workers: Worker[] = [];
  private readonly load: number[] = [];
  private readonly jobWorker = new Map<number, number>();
  private nextId = 1;
  readonly perWorker = 2;
  onColumn: ((msg: ColumnMsg) => void) | null = null;
  readonly stats: GenStats = { done: 0, errors: 0, genMs: 0, lightMs: 0, packMs: 0 };
  lastError = '';

  constructor(count: number, seed: number, realm: string, options: { garden?: boolean } = {}) {
    for (let i = 0; i < count; i++) {
      const w = new Worker(new URL('./genWorker.ts', import.meta.url), { type: 'module', name: `gen-${i}` });
      w.onmessage = (e: MessageEvent<FromWorker>) => this.handle(i, e.data);
      w.onerror = (e) => {
        this.lastError = e.message;
        console.error('worker error', e);
      };
      const init: ToWorker = { type: 'init', seed, realm, options };
      w.postMessage(init);
      this.workers.push(w);
      this.load.push(0);
    }
  }

  get size(): number {
    return this.workers.length;
  }

  inFlight(): number {
    return this.jobWorker.size;
  }

  capacity(): number {
    return this.workers.length * this.perWorker - this.jobWorker.size;
  }

  /** Submit a column job to the least loaded worker. Returns the job id or -1. */
  submit(cx: number, cz: number, cw: number): number {
    let best = -1;
    let bl = this.perWorker;
    for (let i = 0; i < this.load.length; i++) {
      if (this.load[i]! < bl) {
        bl = this.load[i]!;
        best = i;
      }
    }
    if (best < 0) return -1;
    const id = this.nextId++;
    this.load[best] = this.load[best]! + 1;
    this.jobWorker.set(id, best);
    const msg: ToWorker = { type: 'gen', id, cx, cz, cw };
    this.workers[best]!.postMessage(msg);
    return id;
  }

  private handle(worker: number, msg: FromWorker): void {
    if (msg.type === 'ready') return;
    const w = this.jobWorker.get(msg.id);
    if (w !== undefined) {
      this.jobWorker.delete(msg.id);
      this.load[w] = this.load[w]! - 1;
    } else {
      this.load[worker] = Math.max(0, this.load[worker]! - 1);
    }
    if (msg.type === 'error') {
      this.stats.errors++;
      this.lastError = msg.message;
      console.error('generation failed', msg.message);
      return;
    }
    const s = this.stats;
    s.done++;
    // exponential moving averages
    const k = s.done === 1 ? 1 : 0.05;
    s.genMs += (msg.times[0] - s.genMs) * k;
    s.lightMs += (msg.times[1] - s.lightMs) * k;
    s.packMs += (msg.times[2] - s.packMs) * k;
    this.onColumn?.(msg);
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers.length = 0;
    this.jobWorker.clear();
  }
}
