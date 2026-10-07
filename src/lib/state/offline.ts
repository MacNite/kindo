import type { HouseholdData, HouseholdWire, ShoppingItem } from "../types";
import { guessCategory } from "../shopping";

/**
 * Offline shopping (§10, §19.7, §20 D35). In a shop without signal the list
 * still opens (the service worker cached the page, this module the latest
 * household snapshot), and ticks and additions queue up on the device. Once
 * the connection is back the queue is sent in order. Every queued operation
 * is idempotent (§20 D18), so sending one twice does no harm.
 */
export type OfflineOp =
  | { name: "addShoppingItem"; input: { id: string; listId: string; name: string; memberId?: string } }
  | { name: "setShoppingDone"; input: { id: string; done: boolean } }
  | { name: "clearDoneShopping"; input: { listId: string } };

/** Applies queued operations to a snapshot, the same way the optimistic updates did. */
export function applyQueued(d: HouseholdData, ops: OfflineOp[]): HouseholdData {
  let items = d.shoppingItems;
  for (const op of ops) {
    if (op.name === "addShoppingItem") {
      if (items.some((i) => i.id === op.input.id)) continue;
      const item: ShoppingItem = { id: op.input.id, listId: op.input.listId, name: op.input.name, memberId: op.input.memberId, category: guessCategory(op.input.name, op.input.listId), done: false };
      items = [item, ...items];
    } else if (op.name === "setShoppingDone") {
      items = items.map((i) => (i.id === op.input.id ? { ...i, done: op.input.done } : i));
    } else {
      items = items.filter((i) => !(i.listId === op.input.listId && i.done));
    }
  }
  return items === d.shoppingItems ? d : { ...d, shoppingItems: items };
}

// ── IndexedDB ───────────────────────────────────────────────────────────────
const DB = "kindo";
const QUEUE = "queue";
const KV = "kv";

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(QUEUE, { autoIncrement: true });
      req.result.createObjectStore(KV);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then((db) => new Promise((resolve) => {
    if (!db) return resolve(undefined);
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      resolve(undefined);
    };
  }));
}

export const enqueue = (op: OfflineOp) => run(QUEUE, "readwrite", (s) => s.add(op));

/** The queue in the order it was made, with each entry's key for removal. */
export async function readQueue(): Promise<{ key: IDBValidKey; op: OfflineOp }[]> {
  const db = await open();
  if (!db) return [];
  return new Promise((resolve) => {
    const out: { key: IDBValidKey; op: OfflineOp }[] = [];
    const tx = db.transaction(QUEUE, "readonly");
    const req = tx.objectStore(QUEUE).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      out.push({ key: c.key, op: c.value as OfflineOp });
      c.continue();
    };
    tx.oncomplete = () => {
      db.close();
      resolve(out);
    };
    tx.onerror = () => {
      db.close();
      resolve(out);
    };
  });
}

export const dequeue = (key: IDBValidKey) => run(QUEUE, "readwrite", (s) => s.delete(key));

/** The latest snapshot this device saw, so a reload without a connection isn't stuck in the past. */
export const saveSnapshot = (w: HouseholdWire) => run(KV, "readwrite", (s) => s.put(w, "snapshot"));
export const loadSnapshot = () => run<HouseholdWire>(KV, "readonly", (s) => s.get("snapshot") as IDBRequest<HouseholdWire>);
