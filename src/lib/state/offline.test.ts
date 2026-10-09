import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { HouseholdData } from "../types";
import { applyQueued, dequeue, drainQueue, enqueue, loadSnapshot, readQueue, saveSnapshot, type OfflineOp } from "./offline";

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
    expect(applyQueued(base, [{ name: "deleteShoppingItem", input: { id: "milk" } }]).shoppingItems.map((i) => i.id)).toEqual(["bread"]);
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

  it("sends the queue in order, including what joins it meanwhile, and stops when the connection goes", async () => {
    const queue = ["a", "b"];
    const sentIds: string[] = [];
    const result = await drainQueue(() => queue[0], async (id) => {
      // A change made while the first one is on its way joins the end of the queue.
      if (id === "a") queue.push("c");
      if (id === "d") return { ok: false, error: "network" };
      sentIds.push(id);
      return { ok: true, data: undefined };
    }, (id) => {
      queue.splice(queue.indexOf(id), 1);
      if (id === "c") queue.push("d", "e");
    });
    expect(sentIds).toEqual(["a", "b", "c"]);
    expect(result).toBe("offline");
    expect(queue).toEqual(["d", "e"]);
  });

  it("drops an operation the server refused, and one that throws counts as offline", async () => {
    const queue = ["bad", "x"];
    const results: string[] = [];
    const send = async (id: string) => {
      if (id === "bad") return { ok: false as const, error: "invalid" };
      throw new Error("fetch failed");
    };
    expect(await drainQueue(() => queue[0], send, (id, r) => {
      queue.shift();
      results.push(`${id}:${r.ok}`);
    })).toBe("offline");
    expect(results).toEqual(["bad:false"]);
    expect(queue).toEqual(["x"]);
  });
});
