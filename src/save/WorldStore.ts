// Persistent storage of worlds (IndexedDB): world metadata, edited columns per realm, and
// single-file export/import. Generated-but-untouched columns are never stored: they are
// regenerated from the seed.

import { openDb, reqP, txDone } from './Db';
import { compress, decompress } from './codec';
import { SAVE_VERSION, type WorldInfo } from './WorldInfo';

export function columnStoreKey(worldId: string, realm: string, cx: number, cz: number, cw: number): string {
  return `${worldId}/${realm}/${cx},${cz},${cw}`;
}

export class WorldStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(): Promise<WorldStore> {
    return new WorldStore(await openDb());
  }

  async listWorlds(): Promise<WorldInfo[]> {
    const t = this.db.transaction('worlds', 'readonly');
    const all = await reqP(t.objectStore('worlds').getAll() as IDBRequest<WorldInfo[]>);
    return all.sort((a, b) => b.lastPlayed - a.lastPlayed);
  }

  async getWorld(id: string): Promise<WorldInfo | null> {
    const t = this.db.transaction('worlds', 'readonly');
    return ((await reqP(t.objectStore('worlds').get(id))) as WorldInfo | undefined) ?? null;
  }

  async putWorld(info: WorldInfo): Promise<void> {
    const t = this.db.transaction('worlds', 'readwrite');
    t.objectStore('worlds').put(info);
    await txDone(t);
  }

  async deleteWorld(id: string): Promise<void> {
    const t = this.db.transaction(['worlds', 'columns'], 'readwrite');
    t.objectStore('worlds').delete(id);
    t.objectStore('columns').delete(IDBKeyRange.bound(`${id}/`, `${id}/￿`));
    await txDone(t);
  }

  /** Keys ("cx,cz,cw") of all saved columns of a realm. */
  async columnKeys(worldId: string, realm: string): Promise<Set<string>> {
    const t = this.db.transaction('columns', 'readonly');
    const prefix = `${worldId}/${realm}/`;
    const keys = (await reqP(t.objectStore('columns').getAllKeys(IDBKeyRange.bound(prefix, `${prefix}￿`)))) as string[];
    return new Set(keys.map((k) => k.slice(prefix.length)));
  }

  async loadColumn(worldId: string, realm: string, cx: number, cz: number, cw: number): Promise<Uint8Array | null> {
    const t = this.db.transaction('columns', 'readonly');
    const v = (await reqP(t.objectStore('columns').get(columnStoreKey(worldId, realm, cx, cz, cw)))) as ArrayBuffer | undefined;
    if (!v) return null;
    return decompress(new Uint8Array(v));
  }

  /** Save an already-serialized column (compressed here). */
  async saveColumn(worldId: string, realm: string, cx: number, cz: number, cw: number, raw: Uint8Array): Promise<void> {
    const packed = await compress(raw);
    const t = this.db.transaction('columns', 'readwrite');
    t.objectStore('columns').put(packed.buffer, columnStoreKey(worldId, realm, cx, cz, cw));
    await txDone(t);
  }

  /**
   * Export a world as one file: gzip( u32 headerLen | header JSON | u32 count |
   *   count x (u16 keyLen | key | u32 len | stored column bytes) ).
   */
  async exportWorld(id: string): Promise<Blob> {
    const info = await this.getWorld(id);
    if (!info) throw new Error('world not found');
    const t = this.db.transaction('columns', 'readonly');
    const store = t.objectStore('columns');
    const range = IDBKeyRange.bound(`${id}/`, `${id}/￿`);
    const keys = (await reqP(store.getAllKeys(range))) as string[];
    const vals = (await reqP(store.getAll(range))) as ArrayBuffer[];
    const enc = new TextEncoder();
    const header = enc.encode(JSON.stringify({ format: 'hypercraft-world', version: SAVE_VERSION, info }));
    const parts: Uint8Array[] = [];
    const u32 = (v: number) => {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setUint32(0, v, true);
      return b;
    };
    parts.push(u32(header.length), header, u32(keys.length));
    keys.forEach((k, i) => {
      const kb = enc.encode(k.slice(id.length + 1)); // strip world id
      const lb = new Uint8Array(2);
      new DataView(lb.buffer).setUint16(0, kb.length, true);
      const v = new Uint8Array(vals[i]!);
      parts.push(lb, kb, u32(v.length), v);
    });
    let total = 0;
    for (const p of parts) total += p.length;
    const all = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      all.set(p, o);
      o += p.length;
    }
    return new Blob([(await compress(all)) as BlobPart], { type: 'application/octet-stream' });
  }

  /** Import an exported world under a fresh id; returns its info. */
  async importWorld(file: Blob, newId: string): Promise<WorldInfo> {
    const bytes = await decompress(new Uint8Array(await file.arrayBuffer()));
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dec = new TextDecoder();
    let o = 0;
    const hl = dv.getUint32(o, true);
    o += 4;
    const header = JSON.parse(dec.decode(bytes.subarray(o, o + hl))) as { format: string; info: WorldInfo };
    o += hl;
    if (header.format !== 'hypercraft-world') throw new Error('not a HYPERCRAFT world file');
    const info: WorldInfo = { ...header.info, id: newId, name: `${header.info.name} (imported)`, lastPlayed: Date.now() };
    const count = dv.getUint32(o, true);
    o += 4;
    const t = this.db.transaction(['worlds', 'columns'], 'readwrite');
    const cs = t.objectStore('columns');
    for (let i = 0; i < count; i++) {
      const kl = dv.getUint16(o, true);
      o += 2;
      const key = dec.decode(bytes.subarray(o, o + kl));
      o += kl;
      const len = dv.getUint32(o, true);
      o += 4;
      cs.put(bytes.slice(o, o + len).buffer, `${newId}/${key}`);
      o += len;
    }
    t.objectStore('worlds').put(info);
    await txDone(t);
    return info;
  }
}
