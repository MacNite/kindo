import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { HouseholdData } from "../types";
import { applyQueued, dequeue, enqueue, loadSnapshot, readQueue, saveSnapshot, type OfflineOp } from "./offline";

const base = {
  shoppingItems: [
    { id: "milk", listId: "g", name: "Milk", category: "dairy", done: false },
    { id: "bread", listId: "g", name: "Bread", category: "bakery", done: true },
  ],
} as unknown as HouseholdData;

describe("offline shopping (§19.7)", () => {
  it("re-applies queued changes on top of a snapshot", () => {
    const ops: OfflineOp[] = [
      { name: "addShoppingItem", input: { id: "eggs", listId: "g", name: "Eier" } },
      { name: "setShoppingDone", input: { id: "milk", done: true } },
      { name: "clearDoneShopping", input: { listId: "g" } },
    ];
    expect(applyQueued(base, ops).shoppingItems.map((i) => i.id)).toEqual(["eggs"]);
  });

  it("doesn't add an item twice when the snapshot already has it", () => {
    const op: OfflineOp = { name: "addShoppingItem", input: { id: "milk", listId: "g", name: "Milk" } };
    expect(applyQueued(base, [op]).shoppingItems).toHaveLength(2);
  });

  it("keeps the queue in order across page loads, and the last snapshot", async () => {
    await enqueue({ name: "setShoppingDone", input: { id: "a", done: true } });
    await enqueue({ name: "setShoppingDone", input: { id: "b", done: false } });
    const q = await readQueue();
    expect(q.map((x) => (x.op.input as { id: string }).id)).toEqual(["a", "b"]);
    await dequeue(q[0].key);
    expect((await readQueue()).map((x) => (x.op.input as { id: string }).id)).toEqual(["b"]);

    await saveSnapshot({ generatedAt: new Date(2026, 9, 7) } as never);
    expect((await loadSnapshot())?.generatedAt).toEqual(new Date(2026, 9, 7));
  });
});
