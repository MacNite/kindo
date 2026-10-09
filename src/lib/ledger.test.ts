import { describe, expect, it } from "vitest";
import { completionOutcome, doneKey, routineStepValue } from "./ledger";

describe("completionOutcome (§9)", () => {
  it("items without a reward earn nothing", () => {
    expect(completionOutcome({ kind: "expected" }, true, "stars")).toEqual({ status: "done", points: 0 });
  });

  it("extras earn their points straight away when no approval is needed", () => {
    expect(completionOutcome({ kind: "extra", points: 20, needsApproval: false }, true, "stars")).toEqual({ status: "done", points: 20 });
  });

  it("extras that need approval wait for a parent and earn nothing yet", () => {
    expect(completionOutcome({ kind: "extra", points: 30, needsApproval: true }, true, "stars")).toEqual({ status: "pending", points: 0 });
  });

  it("an extra ticked without a member earns nothing and waits for nobody", () => {
    expect(completionOutcome({ kind: "extra", points: 25, needsApproval: true }, false, "stars")).toEqual({ status: "done", points: 0 });
    expect(completionOutcome({ kind: "extra", points: 25, needsApproval: false }, false, "stars")).toEqual({ status: "done", points: 0 });
  });

  it("nothing earns or waits for approval while the household has rewards off", () => {
    expect(completionOutcome({ kind: "extra", points: 30, needsApproval: true }, true, "off")).toEqual({ status: "done", points: 0 });
    expect(completionOutcome({ kind: "extra", points: 20, needsApproval: false }, true, "off")).toEqual({ status: "done", points: 0 });
    expect(completionOutcome({ kind: "extra", points: 30, needsApproval: true }, true, "money")).toEqual({ status: "pending", points: 0 });
  });

  it("keys items per day", () => {
    expect(doneKey("t1", "2026-10-07")).toBe("t1@2026-10-07");
  });
});

describe("routineStepValue (§9, D49)", () => {
  const on = { on: true, points: 5 };
  it("routine steps earn nothing while the child's routine rewards are off", () => {
    expect(routineStepValue({ kind: "expected" }, undefined, "stars")).toEqual({ kind: "expected" });
    expect(routineStepValue({ kind: "extra", points: 10, needsApproval: false }, { on: false, points: 5 }, "stars")).toEqual({ kind: "expected" });
  });

  it("nothing earns while the household has rewards switched off", () => {
    expect(routineStepValue({ kind: "expected" }, on, "off")).toEqual({ kind: "expected" });
  });

  it("a step earns the child's routine points, or its own, at once", () => {
    expect(routineStepValue({ kind: "expected" }, on, "stars")).toEqual({ kind: "extra", points: 5, needsApproval: false });
    expect(routineStepValue({ kind: "extra", points: 15, needsApproval: true }, on, "tokens")).toEqual({ kind: "extra", points: 15, needsApproval: false });
  });

  it("a step with 0 points of its own earns nothing", () => {
    expect(routineStepValue({ kind: "extra", points: 0, needsApproval: false }, on, "stars")).toEqual({ kind: "expected" });
  });
});
