// Per-session save glue: serves saved columns to the Streamer, saves dirty columns when they
// unload and on autosave, and writes the world metadata (player state etc.).

import { REG } from '../content/registry';
import type { Column, World } from '../world/World';
import type { ColumnSource } from '../world/Streamer';
import { buildRemap, deserializeColumn, serializeColumn } from './codec';
import type { WorldInfo } from './WorldInfo';
import type { WorldStore } from './WorldStore';

export class Persistence implements ColumnSource {
  private saved: Set<string>;
  private readonly remap: Int32Array | null;
  private readonly inFlight = new Set<Promise<void>>();
  savedCount = 0;
  lastSave = 0;
  lastError = '';

  private constructor(
    readonly store: WorldStore,
    readonly info: WorldInfo,
    public realm: string,
    saved: Set<string>,
  ) {
    this.saved = saved;
    const names = REG.blocks.map((b) => b.name);
    this.remap = info.palette.length ? buildRemap(info.palette, names, (n) => REG.id(n)) : null;
  }

  static async open(store: WorldStore, info: WorldInfo, realm: string): Promise<Persistence> {
    return new Persistence(store, info, realm, await store.columnKeys(info.id, realm));
  }

  /** Switch realm (Phase 6+): reload the saved-key set. */
  async setRealm(realm: string): Promise<void> {
    await this.flush();
    this.realm = realm;
    this.saved = await this.store.columnKeys(this.info.id, realm);
  }

  has(cx: number, cz: number, cw: number): boolean {
    return this.saved.has(`${cx},${cz},${cw}`);
  }

  async load(cx: number, cz: number, cw: number): Promise<Column | null> {
    const bytes = await this.store.loadColumn(this.info.id, this.realm, cx, cz, cw);
    if (!bytes) return null;
    const col = deserializeColumn(bytes, cx, cz, cw, this.remap);
    col.dirty = false;
    return col;
  }

  /** Save one column now (fire-and-forget safe). */
  saveColumn(col: Column): Promise<void> {
    if (!col.dirty) return Promise.resolve();
    col.dirty = false;
    const raw = serializeColumn(col);
    const key = `${col.cx},${col.cz},${col.cw}`;
    const p = this.store
      .saveColumn(this.info.id, this.realm, col.cx, col.cz, col.cw, raw)
      .then(() => {
        this.saved.add(key);
        this.savedCount++;
      })
      .catch((err: unknown) => {
        col.dirty = true;
        this.lastError = String(err);
        console.error('column save failed', err);
      })
      .finally(() => this.inFlight.delete(p));
    this.inFlight.add(p);
    return p;
  }

  saveDirty(world: World): void {
    for (const c of world.columns.values()) if (c.dirty) void this.saveColumn(c);
  }

  async saveMeta(): Promise<void> {
    this.info.lastPlayed = Date.now();
    this.info.palette = REG.blocks.map((b) => b.name);
    await this.store.putWorld(this.info);
    this.lastSave = Date.now();
  }

  async flush(): Promise<void> {
    await Promise.all([...this.inFlight]);
  }
}
