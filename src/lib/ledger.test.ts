import { describe, expect, it } from "vitest";
import { completionOutcome, doneKey } from "./ledger";

describe("completionOutcome (§9)", () => {
  it("expected routines earn nothing", () => {
    expect(completionOutcome({ kind: "expected" }, true)).toEqual({ status: "done", points: 0 });
  });

  it("extras earn their points straight away when no approval is needed", () => {
    expect(completionOutcome({ kind: "extra", points: 20, needsApproval: false }, true)).toEqual({ status: "done", points: 20 });
  });

  it("extras that need approval wait for a parent and earn nothing yet", () => {
    expect(completionOutcome({ kind: "extra", points: 30, needsApproval: true }, true)).toEqual({ status: "pending", points: 0 });
  });

  it("an extra ticked without a member earns nothing and waits for nobody", () => {
    expect(completionOutcome({ kind: "extra", points: 25, needsApproval: true }, false)).toEqual({ status: "done", points: 0 });
    expect(completionOutcome({ kind: "extra", points: 25, needsApproval: false }, false)).toEqual({ status: "done", points: 0 });
  });

  it("keys items per day", () => {
    expect(doneKey("t1", "2026-10-07")).toBe("t1@2026-10-07");
  });
});
