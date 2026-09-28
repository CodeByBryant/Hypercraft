// Adaptive internal resolution (R5). The ray marcher's cost scales with pixel count, so we
// steer the internal height between `min` and `max` to hold the target frame time. Uses the
// GPU timer when available (precise), otherwise the rAF frame interval. A manual override
// pins the height.

export const RES_STEPS = [180, 216, 240, 270, 300, 360, 420, 480, 540, 600, 720, 900, 1080, 1440];

export class ResolutionScaler {
  mode: 'auto' | 'fixed' = 'auto';
  fixedHeight = 360;
  targetMs = 1000 / 60;
  min = 216;
  max = 720;
  private idx = RES_STEPS.indexOf(360);
  private emaMs = 16;
  private lastChange = 0;
  private settleUntil = 0;

  current(canvasHeight: number): number {
    const h = this.mode === 'fixed' ? this.fixedHeight : RES_STEPS[this.idx]!;
    return Math.min(h, canvasHeight);
  }

  /**
   * Feed one frame's timing. `gpuMs` is <= 0 when no GPU timer is available.
   * Returns true if the resolution changed.
   */
  update(now: number, frameMs: number, gpuMs: number): boolean {
    if (this.mode === 'fixed') return false;
    const sample = gpuMs > 0 ? Math.max(gpuMs * 1.15, frameMs * 0.5) : frameMs;
    this.emaMs += (Math.min(sample, 100) - this.emaMs) * 0.08;
    if (now < this.settleUntil) return false;
    let minIdx = 0;
    while (minIdx < RES_STEPS.length - 1 && RES_STEPS[minIdx]! < this.min) minIdx++;
    let maxIdx = RES_STEPS.length - 1;
    while (maxIdx > 0 && RES_STEPS[maxIdx]! > this.max) maxIdx--;
    if (this.emaMs > this.targetMs * 1.12 && this.idx > minIdx) {
      this.idx--;
      this.changed(now);
      return true;
    }
    if (this.emaMs < this.targetMs * 0.72 && this.idx < maxIdx && now - this.lastChange > 1500) {
      this.idx++;
      this.changed(now);
      return true;
    }
    return false;
  }

  private changed(now: number): void {
    this.lastChange = now;
    this.settleUntil = now + 400;
  }

  get smoothedMs(): number {
    return this.emaMs;
  }
}
